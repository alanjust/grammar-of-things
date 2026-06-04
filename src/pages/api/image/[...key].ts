import type { APIRoute } from 'astro';
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const env = cfEnv as unknown as Record<string, any>;
  const r2 = env.ARTIFACTS;
  const key = params.key;

  if (!r2 || !key) {
    return new Response('Not found', { status: 404 });
  }

  try {
    const obj = await r2.get(key);
    if (!obj) return new Response('Not found', { status: 404 });

    const contentType = obj.httpMetadata?.contentType ?? 'image/jpeg';
    const buffer = await obj.arrayBuffer();

    return new Response(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return new Response('Error fetching image', { status: 500 });
  }
};
