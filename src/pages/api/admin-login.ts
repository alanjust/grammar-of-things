import type { APIRoute } from 'astro';
import { validateToken, createSession, sessionCookie, adminTokenConfigured } from '../../lib/auth';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  if (!adminTokenConfigured()) {
    return json({ error: 'Admin auth is not configured on the server (ADMIN_TOKEN secret missing).' }, 503);
  }

  let body: any;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid JSON.' }, 400); }

  const provided = typeof body?.token === 'string' ? body.token : '';
  if (!provided || !validateToken(provided)) {
    return json({ error: 'Incorrect token.' }, 401);
  }

  const sid = await createSession();
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': sessionCookie(sid) },
  });
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}
