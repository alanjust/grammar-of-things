import type { APIRoute } from 'astro';
import Anthropic from '@anthropic-ai/sdk';
import { env as cfEnv } from 'cloudflare:workers';
import { requireAdmin } from '../../lib/auth';
import { detectMimeFromBytes } from '../../lib/image';
import { PROVENANCE_INTEGRITY_PROMPT, CONTRADICTION_DETECTION_PROMPT } from '../../lib/authenticity';
import { VECTOR_SCORING_PROMPT } from '../../lib/principles';
import { resolveModelConfig, streamModel, callModel } from '../../lib/model-router';
import { VECTOR_KEY, serializeVector, type DocCanonical } from '../../db/types';
import { buildSearchQuery, retrievePassages, formatReferences } from '../../lib/retrieval';
import {
  EXTRACTION_PROMPT, COMPETENCY_PROMPT, CONNECTIONS_COMPETENCY_PROMPT,
  PASS2_SYSTEM_ARTIFACT, PASS2_SYSTEM_CONNECTIONS,
  buildArtifactPass2UserText, buildConnectionsPass2UserText,
  buildArtifactContext,
} from './artifact';

export const prerender = false;

// ---------------------------------------------------------------------------
// Fingerprint vs. attribution comparison
// ---------------------------------------------------------------------------

// Maps doc_canonical fields to the fields Record used by buildArtifactContext.
function canonicalToFields(canonical: DocCanonical): Record<string, string> {
  const f: Record<string, string> = {};
  if (canonical.culture)           f.culture    = canonical.culture;
  if (canonical.period)            f.period     = canonical.period;
  if (canonical.object_type)       f.objectType = canonical.object_type;
  if (canonical.material)          f.material   = canonical.material;
  if (canonical.dimensions)        f.dimensions = canonical.dimensions;
  if (canonical.site)              f.site       = canonical.site;
  if (canonical.collection)        f.collection = canonical.collection;
  if (canonical.condition)         f.condition  = canonical.condition;
  if (canonical.notes)             f.notes      = canonical.notes;
  return f;
}

// Prompt for the fingerprint-vs-attribution comparison (Haiku-class, cheap).
// Returns a structured JSON flag — alignment, strength, reasoning, caveats.
// Never asserts attribution conclusions; surfaces divergence as a research flag only.
const FINGERPRINT_COMPARISON_PROMPT = (
  vectorJson: string,
  culture: string,
  confidence: string,
): string => {
  const scores: number[] = JSON.parse(vectorJson);
  const named = VECTOR_KEY.map((k, i) => `${k}: ${scores[i] ?? 0}`).join(', ');

  return `A blind perceptual fingerprint was computed from an artifact image alone — no cultural documentation was available during that step.

BLIND FINGERPRINT (27 principles scored 0–3, image only):
${named}

DOCUMENTED ATTRIBUTION: ${culture} (confidence: ${confidence || 'unknown'})

This is a PROVISIONAL HEURISTIC NOTE, not a validated comparison. No reference corpus of scored fingerprints exists for any tradition yet, so there is NO measured baseline distribution to compare against — do not imply that one exists. Treat your judgment as a loose qualitative impression that raises questions for a human reviewer, never as a finding.

Output ONLY valid JSON — no markdown, no commentary:
{
  "alignment": "aligned | divergent | inconclusive",
  "flag_strength": "strong | moderate | weak | none",
  "reasoning": "<2–3 sentences phrased as open questions rather than conclusions: which scores a human might want to look at, and why>",
  "caveats": "<1 sentence — MUST state plainly that this is not a validated comparison and that no corpus baseline exists yet>"
}

Rules:
- You have NO validated baseline for the claimed tradition. Base the note only on general perceptual plausibility, and acknowledge that limit.
- Use "divergent" only to flag — never to conclude — at least two scores a human might want to examine more closely.
- "inconclusive" is the appropriate default when the scores alone say little.
- Never assert authenticity, inauthenticity, misattribution, or that the fingerprint "matches" or "contradicts" the attribution.
- "flag_strength: none" is valid and expected for most objects.`;
};

// ---------------------------------------------------------------------------
// Image loading from R2
// ---------------------------------------------------------------------------

async function loadImageFromR2(r2: any, key: string): Promise<string | null> {
  try {
    const obj = await r2.get(key);
    if (!obj) return null;
    const buffer = await obj.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunk = 8192;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
    }
    const declared: string = obj.httpMetadata?.contentType ?? 'image/jpeg';
    const contentType = detectMimeFromBytes(bytes) ?? declared;
    return `data:${contentType};base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// POST /api/analyze
//
// Body: { object_id: number, mode?: "artifact"|"connections", audience?: string }
//
// SSE stream matches the shape of /api/ingest and /api/artifact.
// ---------------------------------------------------------------------------

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const env = cfEnv as unknown as Record<string, any>;
  const apiKey = env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
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

  const { object_id, mode = 'artifact', audience = 'researcher' } = body;
  if (!object_id || typeof object_id !== 'number') {
    return new Response(JSON.stringify({ error: 'object_id (number) is required.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const db = env.DB;
  const r2 = env.ARTIFACTS;
  const modelConfig = resolveModelConfig(env);
  const anthropic   = new Anthropic({ apiKey });
  const encoder     = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      try {
        // ----------------------------------------------------------------
        // Load object from D1
        // ----------------------------------------------------------------
        send({ type: 'status', message: 'Loading object…' });

        if (!db) {
          send({ type: 'error', error: 'DB binding unavailable — configure the D1 binding.' });
          controller.close();
          return;
        }

        const object = await db
          .prepare('SELECT * FROM objects WHERE id = ?')
          .bind(object_id)
          .first();

        if (!object) {
          send({ type: 'error', error: `Object ${object_id} not found.` });
          controller.close();
          return;
        }
        if (!object.fingerprint_pass1_text) {
          send({ type: 'error', error: `Object ${object_id} has no fingerprint — run ingestion first.` });
          controller.close();
          return;
        }
        if (!object.image_analysis_key) {
          send({ type: 'error', error: `Object ${object_id} has no stored analysis image.` });
          controller.close();
          return;
        }

        // ----------------------------------------------------------------
        // Load analysis image(s) from R2
        // ----------------------------------------------------------------
        send({ type: 'status', message: 'Loading images from storage…' });

        if (!r2) {
          send({ type: 'error', error: 'ARTIFACTS R2 binding unavailable — configure the R2 binding.' });
          controller.close();
          return;
        }

        const imageKeys: string[] = (object.image_analysis_key as string).split(',').filter(Boolean);
        const imageBlocks: Array<{ type: 'text'; text: string } | { type: 'image'; source: any }> = [];

        for (const key of imageKeys) {
          const label = key.split('/').pop()?.replace(/-analysis\.jpg$/, '') ?? 'view';
          const dataUrl = await loadImageFromR2(r2, key);
          if (!dataUrl) {
            send({ type: 'status', message: `⚠ Could not load image ${key} — skipping` });
            continue;
          }
          const mimeType = dataUrl.split(';')[0].split(':')[1];
          imageBlocks.push({ type: 'text', text: `[${label}]` });
          imageBlocks.push({
            type: 'image',
            source: { type: 'base64', media_type: mimeType, data: dataUrl.split(',')[1] },
          });
        }

        if (imageBlocks.length === 0) {
          send({ type: 'error', error: 'No images could be loaded from storage.' });
          controller.close();
          return;
        }

        // ----------------------------------------------------------------
        // Build documentation context (Track B output, now available)
        // ----------------------------------------------------------------
        const pass1Text = (object.fingerprint_pass1_synthesized || object.fingerprint_pass1_text) as string;
        const viewLabels: string[] = imageKeys.map(k =>
          k.split('/').pop()?.replace(/-analysis\.jpg$/, '') ?? 'view'
        );

        let docFields: Record<string, string> = {};
        if (object.doc_canonical) {
          try {
            const canonical: DocCanonical = JSON.parse(object.doc_canonical as string);
            docFields = canonicalToFields(canonical);
          } catch { /* doc_canonical parse failed — continue without context */ }
        }

        const isConnections = mode === 'connections';

        // ----------------------------------------------------------------
        // Pass 2 — analysis (documentation available as context here)
        // ----------------------------------------------------------------
        const pass2StatusMsg = isConnections
          ? 'Pass 2 — cultural connections…'
          : audience.includes('curator') ? 'Pass 2 — curatorial analysis…'
          : audience.includes('educator') ? 'Pass 2 — teaching context…'
          : 'Pass 2 — artifact analysis…';
        send({ type: 'status', message: pass2StatusMsg });

        // Retrieve reference passages from document library (silent — empty string if library is empty)
        const refQuery    = buildSearchQuery(object.attribution_culture as string | null, pass1Text);
        const passages    = await retrievePassages(db, refQuery, 5);
        const refBlock    = formatReferences(passages);
        if (passages.length > 0) send({ type: 'status', message: `Retrieved ${passages.length} reference passage${passages.length > 1 ? 's' : ''} from library` });

        const pass2UserText = isConnections
          ? buildConnectionsPass2UserText(pass1Text, docFields, audience, viewLabels) + refBlock
          : buildArtifactPass2UserText(pass1Text, docFields, audience, viewLabels) + refBlock;

        const pass2Stream = streamModel(modelConfig.pass2, {
          max_tokens: 8000,
          system: isConnections ? PASS2_SYSTEM_CONNECTIONS : PASS2_SYSTEM_ARTIFACT,
          messages: [{ role: 'user', content: [{ type: 'text', text: pass2UserText }] }],
        }, anthropic);

        for await (const event of pass2Stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            send({ type: 'delta', text: event.delta.text });
          }
        }

        const pass2Msg  = await pass2Stream.finalMessage();
        const pass2Text = pass2Msg.content
          .filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n\n');
        const pass2CacheRead = (pass2Msg.usage as any).cache_read_input_tokens ?? 0;
        const pass2Truncated = pass2Msg.stop_reason === 'max_tokens' ? 1 : 0;
        if (pass2Truncated) send({ type: 'status', message: '⚠ Pass 2 reached token limit — analysis may be incomplete' });

        // ----------------------------------------------------------------
        // Pass 3 — competency / takeaway
        // ----------------------------------------------------------------
        send({ type: 'status', message: 'Pass 3 — what to take forward…' });

        const pass3PromptText = isConnections
          ? CONNECTIONS_COMPETENCY_PROMPT(pass1Text, pass2Text, audience)
          : COMPETENCY_PROMPT(pass1Text, pass2Text, audience);

        const pass3Msg = await callModel(modelConfig.pass3, {
          max_tokens: 8000,
          system: 'You are an educator writing for someone curious and smart who wants to understand how to look at artifacts. Write the way Ira Glass tells a story: open with something concrete and recognizable, move toward the insight, land it plainly. If you use a technical term, follow it immediately with plain English. The goal is to leave the reader thinking "I can do that next time." Do not use fine art vocabulary: no aesthetic, painterly, compositional tension, formal innovation, artistic achievement, or language from museum wall text or gallery criticism. Do not frame the object as made for contemplation or visual pleasure. Takeaways must be grounded in what the material evidence showed — what the production traces revealed, what the design system did, what the cultural context made legible. The habits you identify should be habits of looking at physical evidence, not habits of aesthetic appreciation.',
          messages: [{ role: 'user', content: [...imageBlocks, { type: 'text', text: pass3PromptText }] }],
        }, anthropic);

        const pass3Text = pass3Msg.content
          .filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n\n');
        const pass3Truncated = pass3Msg.stop_reason === 'max_tokens' ? 1 : 0;
        if (pass3Truncated) send({ type: 'status', message: '⚠ Pass 3 reached token limit — takeaway may be incomplete' });

        // ----------------------------------------------------------------
        // Pass 4 — extraction + analysis vector (parallel)
        // ----------------------------------------------------------------
        send({ type: 'status', message: 'Pass 4 — extraction and vector scoring…' });

        let structuredRecord: any = null;
        let analysisVector: string | null = null;
        let vectorNote: string | null = null;
        let extractionModelUsed: string | null = null;
        let vectorModelUsed: string | null = null;
        let provenanceFlags: any[] = [];
        let contradictionFlags: any[] = [];

        try {
          const [extractionResult, vectorResult, provenanceResult, contradictionResult] = await Promise.allSettled([
            callModel(modelConfig.extraction, {
              max_tokens: 16000,
              system: 'You are a data extraction assistant. Extract structured data from artifact analysis text and output ONLY valid JSON. No markdown fences, no commentary, no extra text. Begin your response with { and end with }.',
              messages: [{ role: 'user', content: [{ type: 'text', text: EXTRACTION_PROMPT(pass1Text, pass2Text, docFields, isConnections ? 'connections' : 'artifact') }] }],
            }, anthropic),
            callModel(modelConfig.vector, {
              max_tokens: 8000,
              system: 'You are a scoring assistant. Output ONLY a flat JSON object. No markdown, no commentary, no extra text. Begin your response with { and end with }.',
              messages: [{ role: 'user', content: [{ type: 'text', text: VECTOR_SCORING_PROMPT(pass1Text) }] }],
            }, anthropic),
            callModel(modelConfig.extraction, {
              max_tokens: 8000,
              system: 'You are a provenance analyst. Output ONLY a valid JSON array. No markdown, no commentary. Begin with [ and end with ].',
              messages: [{ role: 'user', content: [{ type: 'text', text: PROVENANCE_INTEGRITY_PROMPT(object.attribution_culture as string | null, object.doc_canonical as string | null, object.doc_structured as string | null) }] }],
            }, anthropic),
            callModel(modelConfig.extraction, {
              max_tokens: 8000,
              system: 'You are a research analyst. Output ONLY a valid JSON array. No markdown, no commentary. Begin with [ and end with ].',
              messages: [{ role: 'user', content: [{ type: 'text', text: CONTRADICTION_DETECTION_PROMPT(object.attribution_culture as string | null, object.doc_canonical as string | null, pass1Text) }] }],
            }, anthropic),
          ]);

          if (extractionResult.status === 'rejected') throw extractionResult.reason;
          extractionModelUsed = extractionResult.value.model;

          let exText = extractionResult.value.content
            .filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim()
            .replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
          const exS = exText.indexOf('{'), exE = exText.lastIndexOf('}');
          if (exS !== -1 && exE > exS) exText = exText.slice(exS, exE + 1);
          structuredRecord = JSON.parse(exText);

          if (vectorResult.status === 'fulfilled') {
            vectorModelUsed = vectorResult.value.model;
            try {
              let vText = vectorResult.value.content
                .filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim()
                .replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
              const vS = vText.indexOf('{'), vE = vText.lastIndexOf('}');
              if (vS !== -1 && vE > vS) vText = vText.slice(vS, vE + 1);
              analysisVector = serializeVector(JSON.parse(vText));
            } catch (e) {
              vectorNote = `vector parse failed: ${e instanceof Error ? e.message : String(e)}`;
            }
          } else {
            vectorNote = `vector API failed: ${vectorResult.reason instanceof Error ? vectorResult.reason.message : String(vectorResult.reason)}`;
          }

          // Provenance integrity flags
          if (provenanceResult.status === 'fulfilled') {
            try {
              let pText = provenanceResult.value.content
                .filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim()
                .replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
              const pS = pText.indexOf('['), pE = pText.lastIndexOf(']');
              if (pS !== -1 && pE > pS) pText = pText.slice(pS, pE + 1);
              provenanceFlags = JSON.parse(pText);
              if (!Array.isArray(provenanceFlags)) provenanceFlags = [];
            } catch { provenanceFlags = []; }
          }

          // Contradiction flags
          if (contradictionResult.status === 'fulfilled') {
            try {
              let cText = contradictionResult.value.content
                .filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim()
                .replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
              const cS = cText.indexOf('['), cE = cText.lastIndexOf(']');
              if (cS !== -1 && cE > cS) cText = cText.slice(cS, cE + 1);
              const parsed = JSON.parse(cText);
              if (Array.isArray(parsed)) {
                // Filter out any "no contradiction" placeholder entries the model may emit
                contradictionFlags = parsed.filter((f: any) =>
                  f.severity && f.severity !== 'N/A' &&
                  f.contradiction && !/no contradiction/i.test(f.contradiction)
                );
              }
            } catch { contradictionFlags = []; }
          }
        } catch (err) {
          send({ type: 'status', message: `⚠ Pass 4 failed: ${err instanceof Error ? err.message : String(err)}` });
        }

        // ----------------------------------------------------------------
        // Fingerprint vs. attribution comparison
        // ----------------------------------------------------------------
        let fingerprintFlag: any = null;

        const fingerprint = object.fingerprint_vector as string | null;
        const culture     = (object.attribution_culture  as string | null)
                          ?? structuredRecord?.tradition_identified ?? null;
        const confidence  = (object.attribution_confidence as string | null) ?? null;

        if (fingerprint && culture && culture !== 'unknown') {
          send({ type: 'status', message: 'Comparing fingerprint to attribution claim…' });
          try {
            const flagMsg = await callModel(modelConfig.extraction, {
              max_tokens: 8000,
              system: 'You are a research analyst. Output ONLY valid JSON. No markdown, no commentary. Begin with { and end with }.',
              messages: [{ role: 'user', content: [{ type: 'text', text: FINGERPRINT_COMPARISON_PROMPT(fingerprint, culture, confidence ?? '') }] }],
            }, anthropic);
            let flagText = flagMsg.content
              .filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim()
              .replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
            const fS = flagText.indexOf('{'), fE = flagText.lastIndexOf('}');
            if (fS !== -1 && fE > fS) flagText = flagText.slice(fS, fE + 1);
            fingerprintFlag = JSON.parse(flagText);
          } catch (err) {
            send({ type: 'status', message: `⚠ Fingerprint comparison failed: ${err instanceof Error ? err.message : String(err)}` });
          }
        }

        // ----------------------------------------------------------------
        // Store Analysis in D1
        // ----------------------------------------------------------------
        let analysisId: number | null = null;

        send({ type: 'status', message: 'Saving analysis…' });
        try {
          const result = await db.prepare(`
            INSERT INTO analyses (
              object_id, mode, audience,
              model_pass1, model_pass2, model_pass3, model_extraction, model_vector,
              pass1_text, pass2_text, pass3_text,
              extraction_json, analysis_vector, fingerprint_flag,
              object_class, tradition, tradition_confidence,
              function_category, production_level, tradition_routing_basis, metadata_completeness,
              provenance_flags, contradiction_flags,
              pass2_truncated, pass3_truncated,
              created_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
          `).bind(
            object_id,
            isConnections ? 'connections' : 'artifact',
            audience,
            object.fingerprint_model ?? null,
            pass2Msg.model,
            pass3Msg.model,
            extractionModelUsed,
            vectorModelUsed,
            pass1Text,
            pass2Text,
            pass3Text,
            structuredRecord ? JSON.stringify(structuredRecord) : null,
            analysisVector,
            fingerprintFlag ? JSON.stringify(fingerprintFlag) : null,
            structuredRecord?.object_class_identified ?? null,
            structuredRecord?.tradition_identified    ?? null,
            structuredRecord?.tradition_confidence    ?? null,
            structuredRecord?.function_category       ?? null,
            structuredRecord?.production_level        ?? null,
            structuredRecord?.tradition_routing_basis ?? null,
            structuredRecord?.metadata_completeness   ?? null,
            provenanceFlags.length > 0 ? JSON.stringify(provenanceFlags) : null,
            contradictionFlags.length > 0 ? JSON.stringify(contradictionFlags) : null,
            pass2Truncated,
            pass3Truncated,
          ).run();
          analysisId = result.meta?.last_row_id ?? null;
        } catch (err) {
          send({ type: 'status', message: `⚠ DB save failed: ${err instanceof Error ? err.message : String(err)}` });
        }

        send({
          type: 'complete',
          success: true,
          analysis_id:    analysisId,
          object_id,
          mode,
          pass2_text:     pass2Text,
          pass3_text:     pass3Text,
          analysis_vector: analysisVector ? JSON.parse(analysisVector) : null,
          fingerprint_flag: fingerprintFlag,
          provenance_flags: provenanceFlags.length > 0 ? provenanceFlags : null,
          contradiction_flags: contradictionFlags.length > 0 ? contradictionFlags : null,
          models_used: {
            pass2:      pass2Msg.model,
            pass3:      pass3Msg.model,
            extraction: extractionModelUsed,
            vector:     vectorModelUsed,
          },
          cache_usage: { pass2_read: pass2CacheRead },
          ...(vectorNote ? { vector_note: vectorNote } : {}),
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
