import type { APIRoute } from 'astro';
import { env as cfEnv } from 'cloudflare:workers';
import { requireAdmin } from '../../../lib/auth';

export const prerender = false;

const VECTOR_KEY = [
  'ap_1','ap_2','ap_3','ap_4','ap_5','ap_6','ap_7','ap_8','ap_9','ap_10',
  'ap_11','ap_12','ap_13','ap_14','ap_15',
  'ta_1','ta_2','ta_4','ta_5','ta_13','ta_15','ta_20','ta_28',
  'ta_47','ta_48','ta_49','ta_51',
];
const PRINCIPLE_NAMES: Record<string, string> = {
  ap_1:'Production Trace Reading', ap_2:'Sequence Inference', ap_3:'Material Boundary Attention',
  ap_4:'Wear Differential', ap_5:'Absence as Evidence', ap_6:'Composite Detection',
  ap_7:'Anatomical Correspondence', ap_8:'Symmetry as Evidence', ap_9:'Proportion as Encoding',
  ap_10:'Color Zone Logic', ap_11:'Investment Gradient', ap_12:'Attachment Point Reading',
  ap_13:'Orientation Dependency', ap_14:'Completion State', ap_15:'Reduction vs. Construction',
  ta_1:'Edge Detection', ta_2:'Color Opponent Channels', ta_4:'Figure-Ground Relationships',
  ta_5:'Grouping', ta_13:'Overlap / Occlusion', ta_15:'Closure / Negative Space',
  ta_20:'Simultaneous Contrast', ta_28:'Specularity / Reflection',
  ta_47:'Face Detection', ta_48:'Biological Motion', ta_49:'Gaze Direction', ta_51:'Visual Pop-out',
};

export const DELETE: APIRoute = async ({ params, request }) => {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const env = cfEnv as unknown as Record<string, any>;
  const db  = env.DB;
  const id  = Number(params.id);

  if (!db) return new Response(JSON.stringify({ error: 'DB unavailable.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  if (!id || isNaN(id)) return new Response(JSON.stringify({ error: 'Invalid id.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  await db.prepare('DELETE FROM analyses WHERE id = ?').bind(id).run();

  return new Response(JSON.stringify({ deleted: id }), { headers: { 'Content-Type': 'application/json' } });
};

export const PATCH: APIRoute = async ({ params, request }) => {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const env = cfEnv as unknown as Record<string, any>;
  const db  = env.DB;
  const id  = Number(params.id);

  if (!db) return new Response(JSON.stringify({ error: 'DB unavailable.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  if (!id || isNaN(id)) return new Response(JSON.stringify({ error: 'Invalid id.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  let body: any;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'Invalid JSON.' }), { status: 400, headers: { 'Content-Type': 'application/json' } }); }

  if (typeof body.notes !== 'string') return new Response(JSON.stringify({ error: '"notes" string required.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  await db.prepare('UPDATE analyses SET notes = ? WHERE id = ?').bind(body.notes || null, id).run();

  return new Response(JSON.stringify({ updated: id }), { headers: { 'Content-Type': 'application/json' } });
};

export const GET: APIRoute = async ({ params, request }) => {
  const env = cfEnv as unknown as Record<string, any>;
  const db  = env.DB;
  const id  = Number(params.id);
  const url = new URL(request.url);
  const fmt = url.searchParams.get('format') ?? 'json';

  if (!db)              return new Response(JSON.stringify({ error: 'DB unavailable.' }), { status: 500 });
  if (!id || isNaN(id)) return new Response(JSON.stringify({ error: 'Invalid id.' }),    { status: 400 });

  const analysis = await db.prepare('SELECT * FROM analyses WHERE id = ?').bind(id).first();
  if (!analysis)        return new Response(JSON.stringify({ error: 'Not found.' }),      { status: 404 });

  const object = await db.prepare('SELECT * FROM objects WHERE id = ?').bind(analysis.object_id).first();

  if (fmt !== 'md') {
    return new Response(JSON.stringify({ analysis, object }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── Markdown format ───────────────────────────────────────────────────────

  const accession = object?.accession_number ?? object?.catalog_number ?? `Object ${analysis.object_id}`;
  const date      = new Date(analysis.created_at as string).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  let md = `# Analysis — ${accession}\n\n`;
  md += `**Mode:** ${analysis.mode}  \n`;
  md += `**Audience:** ${analysis.audience ?? 'researcher'}  \n`;
  md += `**Date:** ${date}  \n`;
  md += `**Object ID:** ${analysis.object_id} · **Analysis ID:** ${id}  \n`;
  if (analysis.model_pass2) md += `**Model:** ${analysis.model_pass2}  \n`;
  md += '\n---\n\n';

  // Object metadata
  md += '## Object\n\n';
  if (object?.attribution_culture)  md += `- **Culture:** ${object.attribution_culture}${object.attribution_confidence ? ` (${object.attribution_confidence})` : ''}\n`;
  if (object?.accession_number)      md += `- **Accession:** ${object.accession_number}\n`;
  if (object?.catalog_number)        md += `- **Catalog:** ${object.catalog_number}\n`;
  if (object?.source_institution)    md += `- **Institution:** ${object.source_institution}\n`;
  if (object?.ezid_ark)              md += `- **EZID/ARK:** http://${object.ezid_ark}\n`;
  md += '\n---\n\n';

  // Pass 1
  if (analysis.pass1_text) {
    md += '## Pass 1 — Blind Observation\n\n';
    md += `*Documentation excluded from context — image only.*\n\n`;
    md += `${analysis.pass1_text}\n\n---\n\n`;
  }

  // Pass 2
  if (analysis.pass2_text) {
    md += `## Pass 2 — ${analysis.mode === 'connections' ? 'Cultural Connections' : 'Artifact Analysis'}\n\n`;
    md += `${analysis.pass2_text}\n\n---\n\n`;
  }

  // Pass 3
  if (analysis.pass3_text) {
    md += '## Pass 3 — What to Take Forward\n\n';
    md += `${analysis.pass3_text}\n\n---\n\n`;
  }

  // Fingerprint flag
  if (analysis.fingerprint_flag) {
    let flag: any = null;
    try { flag = JSON.parse(analysis.fingerprint_flag as string); } catch {}
    if (flag) {
      md += '## Fingerprint vs. Attribution\n\n';
      md += `**Alignment:** ${flag.alignment}  \n`;
      md += `**Flag strength:** ${flag.flag_strength}  \n\n`;
      md += `${flag.reasoning}\n\n`;
      md += `*${flag.caveats}*\n\n---\n\n`;
    }
  }

  // Fingerprint vector
  if (analysis.analysis_vector) {
    let vec: number[] = [];
    try { vec = JSON.parse(analysis.analysis_vector as string); } catch {}
    if (vec.length > 0) {
      md += '## Perceptual Fingerprint (27 principles, scored 0–3)\n\n';
      md += '| Code | Principle | Score |\n|---|---|---|\n';
      VECTOR_KEY.forEach((k, i) => {
        md += `| ${k} | ${PRINCIPLE_NAMES[k] ?? k} | ${vec[i] ?? 0} |\n`;
      });
      md += '\n';
    }
  }

  const filename = `analysis-${accession.replace(/[^a-z0-9]/gi, '-')}-${id}.md`;
  return new Response(md, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
};
