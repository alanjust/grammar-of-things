import type { APIRoute } from 'astro';
import { isAdmin } from '../../lib/auth';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const admin = await isAdmin(request);
  return new Response(JSON.stringify({ admin }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
};
