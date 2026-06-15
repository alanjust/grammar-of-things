import type { APIRoute } from 'astro';
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

export const GET: APIRoute = async () => {
  const env = cfEnv as unknown as Record<string, any>;
  const db = env.DB;

  if (!db) {
    return new Response(JSON.stringify({ error: 'DB binding unavailable.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  const result = await db.prepare(`
    SELECT
      id, ezid_ark, catalog_number, accession_number,
      attribution_culture, attribution_confidence,
      image_analysis_key, image_original_key,
      fingerprint_vector, fingerprinted_at,
      source_institution, created_at,
      claim_conflict, is_reference, reference_tradition
    FROM objects
    ORDER BY created_at DESC
    LIMIT 200
  `).all();

  return new Response(JSON.stringify(result.results ?? []), {
    headers: { 'Content-Type': 'application/json' },
  });
};
