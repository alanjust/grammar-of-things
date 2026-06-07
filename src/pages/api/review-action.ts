// Approve or reject a record from the human review queue.
// Approve: runs the standard MCP ingestion path (rights already passed, sensitivity cleared by human).
// Reject: marks the record as rejected; it will never be auto-ingested.

import type { APIRoute } from 'astro';
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const env = cfEnv as unknown as Record<string, any>;
  const db  = env.DB;

  if (!db) return json({ error: 'DB binding unavailable.' }, 500);

  let body: any;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid JSON.' }, 400); }

  const { id, action, reviewer_note } = body;
  if (typeof id !== 'number' || (action !== 'approve' && action !== 'reject')) {
    return json({ error: '"id" (number) and "action" ("approve"|"reject") required.' }, 400);
  }

  const row = await db.prepare(
    "SELECT * FROM review_queue WHERE id = ? AND status = 'pending'"
  ).bind(id).first() as any;

  if (!row) return json({ error: `Review queue item ${id} not found or already reviewed.` }, 404);

  if (action === 'reject') {
    await db.prepare(
      "UPDATE review_queue SET status = 'rejected', reviewer_note = ?, reviewed_at = datetime('now') WHERE id = ?"
    ).bind(reviewer_note ?? null, id).run();
    return json({ rejected: true, id });
  }

  // Approve: ingest the record (sensitivity check cleared by human)
  let record: any;
  try { record = JSON.parse(row.object_record); }
  catch { return json({ error: 'Could not parse stored ObjectRecord.' }, 500); }

  // Dedupe
  const ark             = record.claim.identifiers.ark;
  const accessionNumber = record.claim.identifiers.accession_number;
  let existingId: number | null = null;

  if (ark) {
    const r = await db.prepare('SELECT id FROM objects WHERE ezid_ark = ?').bind(ark).first();
    if (r) existingId = (r as any).id;
  }
  if (!existingId && accessionNumber) {
    const r = await db.prepare('SELECT id FROM objects WHERE accession_number = ?').bind(accessionNumber).first();
    if (r) existingId = (r as any).id;
  }

  let objectId = existingId;

  if (!existingId) {
    const insertResult = await db.prepare(`
      INSERT INTO objects (
        ezid_ark, catalog_number, accession_number,
        attribution_culture, doc_raw, doc_structured,
        source_institution, source_url,
        image_spec, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(
      ark,
      record.claim.identifiers.catalog_number,
      accessionNumber,
      record.claim.attribution.culture,
      record.claim.raw,
      JSON.stringify(record.claim.structured),
      record.claim.source.institution,
      record.claim.source.url,
      '1568px-long-edge-jpeg-q85',
    ).run();
    objectId = insertResult.meta?.last_row_id as number;
  }

  // Mark as approved
  await db.prepare(
    "UPDATE review_queue SET status = 'approved', reviewer_note = ?, reviewed_at = datetime('now') WHERE id = ?"
  ).bind(reviewer_note ?? null, id).run();

  // Note: image fetch and fingerprinting are deferred to a background job or
  // manual trigger — the /api/mcp-ingest endpoint handles the full pipeline.
  // Here we just get the record into the DB so it appears in the corpus.

  return json({ approved: true, id, object_id: objectId });
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}
