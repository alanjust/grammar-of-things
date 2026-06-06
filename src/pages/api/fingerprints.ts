import type { APIRoute } from 'astro';
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

// Returns all objects that have been fingerprinted, with their vectors.
// Used by the comparison page for client-side similarity computation.
export const GET: APIRoute = async () => {
  const env = cfEnv as unknown as Record<string, any>;
  const db  = env.DB;
  if (!db) return new Response(JSON.stringify({ error: 'DB unavailable.' }), { status: 500 });

  const result = await db.prepare(`
    SELECT
      id,
      accession_number,
      catalog_number,
      attribution_culture,
      attribution_confidence,
      fingerprint_vector,
      fingerprint_model,
      fingerprinted_at,
      image_analysis_key,
      source_institution
    FROM objects
    WHERE fingerprint_vector IS NOT NULL
    ORDER BY created_at
  `).all();

  return new Response(JSON.stringify(result.results ?? []), {
    headers: { 'Content-Type': 'application/json' },
  });
};
