// MCP-sourced ingestion endpoint.
// Calls the Collections MCP HTTP server at MCP_URL env var (default: http://localhost:3456).
// Additive: does not change the existing /api/ingest path.
//
// Flow (brief §"How a site consumes it"):
//   1. Call MCP get_object via HTTP
//   2. Rights gate → skip if not passed
//   3. Sensitivity flag → queue for human review, do not auto-ingest
//   4. Dedupe by ARK then accession number
//   5. Map claim fields → objects columns (doc_raw quarantined from Pass 1)
//   6. Fetch image → R2 (original + normalized analysis copy)
//   7. Canonical fingerprinter (Pass 1 blind — doc_raw excluded from context)

import type { APIRoute } from 'astro';
import Anthropic          from '@anthropic-ai/sdk';
import { env as cfEnv }  from 'cloudflare:workers';
import { resolveModelConfig, streamModel, callModel } from '../../lib/model-router';
import { normalizeImage, dataUrlToBlob, IMAGE_SPEC } from '../../lib/image';
import {
  ARTIFACT_PRINCIPLE_NAMES, APPLICABLE_TIER_A_NAMES,
  PASS1_PROMPT_SINGLE, VECTOR_SCORING_PROMPT,
} from '../../lib/principles';
import { serializeVector } from '../../db/types';

// Minimal ObjectRecord shape — mirrors the MCP contract without cross-package import
interface McpObjectRecord {
  source:           string;
  source_object_id: string;
  image: {
    image_mode:         'full' | 'reference';  // 'reference' → no archival image, skip fingerprint
    original_url:       string | null;
    thumbnail_url:      string | null;
    best_long_edge_url: string | null;
  };
  claim: {
    identifiers: { ark: string | null; catalog_number: string | null; accession_number: string | null };
    attribution: { culture: string | null };
    structured:  { institution: string; fields: Record<string, string>; parsed_at: string };
    raw:         string;
    source:      { institution: string; url: string | null };
  };
  rights:          { determination: string; raw_statement: string; passed_gate: boolean };
  sensitivity_flag: boolean;
}

export const prerender = false;

const PASS1_SYSTEM = 'You are a trained artifact observer. Report only what is directly present and physically observable. Read surface features as production evidence. No interpretation, no cultural attribution, no quality judgments.';

// ── MCP HTTP client ──────────────────────────────────────────────────────────

async function callMcpTool(
  mcpUrl: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const res = await fetch(`${mcpUrl}/mcp`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Accept':        'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id:      1,
      method:  'tools/call',
      params:  { name: toolName, arguments: args },
    }),
  });

  if (!res.ok) throw new Error(`MCP HTTP error: ${res.status}`);

  const text = await res.text();

  // Parse SSE — find the first data line after the event line
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const payload = JSON.parse(trimmed.slice(5).trim()) as {
      result?: { content?: Array<{ type: string; text: string }> };
      error?:  { message: string };
    };
    if (payload.error) throw new Error(`MCP tool error: ${payload.error.message}`);
    const content = payload.result?.content?.[0]?.text;
    if (content) return JSON.parse(content);
  }

  throw new Error('MCP returned no data event');
}

// ── Main handler ─────────────────────────────────────────────────────────────

export const POST: APIRoute = async ({ request }) => {
  const env    = cfEnv as unknown as Record<string, any>;
  const db     = env.DB;
  const r2     = env.ARTIFACTS;
  const apiKey = env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
  const mcpUrl = (env.MCP_URL as string | undefined) || process.env.MCP_URL || 'http://localhost:3456';

  if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY not set.' }, 500);
  if (!db)     return json({ error: 'DB binding unavailable.' }, 500);

  let body: any;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid JSON.' }, 400); }

  const { source, source_object_id } = body;
  if (typeof source !== 'string' || typeof source_object_id !== 'string') {
    return json({ error: '"source" and "source_object_id" strings required.' }, 400);
  }

  // ── Step 1: Get ObjectRecord from MCP ─────────────────────────────────────
  let record: McpObjectRecord;
  try {
    record = await callMcpTool(mcpUrl, 'get_object', { source, source_object_id }) as McpObjectRecord;
  } catch (err) {
    return json({
      error: `MCP call failed: ${err instanceof Error ? err.message : String(err)}`,
      hint:  `Is the MCP server running at ${mcpUrl}? Start with: cd ~/grammar-collections-mcp && npm run start -- --http-only`,
    }, 502);
  }

  // ── Step 1b: Reference-mode — claim-only ingestion ───────────────────────
  // image_mode="reference": licensed metadata retrievable, full image is not.
  // The claim side is stored in full; image fetch and fingerprinting are skipped.
  // A3 rule: never fingerprint a thumbnail — the canonical vector must come
  // from an archival full-resolution image only.
  // Reference records still participate in cross-source reconciliation.
  if (record.image.image_mode === 'reference') {
    // Dedupe first (same logic as full mode)
    const refArk       = record.claim.identifiers.ark;
    const refAccession = record.claim.identifiers.accession_number;
    let refExistingId: number | null = null;

    if (refArk) {
      const row = await db.prepare('SELECT id FROM objects WHERE ezid_ark = ?').bind(refArk).first();
      if (row) refExistingId = (row as any).id;
    }
    if (!refExistingId && refAccession) {
      const row = await db.prepare('SELECT id FROM objects WHERE accession_number = ?').bind(refAccession).first();
      if (row) refExistingId = (row as any).id;
    }

    if (refExistingId) {
      // Attach claim to existing object
      await db.prepare(`
        INSERT INTO object_claims (object_id, source_institution, source_url, attribution_culture, doc_raw, doc_structured)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(refExistingId, record.claim.source.institution, record.claim.source.url,
              record.claim.attribution.culture, record.claim.raw,
              JSON.stringify(record.claim.structured)).run();
      return json({ updated: true, object_id: refExistingId, image_mode: 'reference', fingerprinted: false, source, source_object_id });
    }

    // Insert new reference-mode object (no image keys, no fingerprint)
    const refInsert = await db.prepare(`
      INSERT INTO objects (
        ezid_ark, catalog_number, accession_number,
        attribution_culture, doc_raw, doc_structured,
        source_institution, source_url,
        image_spec, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'reference-mode-no-image', datetime('now'), datetime('now'))
    `).bind(refArk, record.claim.identifiers.catalog_number, refAccession,
            record.claim.attribution.culture, record.claim.raw,
            JSON.stringify(record.claim.structured),
            record.claim.source.institution, record.claim.source.url).run();

    const refObjectId = refInsert.meta?.last_row_id as number;

    await db.prepare(`
      INSERT INTO object_claims (object_id, source_institution, source_url, attribution_culture, doc_raw, doc_structured)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(refObjectId, record.claim.source.institution, record.claim.source.url,
            record.claim.attribution.culture, record.claim.raw,
            JSON.stringify(record.claim.structured)).run();

    return json({
      created:      true,
      object_id:    refObjectId,
      image_mode:   'reference',
      fingerprinted: false,
      message:      'Reference-mode: claim stored, no archival image, fingerprinting skipped (A3 rule).',
      source, source_object_id,
    });
  }

  // ── Step 2: Rights gate ───────────────────────────────────────────────────
  if (!record.rights.passed_gate) {
    return json({
      skipped:       true,
      reason:        'rights_gate',
      determination: record.rights.determination,
      raw_statement: record.rights.raw_statement,
      source, source_object_id,
    });
  }

  // ── Step 2b: Sensitivity flag → human review queue ────────────────────────
  if (record.sensitivity_flag) {
    await db.prepare(`
      INSERT INTO review_queue (source, source_object_id, object_record, flag_reason)
      VALUES (?, ?, ?, 'sensitivity_flag')
    `).bind(source, source_object_id, JSON.stringify(record)).run();

    return json({
      queued:  true,
      reason:  'sensitivity_flag',
      message: 'Queued for human review. Visit /review to approve or reject.',
      source, source_object_id,
    });
  }

  // ── Step 3: Dedupe — match by ARK, then accession ─────────────────────────
  const ark             = record.claim.identifiers.ark;
  const accessionNumber = record.claim.identifiers.accession_number;
  let existingId: number | null = null;

  if (ark) {
    const row = await db.prepare('SELECT id FROM objects WHERE ezid_ark = ?').bind(ark).first();
    if (row) existingId = row.id as number;
  }
  if (!existingId && accessionNumber) {
    const row = await db.prepare('SELECT id FROM objects WHERE accession_number = ?').bind(accessionNumber).first();
    if (row) existingId = row.id as number;
  }

  if (existingId) {
    // ── Cross-source reconciliation (Step 5) ──────────────────────────────
    // Insert this source's claim into object_claims (one row per source assertion).
    await db.prepare(`
      INSERT INTO object_claims (object_id, source_institution, source_url, attribution_culture, doc_raw, doc_structured)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      existingId,
      record.claim.source.institution,
      record.claim.source.url,
      record.claim.attribution.culture,
      record.claim.raw,
      JSON.stringify(record.claim.structured),
    ).run();

    // Check for disagreement: does this source's culture claim differ from the stored one?
    const stored    = ((await db.prepare('SELECT attribution_culture FROM objects WHERE id = ?').bind(existingId).first()) as any)?.attribution_culture ?? null;
    const incoming  = record.claim.attribution.culture;
    const conflict  = !!(incoming && stored && incoming.toLowerCase().trim() !== stored.toLowerCase().trim());

    if (conflict) {
      await db.prepare(`UPDATE objects SET claim_conflict = 1, updated_at = datetime('now') WHERE id = ?`).bind(existingId).run();
    }

    return json({ updated: true, object_id: existingId, claim_conflict: conflict, source, source_object_id });
  }

  // ── Step 4: Insert object with mapped claim fields ────────────────────────
  // doc_raw → layer 1 (verbatim, quarantined from Pass 1)
  // doc_structured → layer 2 (institution's own fields)
  // doc_canonical is set by the site's canonical layer, not the MCP
  const insertResult = await db.prepare(`
    INSERT INTO objects (
      ezid_ark, catalog_number, accession_number,
      attribution_culture, attribution_confidence, attribution_mapping_notes,
      doc_raw, doc_structured,
      source_institution, source_url,
      image_spec, created_at, updated_at
    ) VALUES (?, ?, ?, ?, null, null, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    ark,
    record.claim.identifiers.catalog_number,
    accessionNumber,
    record.claim.attribution.culture,
    record.claim.raw,                         // doc_raw: verbatim, never modified
    JSON.stringify(record.claim.structured),  // doc_structured: institution's fields
    record.claim.source.institution,
    record.claim.source.url,
    IMAGE_SPEC,
  ).run();

  const objectId = insertResult.meta?.last_row_id as number;

  // Store first claim in object_claims so the table is always complete
  await db.prepare(`
    INSERT INTO object_claims (object_id, source_institution, source_url, attribution_culture, doc_raw, doc_structured)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    objectId,
    record.claim.source.institution,
    record.claim.source.url,
    record.claim.attribution.culture,
    record.claim.raw,
    JSON.stringify(record.claim.structured),
  ).run();

  // ── Step 5: Fetch image → R2 ─────────────────────────────────────────────
  const imageUrl    = record.image.best_long_edge_url ?? record.image.original_url;
  let originalKey: string | null = null;
  let analysisKey:  string | null = null;

  if (imageUrl && r2) {
    try {
      const imgRes = await fetch(imageUrl);
      if (imgRes.ok) {
        const imgBuffer = await imgRes.arrayBuffer();
        const b64       = bufferToBase64(imgBuffer);

        originalKey = `objects/${objectId}/0-mcp-original.jpg`;
        await r2.put(originalKey, new Uint8Array(imgBuffer), { httpMetadata: { contentType: 'image/jpeg' } });

        const normalized = await normalizeImage(`data:image/jpeg;base64,${b64}`);
        const { bytes: normBytes } = dataUrlToBlob(normalized.dataUrl);
        analysisKey = `objects/${objectId}/0-mcp-analysis.jpg`;
        await r2.put(analysisKey, normBytes, { httpMetadata: { contentType: 'image/jpeg' } });

        await db.prepare(`
          UPDATE objects SET
            image_original_key = ?, image_analysis_key = ?, updated_at = datetime('now')
          WHERE id = ?
        `).bind(originalKey, analysisKey, objectId).run();
      }
    } catch (imgErr) {
      console.error('[mcp-ingest] image store failed:', imgErr);
    }
  }

  // ── Step 6: Canonical fingerprinter — Pass 1 blind ───────────────────────
  // doc_raw is quarantined and must never appear in Pass 1 context.
  const modelConfig = resolveModelConfig(env);
  const anthropic   = new Anthropic({ apiKey });
  let fingerprintVector: string | null = null;
  let fingerprintModel:  string | null = null;
  let fingerprintPass1:  string | null = null;

  if (analysisKey && r2) {
    try {
      const imgObj = await r2.get(analysisKey);
      if (imgObj) {
        const buf   = await imgObj.arrayBuffer();
        const b64   = bufferToBase64(buf);

        const imageBlocks = [
          { type: 'text'  as const, text: '[Primary view]' },
          { type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: b64 } },
        ];

        const pass1Stream = streamModel(modelConfig.pass1, {
          max_tokens: 2048,
          system:     PASS1_SYSTEM,
          messages:   [{ role: 'user', content: [...imageBlocks, { type: 'text', text: PASS1_PROMPT_SINGLE(ARTIFACT_PRINCIPLE_NAMES, APPLICABLE_TIER_A_NAMES) }] }],
        }, anthropic);

        let pass1Acc = '';
        for await (const event of pass1Stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            pass1Acc += event.delta.text;
          }
        }
        const pass1Msg   = await pass1Stream.finalMessage();
        fingerprintModel = pass1Msg.model;
        fingerprintPass1 = pass1Acc;

        const vectorMsg = await callModel(modelConfig.vector, {
          max_tokens: 512,
          system:     'Output ONLY a flat JSON object. Begin with { and end with }.',
          messages:   [{ role: 'user', content: [{ type: 'text', text: VECTOR_SCORING_PROMPT(pass1Acc) }] }],
        }, anthropic);

        let vText = vectorMsg.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim();
        const vS = vText.indexOf('{'), vE = vText.lastIndexOf('}');
        if (vS !== -1 && vE > vS) vText = vText.slice(vS, vE + 1);
        fingerprintVector = serializeVector(JSON.parse(vText));

        await db.prepare(`
          UPDATE objects SET
            fingerprint_vector     = ?,
            fingerprint_model      = ?,
            fingerprint_pass1_text = ?,
            fingerprinted_at       = datetime('now'),
            updated_at             = datetime('now')
          WHERE id = ?
        `).bind(fingerprintVector, fingerprintModel, fingerprintPass1, objectId).run();
      }
    } catch (fpErr) {
      console.error('[mcp-ingest] fingerprint failed:', fpErr);
    }
  }

  return json({
    created:          true,
    object_id:        objectId,
    source,
    source_object_id,
    fingerprinted:    !!fingerprintVector,
    images_stored:    !!(originalKey && analysisKey),
  });
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary  = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary);
}
