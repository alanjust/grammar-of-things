// Document retrieval — searches the FTS5 index and returns formatted citation passages
// for injection into Pass 2 prompts.
//
// Design: retrieved passages go in the user message (not the cached system prompt),
// so the A1 prompt cache is never invalidated by changing reference material.

// Stopwords to exclude from FTS query terms
const STOP = new Set([
  'the','and','for','are','but','not','you','all','can','had','her','was','one',
  'our','out','day','get','has','him','his','how','man','new','now','old','see',
  'two','way','who','boy','did','its','let','put','say','she','too','use','that',
  'this','with','from','they','have','been','will','what','when','were','into',
  'would','could','there','their','which','about','should','being','these',
  'those','after','other','also','than','then','some','such','each','more',
  'both','many','very','most','much','just','same','only','over','even',
  'does','here','well','back','through','where','object','image','visible',
  'present','shows','appears','observed','analysis','surface','found',
]);

/**
 * Build a FTS5 MATCH query from tradition name and Pass 1 text.
 * Extracts archaeological terms, filters stop words, builds an OR query.
 */
export function buildSearchQuery(tradition: string | null, pass1Text: string): string {
  const terms: Set<string> = new Set();

  // Tradition is the strongest signal
  if (tradition && tradition !== 'unknown') {
    terms.add(tradition.toLowerCase());
    // Common tradition synonyms / sub-terms
    if (tradition === 'mimbres')             terms.add('mimbres');
    if (tradition === 'hohokam')             terms.add('hohokam');
    if (tradition === 'ancestral_puebloan')  { terms.add('ancestral'); terms.add('puebloan'); }
    if (tradition === 'casas_grandes')       { terms.add('casas'); terms.add('paquime'); }
  }

  // Extract significant terms from Pass 1 text (words ≥ 6 chars, not stop words)
  const words = (pass1Text.match(/\b[a-zA-Z]{6,}\b/g) ?? [])
    .map(w => w.toLowerCase())
    .filter(w => !STOP.has(w));

  // Frequency map — prefer terms that appear multiple times
  const freq: Record<string, number> = {};
  for (const w of words) freq[w] = (freq[w] ?? 0) + 1;

  // Top 12 most frequent terms
  Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .forEach(([w]) => terms.add(w));

  if (terms.size === 0) return '';
  return [...terms].join(' OR ');
}

export interface RetrievedPassage {
  citation: string;   // e.g. "[BRODY-2004, p.127]"
  text:     string;
}

/**
 * Search the FTS index and return formatted passages.
 * Returns empty array gracefully if library is empty or table doesn't exist.
 */
export async function retrievePassages(
  db: any,
  query: string,
  limit = 5,
): Promise<RetrievedPassage[]> {
  if (!db || !query) return [];

  try {
    const result = await db.prepare(`
      SELECT
        f.chunk_text,
        f.citation_key,
        f.page_ref,
        f.section_ref
      FROM chunks_fts f
      WHERE chunks_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).bind(query, limit).all();

    return (result.results ?? []).map((r: any) => ({
      citation: `[${r.citation_key}${r.page_ref ? ', ' + r.page_ref : ''}]`,
      text:     r.chunk_text.length > 600 ? r.chunk_text.slice(0, 600) + '…' : r.chunk_text,
    }));
  } catch {
    // FTS table may not exist yet (before migration runs) — degrade gracefully
    return [];
  }
}

/**
 * Format retrieved passages for injection into the Pass 2 user message.
 * Returns empty string if no passages found (no effect on prompt).
 */
export function formatReferences(passages: RetrievedPassage[]): string {
  if (passages.length === 0) return '';

  const block = passages
    .map(p => `${p.citation}: "${p.text}"`)
    .join('\n\n');

  return `\n\n---\n\nREFERENCE PASSAGES (from document corpus — cite inline using the citation key when these passages ground a specific claim):\n\n${block}`;
}
