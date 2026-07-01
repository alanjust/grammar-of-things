import Anthropic from '@anthropic-ai/sdk';
import type { DocStructured, DocCanonical } from '../db/types';

// Documentation extraction — Track B.
// Runs independently of Pass 1; documentation never enters Pass 1 context.
// Two cheap Haiku-class calls: raw paste → structured JSON, then structured → canonical.

// Layer 2: AI splits the raw paste into structured JSON (institution field names preserved).
const LAYER2_PROMPT = (raw: string) => `You are given raw text pasted from a museum or institutional catalog record for an artifact.

Extract every field present into a JSON object. Rules:
- Preserve the institution's original field names exactly as they appear.
- If a field has sub-fields, flatten with a space separator (e.g. "Dimension Width").
- Omit fields with no value.
- Guess the source institution from the record content if possible; otherwise null.

Output ONLY valid JSON. No markdown, no commentary.
Format: { "institution": "<name or null>", "fields": { "<field_name>": "<value>", ... } }

RAW RECORD:
${raw}`;

// Layer 3: AI maps structured JSON to canonical cross-institution vocabulary.
const LAYER3_PROMPT = (structured: DocStructured) => `Map the structured artifact catalog record below to the canonical schema.

Rules:
- Map conservatively. Output null for any field not present in the source record.
- Do not infer or guess values not stated in the source.
- For culture_confidence: "reading" = clearly stated, "hypothesis" = inferred from context, "indeterminate" = absent or ambiguous.
- List any fields you are uncertain about in mapping_flags.
- Output ONLY valid JSON matching the schema exactly.

STRUCTURED RECORD:
${JSON.stringify(structured, null, 2)}

Output this schema exactly:
{
  "ezid_ark": null,
  "catalog_number": null,
  "accession_number": null,
  "culture": null,
  "culture_confidence": "reading | hypothesis | indeterminate | null",
  "period": null,
  "object_type": null,
  "material": null,
  "dimensions": null,
  "site": null,
  "collection": null,
  "source_institution": null,
  "source_url": null,
  "condition": null,
  "notes": null,
  "mapping_flags": []
}`;

function parseJson<T>(text: string): T | null {
  const cleaned = text.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end   = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try { return JSON.parse(cleaned.slice(start, end + 1)) as T; }
  catch { return null; }
}

export interface DocLayers {
  raw:        string;           // layer 1: verbatim
  structured: DocStructured;   // layer 2: AI-split JSON
  canonical:  DocCanonical;    // layer 3: mapped canonical fields
}

// Run Track B for a non-empty raw paste.
// Returns all three layers. Uses the provided Anthropic client and model.
export async function extractDocLayers(
  raw: string,
  anthropic: Anthropic,
  model: string,
): Promise<DocLayers> {
  const now = new Date().toISOString();

  // Layer 2 — structured extraction
  const layer2Msg = await anthropic.messages.create({
    model,
    max_tokens: 8000,
    system: 'You are a data extraction assistant. Output ONLY valid JSON. No markdown, no commentary.',
    messages: [{ role: 'user', content: [{ type: 'text', text: LAYER2_PROMPT(raw) }] }],
  });
  const layer2Text = layer2Msg.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
  const layer2 = parseJson<{ institution: string | null; fields: Record<string, string> }>(layer2Text);
  const structured: DocStructured = {
    institution: layer2?.institution ?? null,
    fields: layer2?.fields ?? {},
    parsed_at: now,
  };

  // Layer 3 — canonical mapping
  const layer3Msg = await anthropic.messages.create({
    model,
    max_tokens: 8000,
    system: 'You are a data mapping assistant. Output ONLY valid JSON. No markdown, no commentary.',
    messages: [{ role: 'user', content: [{ type: 'text', text: LAYER3_PROMPT(structured) }] }],
  });
  const layer3Text = layer3Msg.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
  const layer3Raw = parseJson<Partial<DocCanonical>>(layer3Text);
  const canonical: DocCanonical = {
    culture:            layer3Raw?.culture            ?? null,
    culture_confidence: layer3Raw?.culture_confidence ?? null,
    period:             layer3Raw?.period             ?? null,
    object_type:        layer3Raw?.object_type        ?? null,
    material:           layer3Raw?.material           ?? null,
    dimensions:         layer3Raw?.dimensions         ?? null,
    site:               layer3Raw?.site               ?? null,
    collection:         layer3Raw?.collection         ?? null,
    source_institution: layer3Raw?.source_institution ?? structured.institution ?? null,
    source_url:         layer3Raw?.source_url         ?? null,
    condition:          layer3Raw?.condition          ?? null,
    notes:              layer3Raw?.notes              ?? null,
    mapping_flags:      layer3Raw?.mapping_flags      ?? [],
    mapped_at:          now,
    ezid_ark:           layer3Raw?.ezid_ark           ?? null,
    catalog_number:     layer3Raw?.catalog_number     ?? null,
    accession_number:   layer3Raw?.accession_number   ?? null,
  };

  return { raw, structured, canonical };
}
