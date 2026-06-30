import type { APIRoute } from 'astro';
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

// Build a safe FTS5 MATCH query with prefix matching on each term.
// Strips special FTS5 operators, keeps word chars only, adds * for prefix match.
function buildFtsQuery(raw: string): string {
  const terms = raw
    .trim()
    .replace(/['"*^()\-+]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2)
    .slice(0, 8);
  if (terms.length === 0) return '';
  return terms.map(t => t + '*').join(' ');
}

export const GET: APIRoute = async ({ request }) => {
  const env = cfEnv as unknown as Record<string, any>;
  const db  = env.DB;
  if (!db) return new Response(JSON.stringify({ error: 'DB unavailable.' }), { status: 500 });

  const url = new URL(request.url);
  const q   = url.searchParams.get('q')?.trim() ?? '';

  if (!q) return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });

  const ftsQuery = buildFtsQuery(q);
  if (!ftsQuery) return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });

  const sql = `
    SELECT
      o.id,
      o.catalog_number,
      o.attribution_culture,
      o.source_institution,
      o.image_analysis_key,
      o.fingerprinted_at,
      snippet(objects_fts, -1, '[[M]]', '[[/M]]', '…', 24) AS excerpt
    FROM objects_fts f
    JOIN objects o ON o.id = f.object_id
    WHERE objects_fts MATCH ?
    ORDER BY rank
    LIMIT 20
  `;

  try {
    const result = await db.prepare(sql).bind(ftsQuery).all();
    return new Response(JSON.stringify(result.results ?? []), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    // FTS5 syntax error — fall back to simple sanitized query without prefix matching
    try {
      const safe = q.replace(/[^\w\s]/g, ' ').trim();
      if (!safe) return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });
      const result = await db.prepare(sql).bind(safe).all();
      return new Response(JSON.stringify(result.results ?? []), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch {
      return new Response(JSON.stringify({ error: 'Search failed — try simpler terms.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
  }
};
