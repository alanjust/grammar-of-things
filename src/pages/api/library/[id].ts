import type { APIRoute } from 'astro';
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const env = cfEnv as unknown as Record<string, any>;
  const db  = env.DB;
  const id  = Number(params.id);
  if (!db)              return new Response(JSON.stringify({ error: 'DB unavailable.' }), { status: 500 });
  if (!id || isNaN(id)) return new Response(JSON.stringify({ error: 'Invalid id.' }),    { status: 400 });

  const doc = await db.prepare('SELECT * FROM documents WHERE id = ?').bind(id).first();
  if (!doc)             return new Response(JSON.stringify({ error: 'Not found.' }),      { status: 404 });

  const chunks = await db.prepare(
    'SELECT id, chunk_index, chunk_text, page_ref, section_ref FROM document_chunks WHERE document_id = ? ORDER BY chunk_index LIMIT 20'
  ).bind(id).all();

  return new Response(JSON.stringify({ doc, chunks: chunks.results ?? [] }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const DELETE: APIRoute = async ({ params }) => {
  const env = cfEnv as unknown as Record<string, any>;
  const db  = env.DB;
  const id  = Number(params.id);
  if (!db)              return new Response(JSON.stringify({ error: 'DB unavailable.' }), { status: 500 });
  if (!id || isNaN(id)) return new Response(JSON.stringify({ error: 'Invalid id.' }),    { status: 400 });

  // Delete FTS entries for this document's chunks
  await db.prepare(`
    DELETE FROM chunks_fts WHERE rowid IN (
      SELECT id FROM document_chunks WHERE document_id = ?
    )
  `).bind(id).run();

  // Cascades to document_chunks via ON DELETE CASCADE
  await db.prepare('DELETE FROM documents WHERE id = ?').bind(id).run();

  return new Response(JSON.stringify({ deleted: id }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
