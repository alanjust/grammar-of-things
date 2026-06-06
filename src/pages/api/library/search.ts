import type { APIRoute } from 'astro';
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const env = cfEnv as unknown as Record<string, any>;
  const db  = env.DB;
  if (!db) return new Response(JSON.stringify({ error: 'DB unavailable.' }), { status: 500 });

  const url   = new URL(request.url);
  const q     = url.searchParams.get('q')?.trim() ?? '';
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '20'), 50);

  if (!q) return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });

  try {
    // Use FTS5 snippet() to get a highlighted excerpt (~30 tokens around the match)
    const result = await db.prepare(`
      SELECT
        snippet(chunks_fts, 0, '<mark>', '</mark>', '…', 30) AS snippet,
        f.document_id,
        f.citation_key,
        f.page_ref,
        f.section_ref,
        d.title,
        d.author,
        d.year,
        d.doc_type
      FROM chunks_fts f
      JOIN documents d ON d.id = f.document_id
      WHERE chunks_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).bind(q, limit).all();

    return new Response(JSON.stringify(result.results ?? []), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    // FTS5 syntax error — try a simple quoted phrase fallback
    try {
      const safe   = q.replace(/['"*^()]/g, ' ').trim();
      const result = await db.prepare(`
        SELECT
          snippet(chunks_fts, 0, '<mark>', '</mark>', '…', 30) AS snippet,
          f.document_id,
          f.citation_key,
          f.page_ref,
          f.section_ref,
          d.title,
          d.author,
          d.year,
          d.doc_type
        FROM chunks_fts f
        JOIN documents d ON d.id = f.document_id
        WHERE chunks_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `).bind(safe, limit).all();
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
