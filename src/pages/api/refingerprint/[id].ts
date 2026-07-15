import type { APIRoute } from 'astro';
import Anthropic from '@anthropic-ai/sdk';
import { env as cfEnv } from 'cloudflare:workers';
import { requireAdmin } from '../../../lib/auth';
import { loadImageFromR2 } from '../../../lib/image';
import {
  ARTIFACT_PRINCIPLE_NAMES, APPLICABLE_TIER_A_NAMES,
  PASS1_PROMPT_SINGLE, PASS1_PROMPT_MULTI, VECTOR_SCORING_PROMPT,
  VECTOR_KEY_NAMES,
} from '../../../lib/principles';
import {
  resolveModelConfig, callModel,
  resolveStabilityConfigs, callModelNeutral,
  type NeutralRequest,
} from '../../../lib/model-router';
import { VECTOR_KEY, serializeVector } from '../../../db/types';

export const prerender = false;

const PASS1_SYSTEM = 'You have completed a close examination of this artifact. Report what you found.';

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
// POST /api/refingerprint/:id
//
// Re-runs Track A (Pass 1 blind observation → multi-provider synthesis →
// vector scoring) for an ALREADY-CATALOGED object, reusing its existing R2
// analysis images. Unlike /api/ingest, this UPDATEs the existing object row
// in place — it never creates a new object. Track B (documentation) fields
// are left untouched.
// ---------------------------------------------------------------------------

export const POST: APIRoute = async ({ params, request }) => {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const objectId = Number(params.id);
  if (!Number.isFinite(objectId)) {
    return new Response(JSON.stringify({ error: 'Invalid object id.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const env = cfEnv as unknown as Record<string, any>;
  const apiKey = (env.ANTHROPIC_API_KEY as string | undefined) || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY is not set.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  const db = env.DB;
  const r2 = env.ARTIFACTS;
  if (!db) return new Response(JSON.stringify({ error: 'DB unavailable.' }), { status: 500 });
  if (!r2) return new Response(JSON.stringify({ error: 'R2 unavailable.' }), { status: 500 });

  const object = await db.prepare('SELECT * FROM objects WHERE id = ?').bind(objectId).first();
  if (!object) {
    return new Response(JSON.stringify({ error: `Object ${objectId} not found.` }), { status: 404 });
  }
  if (!object.image_analysis_key) {
    return new Response(JSON.stringify({ error: `Object ${objectId} has no stored analysis image.` }), { status: 400 });
  }

  const imageKeys: string[] = (object.image_analysis_key as string).split(',').filter(Boolean);
  const loaded: Array<{ dataUrl: string; mimeType: string; label: string }> = [];
  for (const key of imageKeys) {
    const dataUrl = await loadImageFromR2(r2, key);
    if (!dataUrl) continue;
    const rawLabel = key.split('/').pop()?.replace(/^\d+-/, '').replace(/-analysis\.\w+$/, '') ?? 'view';
    const label = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);
    loaded.push({ dataUrl, mimeType: dataUrl.split(';')[0].split(':')[1], label });
  }
  if (loaded.length === 0) {
    return new Response(JSON.stringify({ error: 'No images could be loaded from storage.' }), { status: 500 });
  }

  const anthropic = new Anthropic({ apiKey });
  const modelConfig = resolveModelConfig(env);
  const stabilityPasses = Math.max(1, parseInt(String(env.STABILITY_PASSES ?? '3'), 10) || 1);

  const imageBlocks = loaded.flatMap(img => [
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

  const pass1Prompt = loaded.length === 1
    ? PASS1_PROMPT_SINGLE(ARTIFACT_PRINCIPLE_NAMES, APPLICABLE_TIER_A_NAMES)
    : PASS1_PROMPT_MULTI(loaded.length, ARTIFACT_PRINCIPLE_NAMES, APPLICABLE_TIER_A_NAMES);

  const pass1MsgParams = {
    max_tokens: 8000,
    system: PASS1_SYSTEM,
    messages: [{ role: 'user', content: [...imageBlocks, { type: 'text', text: pass1Prompt }] }],
  };

  const neutralPass1Req: NeutralRequest = {
    system: PASS1_SYSTEM,
    prompt: pass1Prompt,
    maxTokens: 8000,
    images: loaded.map(img => ({ mediaType: img.mimeType, data: img.dataUrl.split(',')[1] })),
  };

  const stabilityCfgs = resolveStabilityConfigs(env);

  try {
    // Claude ×N, Gemini ×N, OpenAI ×N — all concurrent. Claude results keep the
    // actual resolved model id (from the API response), not just the configured alias.
    const claudePromises = Array.from({ length: stabilityPasses }, () =>
      callModel(modelConfig.pass1, pass1MsgParams as any, anthropic).then(
        msg => ({
          text: msg.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n\n'),
          model: msg.model as string,
        })
      ).catch(() => null as { text: string; model: string } | null)
    );
    const geminiPromises = Array.from({ length: stabilityPasses }, () =>
      callModelNeutral(stabilityCfgs.gemini, neutralPass1Req, env).then(r => r.text).catch(() => null as string | null)
    );
    const openaiPromises = Array.from({ length: stabilityPasses }, () =>
      callModelNeutral(stabilityCfgs.openai, neutralPass1Req, env).then(r => r.text).catch(() => null as string | null)
    );

    const [claudeResults, geminiResults, openaiResults] = await Promise.all([
      Promise.all(claudePromises),
      Promise.all(geminiPromises),
      Promise.all(openaiPromises),
    ]);

    type LabeledRun = { provider: string; run: number; text: string; images_sent: number };
    const claudeOk = claudeResults.filter((r): r is { text: string; model: string } => r !== null);
    const labeledRuns: LabeledRun[] = [
      ...claudeOk.map((r, i) => ({ provider: 'claude', run: i + 1, text: r.text, images_sent: loaded.length })),
      ...geminiResults.filter((t): t is string => t !== null).map((text, i) => ({
        provider: 'gemini', run: i + 1, text, images_sent: loaded.length,
      })),
      ...openaiResults.filter((t): t is string => t !== null).map((text, i) => ({
        provider: 'openai', run: i + 1, text, images_sent: loaded.length,
      })),
    ];

    if (labeledRuns.length === 0 || claudeOk.length === 0) {
      return new Response(JSON.stringify({ error: 'All Pass 1 runs failed.' }), { status: 502 });
    }

    const pass1Text = claudeOk[0].text;
    const pass1Model = claudeOk[0].model;

    const allPass1Texts = labeledRuns.map(r => r.text);

    // Vector scoring across every run — canonical vector is Run 1 (Claude).
    let fingerprintVector: string | null = null;
    const stabilityMap: Record<string, { hits: number; total: number }> = {};

    const scoreMsgs = await Promise.all(allPass1Texts.map(text =>
      callModel(modelConfig.vector, {
        max_tokens: 8000,
        system: 'You are a scoring assistant. Output ONLY a flat JSON object. No markdown, no commentary. Begin with { and end with }.',
        messages: [{ role: 'user', content: [{ type: 'text', text: VECTOR_SCORING_PROMPT(text) }] }],
      }, anthropic).catch(() => null)
    ));

    const allScores: Record<string, number>[] = scoreMsgs.map(msg => {
      if (!msg) return {};
      try {
        let raw = msg.content
          .filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim()
          .replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
        const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
        if (s !== -1 && e > s) raw = raw.slice(s, e + 1);
        return JSON.parse(raw);
      } catch { return {}; }
    });

    // labeledRuns lists Claude runs first, so index 0 is claudeOk[0] — the canonical run.
    fingerprintVector = serializeVector(allScores[0] ?? {});

    const threshold = Math.ceil(allPass1Texts.length / 2);
    for (const principleId of VECTOR_KEY) {
      const hits = allScores.filter(scores => (scores[principleId] ?? 0) > 0).length;
      if (hits > 0) stabilityMap[principleId] = { hits, total: allPass1Texts.length };
    }

    // Synthesis classification across all runs.
    let pass1Synthesized: string | null = null;
    let synthesisClassification: SynthesisClassification | null = null;
    let synthesisTruncated = 0;

    if (labeledRuns.length > 1) {
      try {
        const synthesisMsg = await callModel(modelConfig.pass1, {
          max_tokens: 16000,
          system: 'You are classifying multiple independent visual observations. Output ONLY the JSON array requested. Report only what the observations contain — do not add your own visual readings.',
          messages: [{ role: 'user', content: [{ type: 'text', text: buildSynthesisClassificationPrompt(labeledRuns, stabilityPasses) }] }],
        }, anthropic);

        const rawSynthesisText = synthesisMsg.content
          .filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
        synthesisTruncated = synthesisMsg.stop_reason === 'max_tokens' ? 1 : 0;

        synthesisClassification = parseSynthesisClassification(rawSynthesisText);
        pass1Synthesized = renderSynthesisMarkdown(synthesisClassification);
      } catch {
        synthesisClassification = null;
      }
    }

    const fingerprintedAt = new Date().toISOString();

    await db.prepare(`
      UPDATE objects SET
        fingerprint_vector           = ?,
        fingerprint_model            = ?,
        fingerprint_pass1_text       = ?,
        fingerprint_stability_runs   = ?,
        fingerprint_pass1_synthesized = ?,
        fingerprinted_at             = ?,
        fingerprint_stability_passes = ?,
        fingerprint_stability_map    = ?,
        fingerprint_synthesis_truncated = ?,
        fingerprint_synthesis_classification = ?,
        updated_at                   = datetime('now')
      WHERE id = ?
    `).bind(
      fingerprintVector,
      pass1Model,
      pass1Text,
      JSON.stringify(labeledRuns.map(r => ({ provider: r.provider, run: r.run, text: r.text, images_sent: r.images_sent }))),
      pass1Synthesized,
      fingerprintedAt,
      labeledRuns.length,
      Object.keys(stabilityMap).length > 0 ? JSON.stringify(stabilityMap) : null,
      synthesisTruncated,
      synthesisClassification ? JSON.stringify(synthesisClassification) : null,
      objectId,
    ).run();

    return new Response(JSON.stringify({
      success: true,
      object_id: objectId,
      fingerprint_vector: JSON.parse(fingerprintVector),
      fingerprint_keys: VECTOR_KEY,
      fingerprint_model: pass1Model,
      fingerprint_stability_runs: labeledRuns.length,
      providers: [...new Set(labeledRuns.map(r => r.provider))],
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), { status: 500 });
  }
};
