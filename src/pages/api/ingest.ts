import type { APIRoute } from 'astro';
import Anthropic from '@anthropic-ai/sdk';
import { env as cfEnv } from 'cloudflare:workers';
import { requireAdmin } from '../../lib/auth';
import {
  ARTIFACT_PRINCIPLE_NAMES, APPLICABLE_TIER_A_NAMES,
  PASS1_PROMPT_SINGLE, PASS1_PROMPT_MULTI, VECTOR_SCORING_PROMPT,
  VECTOR_KEY_NAMES,
} from '../../lib/principles';
import {
  resolveModelConfig, streamModel, callModel,
  resolveStabilityConfigs, callModelNeutral,
  type NeutralRequest,
} from '../../lib/model-router';
import { normalizeImage, dataUrlToBlob, IMAGE_SPEC } from '../../lib/image';
import { extractDocLayers } from '../../lib/doc-extract';
import { VECTOR_KEY, serializeVector } from '../../db/types';

export const prerender = false;

// ---------------------------------------------------------------------------
// Pass 1 system prompt — static, eligible for caching in a future A1 pass
// ---------------------------------------------------------------------------
const PASS1_SYSTEM = 'You have completed a close examination of this artifact. Report what you found.';

// ---------------------------------------------------------------------------
// Step B synthesis classification — machine-readable per-principle corroboration
//
// Replaces freeform Stable/Thin/Contradicted prose as the source of truth. The
// synthesis LLM classifies specific claims per principle id instead of writing
// bullets it selects itself; any principle it doesn't return defaults to
// "unclassified" here, in code — not left ambiguous, and not conflated with
// "checked, and found nothing." The human-readable markdown is generated FROM
// this structured object, not the other way around.
// ---------------------------------------------------------------------------
type SynthesisTier = 'stable' | 'thin' | 'contradicted' | 'unclassified';
type SynthesisEntry = { tier: SynthesisTier; evidence: string };
type SynthesisClassification = Record<string, SynthesisEntry>;

function buildSynthesisClassificationPrompt(
  labeledRuns: Array<{ provider: string; run: number; text: string }>,
  stabilityPasses: number,
): string {
  const providersPresent = [...new Set(labeledRuns.map(r => r.provider))];
  const labeledBlock = labeledRuns
    .map(r => `--- ${r.provider.toUpperCase()}, Run ${r.run} ---\n${r.text}`)
    .join('\n\n');
  const principleReference = Object.entries(VECTOR_KEY_NAMES)
    .map(([id, name]) => `${id}: ${name}`)
    .join('\n');
  const stableThreshold = Math.min(2, providersPresent.length);

  return `You are classifying observation claims from ${labeledRuns.length} independent blind observations of the same artifact. These observations were produced by ${providersPresent.length} different AI model families (${providersPresent.join(', ')}), with ${stabilityPasses} runs each.

Your task: for each principle below, determine whether the observations contain a specific, checkable claim about it, and if so, classify how reliably that claim appeared across models and runs. Report only what the observations say — do not add your own visual readings. Omit a principle entirely if the observations don't discuss it or don't converge on anything specific enough to classify — do not force coverage of all principles.

OBSERVATION TEXTS:
${labeledBlock}

---

PRINCIPLES (id: name):
${principleReference}

---

TIER DEFINITIONS:
- "stable": the claim appears in the majority of runs AND in at least ${stableThreshold} of the ${providersPresent.length} model families. This is the reliable foundation for analysis.
- "thin": the claim appears in a majority of one model family's runs but is absent from others — a possible systematic model bias. Evidence must name which families agree and which are silent, in this format: "[claude 3/${stabilityPasses}; absent gemini, openai]".
- "contradicted": different model families actively disagree about the same feature. Evidence must state each reading with a source label, e.g. "claude → deep recessional space; gemini → compressed, shallow plane; openai → ambiguous".

OUTPUT FORMAT — a JSON array, one entry per principle you can classify:
[{ "principleId": "ap_4", "tier": "stable", "evidence": "Wear is concentrated centrally, while painted zones nearer the rim/walls retain denser, more intact pigment — reported in all 9 runs." }]

Rules:
- Only include a principle if a specific, checkable claim exists for it — omission means unclassified, don't force an entry
- Keep each evidence string specific and concrete — avoid summary language like "overall form is consistent across runs"
- Do not editorialize about which reading is more likely correct
- Output ONLY the JSON array. No markdown, no commentary, no preamble.`;
}

function parseSynthesisClassification(raw: string): SynthesisClassification {
  const classification: SynthesisClassification = {};
  for (const key of VECTOR_KEY) classification[key] = { tier: 'unclassified', evidence: '' };

  let text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  const s = text.indexOf('['), e = text.lastIndexOf(']');
  if (s !== -1 && e > s) text = text.slice(s, e + 1);

  const entries = JSON.parse(text) as Array<{ principleId: string; tier: string; evidence: string }>;
  for (const entry of entries) {
    if (
      (VECTOR_KEY as readonly string[]).includes(entry.principleId) &&
      (['stable', 'thin', 'contradicted'] as string[]).includes(entry.tier)
    ) {
      classification[entry.principleId] = { tier: entry.tier as SynthesisTier, evidence: String(entry.evidence ?? '') };
    }
  }
  return classification;
}

function renderSynthesisMarkdown(classification: SynthesisClassification): string {
  const section = (title: string, tier: SynthesisTier) => {
    const keys = VECTOR_KEY.filter(k => classification[k].tier === tier);
    const body = keys.length > 0
      ? keys.map(k => `- **${VECTOR_KEY_NAMES[k]}** — ${classification[k].evidence}`).join('\n')
      : 'None identified';
    return `## ${title}\n${body}`;
  };
  return [
    section('Stable observations', 'stable'),
    section('Thin observations', 'thin'),
    section('Contradicted observations', 'contradicted'),
  ].join('\n\n');
}

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
          max_tokens: 8000,
          system: PASS1_SYSTEM,
          messages: [{ role: 'user', content: [...imageBlocks, { type: 'text', text: pass1Prompt }] }],
        };

        // Neutral request shape for multi-provider runs — every image, matching Claude's native path
        const neutralPass1Req: NeutralRequest = {
          system: PASS1_SYSTEM,
          prompt: pass1Prompt,
          maxTokens: 8000,
          images: normalized.map(img => ({
            mediaType: img.mimeType,
            data: img.dataUrl.split(',')[1],
          })),
        };

        const stabilityCfgs  = resolveStabilityConfigs(env);
        const activeProviders = ['anthropic', 'gemini', 'openai'] as const;

        // Launch all non-primary runs concurrently before streaming so they overlap with Run 1
        // Claude runs 2+3 — silent concurrent
        const claudeSilentPromises = Array.from({ length: stabilityPasses - 1 }, () =>
          callModel(modelConfig.pass1, pass1MsgParams as any, anthropic).then(
            msg => msg.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n\n')
          ).catch(() => null as string | null)
        );

        // Gemini runs — silent concurrent (graceful: missing API key → null)
        const geminiPromises = Array.from({ length: stabilityPasses }, () =>
          callModelNeutral(stabilityCfgs.gemini, neutralPass1Req, env)
            .then(r => r.text)
            .catch(() => null as string | null)
        );

        // OpenAI runs — silent concurrent
        const openaiPromises = Array.from({ length: stabilityPasses }, () =>
          callModelNeutral(stabilityCfgs.openai, neutralPass1Req, env)
            .then(r => r.text)
            .catch(() => null as string | null)
        );

        const totalProviderRuns = stabilityPasses + stabilityCfgs.gemini.model ? stabilityPasses : 0;
        send({ type: 'status', message: `Track A — Pass 1 blind observation (${activeProviders.length} providers × ${stabilityPasses} runs)…` });

        // Claude run 1 — streams live to client
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

        // Collect all runs — Claude silent runs, Gemini, OpenAI
        const [claudeSilentResults, geminiResults, openaiResults] = await Promise.all([
          Promise.all(claudeSilentPromises),
          Promise.all(geminiPromises),
          Promise.all(openaiPromises),
        ]);

        const pass1Truncated = pass1Msg.stop_reason === 'max_tokens' ? 1 : 0;

        // Build labeled run list for storage and synthesis
        // images_sent is taken from the actual request payload (normalized.length), not
        // inferred from the model's self-reported text — that inference is exactly what
        // made the single-image regression hard to catch the first time.
        type LabeledRun = { provider: string; run: number; text: string; images_sent: number };
        const labeledRuns: LabeledRun[] = [
          { provider: 'claude', run: 1, text: pass1Text, images_sent: normalized.length },
          ...claudeSilentResults.filter((t): t is string => t !== null).map((text, i) => ({
            provider: 'claude', run: i + 2, text, images_sent: normalized.length,
          })),
          ...geminiResults.filter((t): t is string => t !== null).map((text, i) => ({
            provider: 'gemini', run: i + 1, text, images_sent: normalized.length,
          })),
          ...openaiResults.filter((t): t is string => t !== null).map((text, i) => ({
            provider: 'openai', run: i + 1, text, images_sent: normalized.length,
          })),
        ];

        const allPass1Texts = labeledRuns.map(r => r.text);

        const providerCounts: Record<string, number> = {};
        for (const r of labeledRuns) providerCounts[r.provider] = (providerCounts[r.provider] ?? 0) + 1;
        const providerSummary = Object.entries(providerCounts).map(([p, n]) => `${p} ×${n}`).join(', ');
        send({ type: 'status', message: `Track A — collected ${labeledRuns.length} observations (${providerSummary})` });

        // ----------------------------------------------------------------
        // Fingerprint vector — score all runs, take Run 1 (Claude) scores
        // ----------------------------------------------------------------
        send({ type: 'status', message: `Track A — scoring fingerprint across ${labeledRuns.length} passes…` });

        let fingerprintVector: string | null = null;
        type StabilityMap = Record<string, { hits: number; total: number }>;
        const stabilityMap: StabilityMap = {};

        try {
          const scoreMsgs = await Promise.all(allPass1Texts.map(text =>
            callModel(modelConfig.vector, {
              max_tokens: 8000,
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

          const threshold = Math.ceil(allPass1Texts.length / 2);
          for (const principleId of VECTOR_KEY) {
            const hits = allScores.filter(scores => (scores[principleId] ?? 0) > 0).length;
            if (hits > 0) stabilityMap[principleId] = { hits, total: allPass1Texts.length };
          }
          const stableCount     = Object.values(stabilityMap).filter(v => v.hits >= threshold).length;
          const borderlineCount = Object.values(stabilityMap).filter(v => v.hits < threshold).length;
          send({ type: 'status', message: `Stability: ${stableCount} high-confidence, ${borderlineCount} borderline across ${labeledRuns.length} runs` });
        } catch (err) {
          send({ type: 'status', message: `⚠ Vector scoring failed: ${err instanceof Error ? err.message : String(err)}` });
        }

        // ----------------------------------------------------------------
        // Synthesis — structured per-principle corroboration classification
        // ----------------------------------------------------------------
        let pass1Synthesized: string | null = null;
        let synthesisClassification: SynthesisClassification | null = null;
        let synthesisTruncated = 0;

        if (labeledRuns.length > 1) {
          send({ type: 'status', message: 'Track A — synthesizing cross-model observations…' });
          try {
            const synthesisMsg = await callModel(modelConfig.pass1, {
              max_tokens: 16000,
              system: 'You are classifying multiple independent visual observations. Output ONLY the JSON array requested. Report only what the observations contain — do not add your own visual readings.',
              messages: [{ role: 'user', content: [{ type: 'text', text: buildSynthesisClassificationPrompt(labeledRuns, stabilityPasses) }] }],
            }, anthropic);

            const rawSynthesisText = synthesisMsg.content
              .filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');

            synthesisTruncated = synthesisMsg.stop_reason === 'max_tokens' ? 1 : 0;
            if (synthesisTruncated) {
              send({ type: 'status', message: `⚠ Synthesis truncated (stop_reason: max_tokens)` });
            }

            try {
              synthesisClassification = parseSynthesisClassification(rawSynthesisText);
            } catch (parseErr) {
              send({ type: 'status', message: `⚠ Synthesis JSON parse failed: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}` });
              synthesisClassification = null;
            }

            if (synthesisClassification) {
              pass1Synthesized = renderSynthesisMarkdown(synthesisClassification);
              const counts = VECTOR_KEY.reduce(
                (acc, k) => { acc[synthesisClassification![k].tier]++; return acc; },
                { stable: 0, thin: 0, contradicted: 0, unclassified: 0 } as Record<SynthesisTier, number>,
              );
              send({ type: 'status', message: `Track A — synthesis complete (${counts.stable} stable, ${counts.thin} thin, ${counts.contradicted} contradicted)` });
            }
          } catch (err) {
            send({ type: 'status', message: `⚠ Synthesis failed: ${err instanceof Error ? err.message : String(err)}` });
          }
        }

        // ----------------------------------------------------------------
        // Save Track A results now, before Track B runs. Track B (doc
        // extraction) has its own failure modes, including ones that abort
        // the request outright — a completed blind fingerprint must not be
        // lost because the unrelated documentation step failed afterward.
        // ----------------------------------------------------------------

        const fingerprintedAt = new Date().toISOString();

        if (db && objectId !== null) {
          send({ type: 'status', message: 'Saving fingerprint…' });
          await db.prepare(`
            UPDATE objects SET
              image_original_key           = ?,
              image_analysis_key           = ?,
              image_spec                   = ?,
              fingerprint_vector           = ?,
              fingerprint_model            = ?,
              fingerprint_pass1_text       = ?,
              fingerprint_stability_runs   = ?,
              fingerprint_pass1_synthesized = ?,
              fingerprinted_at             = ?,
              fingerprint_stability_passes = ?,
              fingerprint_stability_map    = ?,
              pass1_truncated              = ?,
              fingerprint_synthesis_truncated = ?,
              fingerprint_synthesis_classification = ?,
              is_reference                 = ?,
              reference_tradition          = ?,
              updated_at                   = datetime('now')
            WHERE id = ?
          `).bind(
            originalKeys.join(',') || null,
            analysisKeys.join(',')  || null,
            IMAGE_SPEC,
            fingerprintVector,
            pass1Msg.model,
            pass1Text,
            labeledRuns.length > 0 ? JSON.stringify(labeledRuns.map(r => ({ provider: r.provider, run: r.run, text: r.text, images_sent: r.images_sent }))) : null,
            pass1Synthesized,
            fingerprintedAt,
            labeledRuns.length,
            Object.keys(stabilityMap).length > 0 ? JSON.stringify(stabilityMap) : null,
            pass1Truncated,
            synthesisTruncated,
            synthesisClassification ? JSON.stringify(synthesisClassification) : null,
            is_reference ? 1 : 0,
            is_reference ? (reference_tradition ?? null) : null,
            objectId,
          ).run();
        } else if (!db) {
          send({ type: 'status', message: '⚠ DB binding unavailable — run wrangler d1 create and apply migration' });
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
        // Write Track B (documentation) fields
        // ----------------------------------------------------------------

        if (db && objectId !== null) {
          send({ type: 'status', message: 'Saving documentation…' });
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
              updated_at                = datetime('now')
            WHERE id = ?
          `).bind(
            ezidArk, catalogNumber, accessionNumber,
            attributionCulture, attributionConfidence, attributionNotes,
            docRaw, docStructured, docCanonical,
            sourceInstitution, sourceUrl,
            objectId,
          ).run();

          // Upsert FTS entry with all searchable fields
          await db.batch([
            db.prepare('DELETE FROM objects_fts WHERE rowid = ?').bind(objectId),
            db.prepare(`
              INSERT INTO objects_fts(rowid, object_id, catalog_number, accession_number, attribution_culture, source_institution, fingerprint_pass1_text, fingerprint_pass1_synthesized)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
              objectId, objectId,
              catalogNumber, accessionNumber,
              attributionCulture, sourceInstitution,
              pass1Text, pass1Synthesized ?? null,
            ),
          ]);
        }

        send({
          type: 'complete',
          success: true,
          object_id: objectId,
          fingerprint_vector: fingerprintVector ? JSON.parse(fingerprintVector) : null,
          fingerprint_keys: VECTOR_KEY,
          fingerprint_model: pass1Msg.model,
          fingerprint_stability_passes: labeledRuns.length,
          fingerprint_stability_map: Object.keys(stabilityMap).length > 0 ? stabilityMap : null,
          fingerprint_stability_runs: labeledRuns.length,
          fingerprint_pass1_synthesized: pass1Synthesized ? true : false,
          fingerprint_synthesis_classification: synthesisClassification,
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
