import type { APIRoute } from 'astro';
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

export const GET: APIRoute = async () => {
  const env = cfEnv as unknown as Record<string, any>;
  const db  = env.DB;
  if (!db) return new Response(JSON.stringify({ error: 'DB unavailable.' }), { status: 500 });

  const result = await db.prepare(`
    SELECT id, citation_key, title, author, year, doc_type, chunk_count, created_at
    FROM documents
    ORDER BY author, year
  `).all();

  return new Response(JSON.stringify(result.results ?? []), {
    headers: { 'Content-Type': 'application/json' },
  });
};
