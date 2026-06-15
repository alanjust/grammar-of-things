import type { APIRoute } from 'astro';
import { env as cfEnv } from 'cloudflare:workers';
import { requireAdmin } from '../../lib/auth';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const env = cfEnv as unknown as Record<string, any>;
  const db  = env.DB;
  if (!db) return json({ error: 'DB binding unavailable.' }, 500);

  const url    = new URL(request.url);
  const status = url.searchParams.get('status') ?? 'open';

  const result = await db
    .prepare('SELECT * FROM feedback_queue WHERE status = ? ORDER BY created_at DESC LIMIT 100')
    .bind(status)
    .all();

  return json({ items: result.results ?? [] });
};

export const POST: APIRoute = async ({ request }) => {
  const env = cfEnv as unknown as Record<string, any>;
  const db  = env.DB;
  if (!db) return json({ error: 'DB binding unavailable.' }, 500);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON.' }, 400); }

  // Honeypot — bots fill this
  if (body.website) return json({ ok: true });

  const text = typeof body.body === 'string' ? body.body.trim() : '';
  if (text.length < 5) return json({ error: 'Message too short.' }, 400);
  if (text.length > 4000) return json({ error: 'Message too long.' }, 400);

  const contact = typeof body.contact === 'string' ? body.contact.trim().slice(0, 200) : null;
  const page    = typeof body.page    === 'string' ? body.page.trim().slice(0, 500)    : null;

  await db
    .prepare("INSERT INTO feedback_queue (body, contact, page, created_at, status) VALUES (?, ?, ?, datetime('now'), 'open')")
    .bind(text, contact || null, page || null)
    .run();

  return json({ ok: true });
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
