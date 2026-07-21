import type { APIRoute } from 'astro';
import Anthropic from '@anthropic-ai/sdk';
import { env as cfEnv } from 'cloudflare:workers';
import { requireAdmin } from '../../../lib/auth';
import { resolveModelConfig } from '../../../lib/model-router';
import { VECTOR_KEY } from '../../../db/types';
import { VECTOR_KEY_DISPLAY_NAMES as PRINCIPLE_NAMES } from '../../../lib/principles';
import { AI_TELL_GUARDRAIL, auditText } from '../../../lib/anti-slop';

export const prerender = false;

function formatFingerprint(vec: number[]): string {
  const byScore: Record<number, string[]> = { 3: [], 2: [], 1: [], 0: [] };
  VECTOR_KEY.forEach((k, i) => {
    const s = vec[i] ?? 0;
    byScore[s].push(PRINCIPLE_NAMES[k] ?? k);
  });
  const lines: string[] = [];
  if (byScore[3].length) lines.push(`Dominant (3): ${byScore[3].join(', ')}`);
  if (byScore[2].length) lines.push(`Operative (2): ${byScore[2].join(', ')}`);
  if (byScore[1].length) lines.push(`Peripheral (1): ${byScore[1].join(', ')}`);
  if (byScore[0].length) lines.push(`Absent (0): ${byScore[0].join(', ')}`);
  return lines.join('\n');
}

export const POST: APIRoute = async ({ request }) => {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const env = cfEnv as unknown as Record<string, any>;
  const db  = env.DB;
  const apiKey = env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;

  if (!apiKey) return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not set.' }), { status: 500 });

  let body: any;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'Invalid JSON.' }), { status: 400 }); }

  const { ids, query } = body;
  if (!Array.isArray(ids) || ids.length < 2) return new Response(JSON.stringify({ error: 'At least 2 object IDs required.' }), { status: 400 });
  if (!query?.trim()) return new Response(JSON.stringify({ error: 'query is required.' }), { status: 400 });

  if (!db) return new Response(JSON.stringify({ error: 'DB unavailable.' }), { status: 500 });

  // Fetch all selected objects
  const placeholders = ids.map(() => '?').join(',');
  const result = await db.prepare(
    `SELECT id, accession_number, catalog_number, attribution_culture, attribution_confidence,
            fingerprint_vector, fingerprint_pass1_text, source_institution
     FROM objects WHERE id IN (${placeholders})`
  ).bind(...ids).all();

  const objects = (result.results ?? []).map((o: any) => ({
    ...o,
    vec: o.fingerprint_vector ? JSON.parse(o.fingerprint_vector) : null,
  })).filter((o: any) => o.vec);

  if (objects.length < 2) return new Response(JSON.stringify({ error: 'Not enough fingerprinted objects found.' }), { status: 400 });

  // Build synthesis prompt
  const objectBlocks = objects.map((o: any, i: number) => {
    const accession  = o.catalog_number ?? o.accession_number ?? `#${o.id}`;
    const tradition  = o.attribution_culture ?? 'unknown';
    const confidence = o.attribution_confidence ?? 'unknown';
    const pass1      = o.fingerprint_pass1_text
      ? o.fingerprint_pass1_text.slice(0, 1000) + (o.fingerprint_pass1_text.length > 1000 ? '…' : '')
      : 'Not available';

    return `--- Object ${i + 1}: ${accession} ---
Documented attribution: ${tradition} (confidence: ${confidence})
${o.source_institution ? `Institution: ${o.source_institution}` : ''}

Perceptual fingerprint (scored 0–3, computed blind from image alone — no documentation in context):
${formatFingerprint(o.vec)}

Pass 1 observation excerpt:
${pass1}`;
  }).join('\n\n');

  const systemPrompt = `You are a specialist in Southwest archaeological artifact analysis with expertise in comparative material culture studies. You apply the frameworks of J.J. Brody, Harry Shafer, Michelle Hegmon, and Polly Schaafsma.

When comparing perceptual fingerprints:
- Fingerprint scores were computed blind — documentation was excluded from Pass 1 context. The fingerprint reflects only what the image shows.
- Principle scores 0–3: 0 = absent, 1 = peripheral, 2 = operative, 3 = dominant.
- Score patterns reveal production method, visual organization strategy, and material investment — not iconographic meaning directly.
- When fingerprint patterns diverge from documented attributions, surface this as a research flag, not a conclusion.
- Be evidence-grounded. Cite specific principle scores that anchor claims. State uncertainty explicitly.
- Do not use fine art vocabulary. Do not assert misattribution. Do not over-read single-principle divergences.

${AI_TELL_GUARDRAIL}`;

  const userPrompt = `A researcher has selected ${objects.length} objects for comparative analysis.

RESEARCH QUESTION: "${query}"

${objectBlocks}

---

Address the research question directly. Compare across all ${objects.length} objects. Note significant fingerprint pattern groupings, shared signatures, and outliers. Where fingerprint patterns are inconsistent with documented attributions, flag them as research observations worth closer examination.`;

  const modelConfig = resolveModelConfig(env);
  const anthropic   = new Anthropic({ apiKey });
  const encoder     = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      try {
        const msgStream = anthropic.messages.stream({
          model:      modelConfig.pass2.model,
          max_tokens: 8000,
          system:     systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        });
        for await (const event of msgStream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            send({ type: 'delta', text: event.delta.text });
          }
        }
        const msg = await msgStream.finalMessage();
        const fullText = msg.content
          .filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
        const slopHits = auditText(fullText);
        if (slopHits.words.length || slopHits.phrases.length) {
          console.warn('[slop-audit] compare/synthesize flagged:', slopHits);
        }
        send({ type: 'complete', model: msg.model,
          input_tokens: msg.usage.input_tokens, output_tokens: msg.usage.output_tokens });
      } catch (err) {
        send({ type: 'error', error: err instanceof Error ? err.message : String(err) });
      } finally {
        try { controller.close(); } catch {}
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
