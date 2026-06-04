import type { APIRoute } from 'astro';
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

// Target chunk size in characters (~400-600 words, ~500-750 tokens)
const CHUNK_TARGET = 2400;
const CHUNK_MIN    = 200;

/**
 * Split extracted text into overlapping chunks suitable for retrieval.
 * Splits on paragraph boundaries first, then sentence boundaries if needed.
 */
function chunkText(text: string): string[] {
  // Normalize whitespace
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const paragraphs = normalized.split(/\n\n+/).filter(p => p.trim().length >= CHUNK_MIN);

  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    if (current.length + para.length + 2 <= CHUNK_TARGET) {
      current += (current ? '\n\n' : '') + para;
    } else {
      if (current.length >= CHUNK_MIN) chunks.push(current.trim());

      if (para.length <= CHUNK_TARGET) {
        current = para;
      } else {
        // Split long paragraph on sentence boundaries
        const sentences = para.match(/[^.!?]+[.!?]+(?:\s|$)/g) ?? [para];
        current = '';
        for (const sent of sentences) {
          if (current.length + sent.length + 1 <= CHUNK_TARGET) {
            current += (current ? ' ' : '') + sent.trim();
          } else {
            if (current.length >= CHUNK_MIN) chunks.push(current.trim());
            current = sent.trim();
          }
        }
      }
    }
  }
  if (current.trim().length >= CHUNK_MIN) chunks.push(current.trim());
  return chunks;
}

export const POST: APIRoute = async ({ request }) => {
  const env = cfEnv as unknown as Record<string, any>;
  const db  = env.DB;
  const r2  = env.ARTIFACTS;

  if (!db) return new Response(JSON.stringify({ error: 'DB unavailable.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });

  let body: any;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ error: 'Invalid JSON.' }), { status: 400, headers: { 'Content-Type': 'application/json' } }); }

  const {
    citation_key, title, author, year, doc_type = 'book',
    doi, source_url, notes,
    extracted_text,
    page_start,        // optional: starting page number (integer)
    section_ref,       // optional: overall section/chapter label
    file_data,         // optional: base64-encoded original PDF
    file_name,
  } = body;

  if (!citation_key || !title || !author || !extracted_text) {
    return new Response(JSON.stringify({ error: 'citation_key, title, author, and extracted_text are required.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Store original PDF in R2 if provided
  let file_key: string | null = null;
  if (file_data && r2 && file_name) {
    try {
      const binary  = atob(file_data);
      const bytes   = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const safeKey = `library/${citation_key.toLowerCase().replace(/[^a-z0-9-]/g, '-')}/${file_name}`;
      await r2.put(safeKey, bytes, { httpMetadata: { contentType: 'application/pdf' } });
      file_key = safeKey;
    } catch { /* R2 upload is optional — continue without */ }
  }

  // Insert document row
  const docResult = await db.prepare(`
    INSERT INTO documents (citation_key, title, author, year, doc_type, doi, source_url, notes, file_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(citation_key, title, author, year ?? null, doc_type, doi ?? null, source_url ?? null, notes ?? null, file_key).run();

  const docId = docResult.meta?.last_row_id;
  if (!docId) {
    return new Response(JSON.stringify({ error: 'Failed to insert document.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Chunk the text
  const chunks = chunkText(extracted_text);
  if (chunks.length === 0) {
    return new Response(JSON.stringify({ error: 'No usable text found after chunking.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Insert chunks in batches of 50 (D1 batch limit)
  const BATCH = 50;
  let inserted = 0;

  for (let start = 0; start < chunks.length; start += BATCH) {
    const slice = chunks.slice(start, start + BATCH);

    // Insert into document_chunks
    const chunkInserts = slice.map((text, i) => {
      const idx      = start + i;
      const pageRef  = page_start ? `p.${page_start + idx}` : null;
      return db.prepare(
        'INSERT INTO document_chunks (document_id, chunk_index, chunk_text, page_ref, section_ref) VALUES (?,?,?,?,?)'
      ).bind(docId, idx, text, pageRef, section_ref ?? null);
    });
    const chunkResults = await db.batch(chunkInserts);

    // Insert into FTS — we need the row IDs from chunk inserts
    // Use the first inserted ID + offset to compute rowids
    const firstId = chunkResults[0]?.meta?.last_row_id;
    if (firstId) {
      const ftsInserts = slice.map((text, i) => {
        const rowid   = firstId + i;
        const idx     = start + i;
        const pageRef = page_start ? `p.${page_start + idx}` : null;
        return db.prepare(
          'INSERT INTO chunks_fts (rowid, chunk_text, document_id, citation_key, page_ref, section_ref) VALUES (?,?,?,?,?,?)'
        ).bind(rowid, text, docId, citation_key, pageRef, section_ref ?? null);
      });
      await db.batch(ftsInserts);
    }

    inserted += slice.length;
  }

  // Update chunk count
  await db.prepare('UPDATE documents SET chunk_count = ? WHERE id = ?').bind(inserted, docId).run();

  return new Response(JSON.stringify({
    id:          docId,
    citation_key,
    chunk_count: inserted,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
