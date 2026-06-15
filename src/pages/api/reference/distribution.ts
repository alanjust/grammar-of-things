import type { APIRoute } from 'astro';
import { env as cfEnv } from 'cloudflare:workers';
import { VECTOR_KEY } from '../../../db/types';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const env = cfEnv as unknown as Record<string, any>;
  const db = env.DB;
  if (!db) {
    return new Response(JSON.stringify({ error: 'DB binding unavailable.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(request.url);
  const tradition = url.searchParams.get('tradition');

  const params: string[] = [];
  let query = `SELECT id, reference_tradition, fingerprint_vector FROM objects WHERE is_reference = 1 AND fingerprint_vector IS NOT NULL`;
  if (tradition) {
    query += ` AND reference_tradition = ?`;
    params.push(tradition);
  }

  const result = params.length
    ? await db.prepare(query).bind(...params).all()
    : await db.prepare(query).all();

  const rows = (result.results ?? []) as Array<{ id: number; reference_tradition: string; fingerprint_vector: string }>;

  const byTradition: Record<string, { id: number; vec: number[] }[]> = {};
  for (const row of rows) {
    const trad = row.reference_tradition ?? 'other';
    if (!byTradition[trad]) byTradition[trad] = [];
    try {
      const vec = JSON.parse(row.fingerprint_vector);
      if (Array.isArray(vec)) byTradition[trad].push({ id: row.id, vec });
    } catch { /* skip malformed */ }
  }

  const traditions = Object.entries(byTradition).map(([trad, items]) => {
    const n = items.length;
    const principles = VECTOR_KEY.map((key, idx) => {
      const vals = items.map(it => it.vec[idx] ?? 0);
      const mean = vals.reduce((s, v) => s + v, 0) / n;
      const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
      return { key, mean: +mean.toFixed(3), stddev: +Math.sqrt(variance).toFixed(3) };
    });
    return { tradition: trad, n, principles };
  });

  return new Response(JSON.stringify({ traditions }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
