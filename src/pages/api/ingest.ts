import type { APIRoute } from 'astro';
import Anthropic from '@anthropic-ai/sdk';
import { env as cfEnv } from 'cloudflare:workers';
import { requireAdmin } from '../../lib/auth';
import {
  ARTIFACT_PRINCIPLE_NAMES, APPLICABLE_TIER_A_NAMES,
  PASS1_PROMPT_SINGLE, PASS1_PROMPT_MULTI, VECTOR_SCORING_PROMPT,
} from '../../lib/principles';
import { resolveModelConfig, streamModel, callModel } from '../../lib/model-router';
import { normalizeImage, dataUrlToBlob, IMAGE_SPEC } from '../../lib/image';
import { extractDocLayers } from '../../lib/doc-extract';
import { VECTOR_KEY, serializeVector } from '../../db/types';

export const prerender = false;

// ---------------------------------------------------------------------------
// Pass 1 system prompt — static, eligible for caching in a future A1 pass
// ---------------------------------------------------------------------------
const PASS1_SYSTEM = 'You have completed a close examination of this artifact. Report what you found.';

// ---------------------------------------------------------------------------
// POST /api/ingest
//
// Body: { images: [{data: string, label: string}], doc_raw?: string }
//
// SSE stream:
//   {type:"status", message}
//   {type:"pass1_delta", text}          — streaming Pass 1 text
//   {type:"pass1_complete", pass1}      — full Pass 1 text
//   {type:"complete", object_id?, ...}  — final result
//   {type:"error", error}
// ---------------------------------------------------------------------------

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const env = cfEnv as unknown as Record<string, any>;
  const apiKey = (env.ANTHROPIC_API_KEY as string | undefined) || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY is not set.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: any;
  try { body = await request.json(); }
  catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const { images, doc_raw = '', is_reference = 0, reference_tradition = null } = body;
  if (!images || !Array.isArray(images) || images.length === 0) {
    return new Response(JSON.stringify({ error: 'No images provided.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const supportedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  interface IngestImage { data: string; label: string; }

  type ParsedImage = { dataUrl: string; mimeType: string; label: string; safeLabel: string; ext: string };
  let parsed: ParsedImage[];
  try {
    parsed = (images as IngestImage[]).map((img) => {
      const mimeType = img.data.split(';')[0].split(':')[1];
      if (!supportedTypes.includes(mimeType)) throw new Error(`Unsupported image type: ${mimeType}`);
      const extMap: Record<string,string> = { 'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif' };
      return {
        dataUrl: img.data,
        mimeType,
        label: img.label || 'view',
        safeLabel: (img.label || 'view').toLowerCase().replace(/[^a-z0-9]/g, '-'),
        ext: extMap[mimeType] ?? 'jpg',
      };
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const modelConfig     = resolveModelConfig(env);
  const stabilityPasses = Math.max(1, parseInt(String(env.STABILITY_PASSES ?? '3'), 10) || 1);
  const anthropic       = new Anthropic({ apiKey });
  const db = env.DB;
  const r2 = env.ARTIFACTS;
  const encoder         = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      try {
        // ----------------------------------------------------------------
        // Track A — image-only path (no documentation touches this section)
        // ----------------------------------------------------------------

        send({ type: 'status', message: 'Track A — normalizing images…' });

        // Normalize each image to fixed spec (1568px long edge, JPEG q85)
        const normalized: Array<{ dataUrl: string; mimeType: string; label: string; safeLabel: string; normalized: boolean }> = [];
        for (const img of parsed) {
          const result = await normalizeImage(img.dataUrl);
          normalized.push({ ...result, label: img.label, safeLabel: img.safeLabel });
          if (!result.normalized) {
            send({ type: 'status', message: `⚠ Canvas API unavailable — using original for ${img.label}` });
          }
        }

        // Insert a placeholder object row to get the object_id for R2 keys
        let objectId: number | null = null;
        if (db) {
          const insertResult = await db
            .prepare(`INSERT INTO objects (image_spec, created_at, updated_at) VALUES (?, datetime('now'), datetime('now'))`)
            .bind(IMAGE_SPEC)
            .run();
          objectId = insertResult.meta?.last_row_id ?? null;
        }

        // Upload originals and normalized copies to R2
        const originalKeys: string[] = [];
        const analysisKeys: string[]  = [];

        if (r2 && objectId !== null) {
          send({ type: 'status', message: 'Track A — storing images…' });
          for (let i = 0; i < parsed.length; i++) {
            const img = parsed[i];
            const { bytes: origBytes, contentType: origType } = dataUrlToBlob(img.dataUrl);
            const origKey = `objects/${objectId}/${i}-${img.safeLabel}-original.${img.ext}`;
            await r2.put(origKey, origBytes, { httpMetadata: { contentType: origType } });
            originalKeys.push(origKey);

            const { bytes: normBytes, contentType: normType } = dataUrlToBlob(normalized[i].dataUrl);
            const normKey = `objects/${objectId}/${i}-${img.safeLabel}-analysis.jpg`;
            await r2.put(normKey, normBytes, { httpMetadata: { contentType: normType } });
            analysisKeys.push(normKey);
          }
        } else if (!r2) {
          send({ type: 'status', message: '⚠ R2 binding unavailable — images not stored (set up ARTIFACTS binding)' });
        }

        // Build image blocks for Pass 1 — use normalized copies, NO documentation
        const imageBlocks = normalized.flatMap(img => [
          { type: 'text' as const, text: `[${img.label}]` },
          {
            type: 'image' as const,
            source: {
              type: 'base64' as const,
              media_type: (img.mimeType === 'image/jpeg' ? 'image/jpeg' : img.mimeType) as any,
              data: img.dataUrl.split(',')[1],
            },
          },
        ]);

        const pass1Prompt = normalized.length === 1
          ? PASS1_PROMPT_SINGLE(ARTIFACT_PRINCIPLE_NAMES, APPLICABLE_TIER_A_NAMES)
          : PASS1_PROMPT_MULTI(normalized.length, ARTIFACT_PRINCIPLE_NAMES, APPLICABLE_TIER_A_NAMES);

        const pass1MsgParams = {
          max_tokens: 4096,
          system: PASS1_SYSTEM,
          messages: [{ role: 'user', content: [...imageBlocks, { type: 'text', text: pass1Prompt }] }],
        };

        // Extra Pass 1 runs start concurrently with the stream so they overlap
        const extraRunPromises: Promise<Anthropic.Message>[] = stabilityPasses > 1
          ? Array.from({ length: stabilityPasses - 1 }, () =>
              callModel(modelConfig.pass1, pass1MsgParams as any, anthropic)
            )
          : [];

        send({ type: 'status', message: stabilityPasses > 1
          ? `Track A — Pass 1 blind observation (${stabilityPasses} parallel runs)…`
          : 'Track A — Pass 1 blind observation…'
        });

        // Pass 1 run 1 — streams deltas to the client
        const pass1Stream = streamModel(modelConfig.pass1, pass1MsgParams as any, anthropic);

        for await (const event of pass1Stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            send({ type: 'pass1_delta', text: event.delta.text });
          }
        }

        const pass1Msg  = await pass1Stream.finalMessage();
        const pass1Text = pass1Msg.content
          .filter((b: any) => b.type === 'text')
          .map((b: any) => b.text)
          .join('\n\n');

        send({ type: 'pass1_complete', pass1: pass1Text });

        // Await extra runs (likely already done) then score all N in parallel
        const extraMsgs = await Promise.all(extraRunPromises);
        const allPass1Texts = [
          pass1Text,
          ...extraMsgs.map(msg =>
            msg.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n\n')
          ),
        ];
        const pass1Truncated = (
          pass1Msg.stop_reason === 'max_tokens' ||
          extraMsgs.some(m => m.stop_reason === 'max_tokens')
        ) ? 1 : 0;

        send({ type: 'status', message: stabilityPasses > 1
          ? `Track A — scoring fingerprint across ${stabilityPasses} passes…`
          : 'Track A — scoring fingerprint vector…'
        });

        let fingerprintVector: string | null = null;
        type StabilityMap = Record<string, { hits: number; total: number }>;
        const stabilityMap: StabilityMap = {};

        try {
          const scoreMsgs = await Promise.all(allPass1Texts.map(text =>
            callModel(modelConfig.vector, {
              max_tokens: 512,
              system: 'You are a scoring assistant. Output ONLY a flat JSON object. No markdown, no commentary. Begin with { and end with }.',
              messages: [{ role: 'user', content: [{ type: 'text', text: VECTOR_SCORING_PROMPT(text) }] }],
            }, anthropic)
          ));

          const allScores: Record<string, number>[] = scoreMsgs.map(msg => {
            try {
              let raw = msg.content
                .filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim()
                .replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
              const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
              if (s !== -1 && e > s) raw = raw.slice(s, e + 1);
              return JSON.parse(raw);
            } catch { return {}; }
          });

          fingerprintVector = serializeVector(allScores[0]);

          if (stabilityPasses > 1) {
            const threshold = Math.ceil(stabilityPasses / 2);
            for (const principleId of VECTOR_KEY) {
              const hits = allScores.filter(scores => (scores[principleId] ?? 0) > 0).length;
              if (hits > 0) stabilityMap[principleId] = { hits, total: stabilityPasses };
            }
            const stableCount    = Object.values(stabilityMap).filter(v => v.hits >= threshold).length;
            const borderlineCount = Object.values(stabilityMap).filter(v => v.hits < threshold).length;
            send({ type: 'status', message: `Stability: ${stableCount} high-confidence, ${borderlineCount} borderline` });
          }
        } catch (err) {
          send({ type: 'status', message: `⚠ Vector scoring failed: ${err instanceof Error ? err.message : String(err)}` });
        }

        // ----------------------------------------------------------------
        // Track B — documentation only (no images, no Pass 1 text)
        // ----------------------------------------------------------------

        let docRaw: string | null        = null;
        let docStructured: string | null  = null;
        let docCanonical: string | null   = null;
        let ezidArk: string | null        = null;
        let catalogNumber: string | null  = null;
        let accessionNumber: string | null = null;
        let attributionCulture: string | null     = null;
        let attributionConfidence: string | null  = null;
        let attributionNotes: string | null        = null;
        let sourceInstitution: string | null       = null;
        let sourceUrl: string | null               = null;

        const rawTrimmed = (doc_raw || '').trim();
        if (rawTrimmed) {
          send({ type: 'status', message: 'Track B — processing documentation…' });
          try {
            const layers = await extractDocLayers(rawTrimmed, anthropic, modelConfig.extraction.model);
            docRaw        = layers.raw;
            docStructured = JSON.stringify(layers.structured);
            docCanonical  = JSON.stringify(layers.canonical);
            ezidArk          = layers.canonical.ezid_ark;
            catalogNumber    = layers.canonical.catalog_number;
            accessionNumber  = layers.canonical.accession_number;
            attributionCulture    = layers.canonical.culture;
            attributionConfidence = layers.canonical.culture_confidence;
            attributionNotes      = layers.canonical.mapping_flags.length > 0
              ? layers.canonical.mapping_flags.join('; ')
              : null;
            sourceInstitution = layers.canonical.source_institution;
            sourceUrl         = layers.canonical.source_url;
          } catch (err) {
            send({ type: 'status', message: `⚠ Documentation extraction failed: ${err instanceof Error ? err.message : String(err)}` });
            docRaw = rawTrimmed;  // preserve raw even if AI extraction fails
          }
        }

        // ----------------------------------------------------------------
        // Write to D1
        // ----------------------------------------------------------------

        const fingerprintedAt = new Date().toISOString();

        if (db && objectId !== null) {
          send({ type: 'status', message: 'Saving to database…' });
          await db.prepare(`
            UPDATE objects SET
              ezid_ark                  = ?,
              catalog_number            = ?,
              accession_number          = ?,
              attribution_culture       = ?,
              attribution_confidence    = ?,
              attribution_mapping_notes = ?,
              doc_raw                   = ?,
              doc_structured            = ?,
              doc_canonical             = ?,
              source_institution        = ?,
              source_url                = ?,
              image_original_key        = ?,
              image_analysis_key        = ?,
              image_spec                = ?,
              fingerprint_vector        = ?,
              fingerprint_model         = ?,
              fingerprint_pass1_text    = ?,
              fingerprinted_at                = ?,
              fingerprint_stability_passes    = ?,
              fingerprint_stability_map       = ?,
              pass1_truncated                 = ?,
              is_reference                    = ?,
              reference_tradition             = ?,
              updated_at                      = datetime('now')
            WHERE id = ?
          `).bind(
            ezidArk, catalogNumber, accessionNumber,
            attributionCulture, attributionConfidence, attributionNotes,
            docRaw, docStructured, docCanonical,
            sourceInstitution, sourceUrl,
            originalKeys.join(',') || null,
            analysisKeys.join(',')  || null,
            IMAGE_SPEC,
            fingerprintVector,
            pass1Msg.model,
            pass1Text,
            fingerprintedAt,
            stabilityPasses,
            Object.keys(stabilityMap).length > 0 ? JSON.stringify(stabilityMap) : null,
            pass1Truncated,
            is_reference ? 1 : 0,
            is_reference ? (reference_tradition ?? null) : null,
            objectId,
          ).run();
        } else if (!db) {
          send({ type: 'status', message: '⚠ DB binding unavailable — run wrangler d1 create and apply migration' });
        }

        send({
          type: 'complete',
          success: true,
          object_id: objectId,
          fingerprint_vector: fingerprintVector ? JSON.parse(fingerprintVector) : null,
          fingerprint_keys: VECTOR_KEY,
          fingerprint_model: pass1Msg.model,
          fingerprint_stability_passes: stabilityPasses,
          fingerprint_stability_map: Object.keys(stabilityMap).length > 0 ? stabilityMap : null,
          doc_layers: {
            raw:        docRaw,
            structured: docStructured ? JSON.parse(docStructured) : null,
            canonical:  docCanonical  ? JSON.parse(docCanonical)  : null,
          },
          attribution_culture: attributionCulture,
          attribution_confidence: attributionConfidence,
          is_reference: is_reference ? 1 : 0,
          reference_tradition: is_reference ? (reference_tradition ?? null) : null,
          ezid_ark: ezidArk,
          catalog_number: catalogNumber,
          accession_number: accessionNumber,
          images_stored: objectId !== null && r2 ? { originals: originalKeys, analysis: analysisKeys } : null,
        });

      } catch (err) {
        try { send({ type: 'error', error: err instanceof Error ? err.message : String(err) }); }
        catch { /* controller may already be closed */ }
      } finally {
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
};
