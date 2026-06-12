import type { APIRoute } from 'astro';
import { destroySession, clearCookie } from '../../lib/auth';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  await destroySession(request);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': clearCookie() },
  });
};
