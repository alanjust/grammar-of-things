// Guardrail against generic AI-writing tells ("AI slop" / LLM-ese) — injected
// into every prose-generating prompt in this project.
//
// Positive voice instructions (Ira Glass, "trained artifact observer") reduce
// drift toward this register but don't reliably suppress it — the underlying
// model still defaults to this vocabulary under pressure regardless of
// persona. This block bans it explicitly.
//
// This is a DIFFERENT concern from this codebase's existing fine-art-vocabulary
// bans (ARTIFACT_PROMPT's "do not use: painterly, aesthetic, compositional
// tension..." lists in artifact.ts). Those exist to keep archaeological
// register from drifting into museum-wall-label fine-art criticism — a
// domain-register problem. This module targets the separate, cross-domain
// problem of generic LLM writing tics that show up regardless of register.
// Do not merge the two lists; they solve different problems.
//
// Two tiers here, because several classic "slop words" are also legitimate,
// literal terms in observational description. Bare-word bans are for words
// with no legitimate descriptive use. Phrase-pattern bans target the cliché
// construction without banning the underlying word (e.g. "boundary" is a
// real term for where two materials or wear-patterns meet; "pushes
// boundaries" is the cliché).

export const SLOP_BARE_WORDS: string[] = [
  'delve', 'delves', 'delving',
  'tapestry',
  'testament',
  'underscore', 'underscores', 'underscoring',
  'resonate', 'resonates', 'resonant', 'resonance',
  'multifaceted',
  'nuanced',
  'profound', 'profoundly',
  'treasure trove',
  'hidden gem',
  'unpack', 'unpacks', 'unpacking',
  'awe-inspiring',
  'must-see',
  'game-changing', 'game changer',
  'masterpiece',
  'iconic',
  'stunning',
  'breathtaking',
  'timeless',
  'showcase', 'showcases', 'showcasing',
  'interplay',
  'immersive',
  'captivate', 'captivates', 'captivating',
  'realm',
];

export const SLOP_PHRASE_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: 'pushes/blurs boundaries', pattern: /\b(push(?:es|ing)?|blur(?:s|ring)?|redefin(?:es|ing|ed))\s+(?:the\s+)?boundar(?:y|ies)\b/i },
  { name: 'rich history/tradition', pattern: /\brich\s+(?:history|tradition)\b/i },
  { name: 'elevates the work', pattern: /\belevat(?:es?|ing)\s+(?:the\s+)?(?:work|piece|object|artifact)\b/i },
  { name: 'navigates the tension between', pattern: /\bnavigat(?:es?|ing)\s+(?:the\s+)?(?:tension|complexity|relationship)\s+between\b/i },
  { name: 'not just X, but Y', pattern: /\bnot\s+(?:just|only)\b[^.?!]{0,60}\b(?:but|it'?s)\b/i },
  { name: 'signposting', pattern: /\b(?:firstly|secondly|in conclusion|overall,)\b/i },
  { name: 'hollow uplift close', pattern: /\b(?:a testament to|reminds us (?:that )?(?:art|artifacts) can|speaks to the (?:human condition|power of))\b/i },
  { name: 'em dash', pattern: /—/ },
];

export const AI_TELL_GUARDRAIL = `AVOID GENERIC AI-WRITING TELLS: Never use these words: ${SLOP_BARE_WORDS.join(', ')}. Never write "not just X, but Y" or "it's not only X, it's Y." Never signpost ("firstly," "in conclusion," "overall"). Never close on a hollow uplift line ("a testament to...," "reminds us that objects can..."). Don't reach for a rule-of-three list for its rhythm alone. Words like "boundaries," "rich," and "elevate" are fine when they describe something literal about this object, just not fine as the cliche ("pushes boundaries," "rich history," "elevates the piece"). Never use an em dash, not even one; write the sentence a different way instead, with a comma, a period, a colon, or parentheses. If a sentence could appear in any other piece of writing about any other object, cut it. Every sentence should be true of this object and no other.`;

export function auditText(text: string): { words: string[]; phrases: string[] } {
  const lower = text.toLowerCase();
  const words = SLOP_BARE_WORDS.filter(term => lower.includes(term.toLowerCase()));
  const phrases = SLOP_PHRASE_PATTERNS.filter(p => p.pattern.test(text)).map(p => p.name);
  return { words, phrases };
}
