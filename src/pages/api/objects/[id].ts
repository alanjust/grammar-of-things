import type { APIRoute } from 'astro';
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const env = cfEnv as unknown as Record<string, any>;
  const db = env.DB;
  const id = Number(params.id);

  if (!db) {
    return new Response(JSON.stringify({ error: 'DB binding unavailable.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!id || isNaN(id)) {
    return new Response(JSON.stringify({ error: 'Invalid id.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const object = await db.prepare('SELECT * FROM objects WHERE id = ?').bind(id).first();
  if (!object) {
    return new Response(JSON.stringify({ error: 'Not found.' }), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    });
  }

  const analysesResult = await db
    .prepare('SELECT * FROM analyses WHERE object_id = ? ORDER BY created_at DESC LIMIT 20')
    .bind(id)
    .all();

  return new Response(JSON.stringify({
    object,
    analyses: analysesResult.results ?? [],
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
