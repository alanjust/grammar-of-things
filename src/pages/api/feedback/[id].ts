import type { APIRoute } from 'astro';
import { env as cfEnv } from 'cloudflare:workers';
import { requireAdmin } from '../../../lib/auth';

export const prerender = false;

export const PATCH: APIRoute = async ({ params, request }) => {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const env = cfEnv as unknown as Record<string, any>;
  const db  = env.DB;
  const id  = Number(params.id);

  if (!db) return json({ error: 'DB binding unavailable.' }, 500);
  if (!id || isNaN(id)) return json({ error: 'Invalid id.' }, 400);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON.' }, 400); }

  const { status } = body;
  if (status !== 'open' && status !== 'resolved' && status !== 'dismissed') {
    return json({ error: '"status" must be open | resolved | dismissed.' }, 400);
  }

  await db.prepare('UPDATE feedback_queue SET status = ? WHERE id = ?').bind(status, id).run();

  return json({ updated: id, status });
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
