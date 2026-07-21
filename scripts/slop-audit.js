#!/usr/bin/env node
// Slop audit — flags generic AI-writing tells in a piece of generated prose.
// Run: node scripts/slop-audit.js path/to/text.txt
//   or: pbpaste | node scripts/slop-audit.js
//
// This is a spot-check tool, not a deploy gate — content is generated
// per-request, not part of repo state, so there's nothing static to scan
// on every deploy the way token-audit.js scans component CSS. Paste a
// generated analysis through this when something reads off.
//
// Keep this word/pattern list in sync with src/lib/anti-slop.ts by hand —
// scripts/ runs as plain Node with no TS build step, so it can't import
// that file directly. This is a DIFFERENT list from ARTIFACT_PROMPT's
// fine-art-vocabulary bans in src/pages/api/artifact.ts — those calibrate
// archaeological register, this catches generic LLM writing tics.

import { readFileSync } from 'fs';

const BARE_WORDS = [
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

const PHRASE_PATTERNS = [
  { name: 'pushes/blurs boundaries', pattern: /\b(push(?:es|ing)?|blur(?:s|ring)?|redefin(?:es|ing|ed))\s+(?:the\s+)?boundar(?:y|ies)\b/i },
  { name: 'rich history/tradition', pattern: /\brich\s+(?:history|tradition)\b/i },
  { name: 'elevates the work', pattern: /\belevat(?:es?|ing)\s+(?:the\s+)?(?:work|piece|object|artifact)\b/i },
  { name: 'navigates the tension between', pattern: /\bnavigat(?:es?|ing)\s+(?:the\s+)?(?:tension|complexity|relationship)\s+between\b/i },
  { name: 'not just X, but Y', pattern: /\bnot\s+(?:just|only)\b[^.?!]{0,60}\b(?:but|it'?s)\b/i },
  { name: 'signposting', pattern: /\b(?:firstly|secondly|in conclusion|overall,)\b/i },
  { name: 'hollow uplift close', pattern: /\b(?:a testament to|reminds us (?:that )?(?:art|artifacts) can|speaks to the (?:human condition|power of))\b/i },
  { name: 'em dash', pattern: /—/ },
];

function readInput() {
  const file = process.argv[2];
  if (file) return readFileSync(file, 'utf8');
  try {
    return readFileSync(0, 'utf8'); // stdin
  } catch {
    console.error('Usage: node scripts/slop-audit.js <file>  (or pipe text via stdin)');
    process.exit(2);
  }
}

const text = readInput();
const lower = text.toLowerCase();

const wordHits = BARE_WORDS.filter(w => lower.includes(w.toLowerCase()));
const phraseHits = PHRASE_PATTERNS.filter(p => p.pattern.test(text)).map(p => p.name);

if (wordHits.length === 0 && phraseHits.length === 0) {
  console.log('✓ Slop audit passed — no flagged words or patterns found.');
  process.exit(0);
}

if (wordHits.length) {
  console.error(`\n  Flagged words: ${wordHits.join(', ')}`);
}
if (phraseHits.length) {
  console.error(`  Flagged patterns: ${phraseHits.join(', ')}`);
}
console.error(`\n✗ Slop audit found ${wordHits.length + phraseHits.length} issue(s).`);
process.exit(1);
