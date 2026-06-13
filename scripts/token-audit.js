#!/usr/bin/env node
/**
 * token-audit.js — CSS design-token enforcement
 *
 * Scans src/**\/*.css and src/**\/*.astro for hardcoded values that should
 * use variables from src/styles/tokens.css.
 *
 * Exit 1 if any ERRORs are found; exit 0 if only warnings or clean.
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── Token lookup map ────────────────────────────────────────────────────────
// Maps raw hardcoded values → the correct CSS custom-property.
// Keys must be lowercase and stripped of extra whitespace for matching.

const TOKEN_MAP = {
  // Backgrounds
  '#f4f1ec':  'var(--bg)',
  '#fffefb':  'var(--bg-surface)',
  '#ede9e2':  'var(--bg-alt)',
  '#1c1917':  'var(--bg-dark) or var(--text)',
  '#2c2824':  'var(--bg-inset)',

  // Text
  '#6b6055':  'var(--text-muted)',
  '#8a8079':  'var(--text-subtle)',
  '#4a4540':  'var(--text-dim)',

  // Accent
  '#9b4f19':  'var(--accent)',
  '#c4742a':  'var(--accent-light)',
  '#f2e6da':  'var(--accent-dim)',

  // Borders
  '#d4cdc4':  'var(--border)',
  '#a09487':  'var(--border-strong)',

  // State / semantic
  '#fff':     'var(--white)',
  '#ffffff':  'var(--white)',
  '#e07070':  'var(--color-error-soft)',
  '#c0392b':  'var(--color-error)',
  '#e5c68a':  'var(--color-warn)',
  '#fef3c7':  'var(--color-warn-bg)',
  '#fffdf5':  'var(--color-diff-bg)',

  // Epistemic labels
  '#1d5fa8':  'var(--obs)',
  '#e8f0fa':  'var(--obs-bg)',
  '#6d28d9':  'var(--interp)',
  '#f0ebfd':  'var(--interp-bg)',
  '#166534':  'var(--cons)',
  '#e8f5ed':  'var(--cons-bg)',
  '#92500a':  'var(--theory)',
  '#fdf0e3':  'var(--theory-bg)',

  // Common rgba values
  'rgba(155,79,25,0.10)':  'var(--accent-wash)',
  'rgba(155,79,25,0.12)':  'var(--accent-glow)',
  'rgba(155,79,25,0.1)':   'var(--accent-wash)',
  'rgba(28,25,23,0.08)':   'var(--shadow-sm) [shadow component]',
  'rgba(0,0,0,0.30)':      'var(--shadow-overlay) [shadow component]',
  'rgba(0,0,0,0.3)':       'var(--shadow-overlay) [shadow component]',

  // Font weights
  '400': 'var(--weight-normal)',
  '500': 'var(--weight-medium)',
  '600': 'var(--weight-semibold)',
  '700': 'var(--weight-bold)',

  // Border radii
  '2px':  'var(--radius-xs)',
  '3px':  'var(--radius-sm)',
  '4px':  'var(--radius-md)',
  '20px': 'var(--radius-pill)',
  '40px': 'var(--radius-full)',

  // Line heights
  '1.4':  'var(--leading-snug)',
  '1.5':  'var(--leading-snug) or var(--leading-normal) [between tokens]',
  '1.6':  'var(--leading-normal)',
  '1.7':  'var(--leading-body)',
  '1.8':  'var(--leading-relaxed)',
  '1.9':  'var(--leading-loose)',

  // Letter spacing
  '-0.02em': 'var(--tracking-tight)',
  '-0.015em':'var(--tracking-snug)',
  '0em':     'var(--tracking-normal)',
  '0.04em':  'var(--tracking-wide)',
  '0.06em':  'var(--tracking-wider)',
  '0.08em':  'var(--tracking-widest)',

  // Z-index
  '1':   'var(--z-base)',
  '2':   'var(--z-above)',
  '200': 'var(--z-nav)',
  '300': 'var(--z-overlay)',

  // Transitions
  '0.2s ease':  'var(--ease)',
  '0.15s ease': 'var(--ease-fast)',
  '0.5s ease':  'var(--ease-slow)',
};

// ── Skip patterns ────────────────────────────────────────────────────────────
// Lines matching any of these are skipped entirely.

const SKIP_LINE_PATTERNS = [
  /clamp\(/,
  /@media\b/,
  /\btransform\s*:/,
  /translateX/,
  /translateY/,
  /rotate\(/,
  /\bviewBox\b/,
  /\bcx=/,
  /\bcy=/,
  /\br=/,
  // SVG width/height attributes (e.g.  width="24" height="24")
  /\bwidth=["']\d/,
  /\bheight=["']\d/,
  // border/outline shorthand — only tokenize colors on dedicated color lines
  /^\s*(border|outline)\s*:/,
];

// ── Violation rules ──────────────────────────────────────────────────────────
// Each rule: { level, pattern, suggest(match, line) }
// `pattern` is tested against the trimmed line (after skip-pattern filtering).
// `suggest` returns the token hint string.

function suggestFromMap(raw) {
  const key = raw.replace(/\s+/g, '').toLowerCase();
  return TOKEN_MAP[key] || TOKEN_MAP[raw] || null;
}

const RULES = [
  // ── ERROR: hardcoded hex color ────────────────────────────────────────────
  {
    level: 'ERROR',
    // Match hex not immediately preceded by -- (CSS custom property definition)
    pattern: /(?<!--)(?<![a-zA-Z0-9_-])#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g,
    extract(line) {
      const hits = [];
      let m;
      const re = /(?<!--)(?<![a-zA-Z0-9_-])#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;
      while ((m = re.exec(line)) !== null) {
        const raw = m[0];
        // Skip if this is inside a CSS custom-property declaration (--foo: #xxx)
        const before = line.slice(0, m.index);
        if (/--[\w-]+\s*:\s*$/.test(before)) continue;
        const hint = suggestFromMap(raw.toLowerCase());
        hits.push({ raw, hint: hint || 'use var(--<color-token>)' });
      }
      return hits;
    },
  },

  // ── ERROR: rgba/rgb() color ───────────────────────────────────────────────
  // Only flag rgba() values that have a known token — animation opacity
  // variants, one-off overlays, and other intentional values are left alone.
  {
    level: 'ERROR',
    extract(line) {
      const hits = [];
      const re = /rgba?\([^)]+\)/g;
      let m;
      while ((m = re.exec(line)) !== null) {
        const raw = m[0];
        // Skip if defined as a custom property value (--foo: rgba...)
        const before = line.slice(0, m.index);
        if (/--[\w-]+\s*:\s*$/.test(before)) continue;
        // Only flag if there is a token equivalent — don't flag unknown rgba()
        const compact = raw.replace(/\s+/g, '').toLowerCase();
        const hint = TOKEN_MAP[compact] || suggestFromMap(compact);
        if (!hint) continue;
        hits.push({ raw, hint });
      }
      return hits;
    },
  },

  // ── ERROR: numeric font-weight ───────────────────────────────────────────
  {
    level: 'ERROR',
    extract(line) {
      const hits = [];
      // Must be a font-weight property line (not inside a custom-property def)
      if (!/font-weight\s*:/.test(line)) return hits;
      if (/font-weight\s*:\s*var\(/.test(line)) return hits;
      // font-weight: normal / bold are acceptable keywords
      if (/font-weight\s*:\s*(normal|bold|lighter|bolder|inherit|initial|unset)/.test(line)) return hits;
      const m = line.match(/font-weight\s*:\s*(\d+)/);
      if (m) {
        const raw = m[1];
        const hint = TOKEN_MAP[raw] || 'use var(--weight-*)';
        hits.push({ raw: `font-weight: ${raw}`, hint });
      }
      return hits;
    },
  },

  // ── ERROR: border-radius in raw px ───────────────────────────────────────
  {
    level: 'ERROR',
    extract(line) {
      const hits = [];
      if (!/border-radius\s*:/.test(line)) return hits;
      if (/border-radius\s*:\s*var\(/.test(line)) return hits;
      // border-radius: 50% is fine (circular)
      if (/border-radius\s*:\s*50%/.test(line)) return hits;
      const TARGET_PX = /\b(2|3|4|20|40)px\b/g;
      let m;
      while ((m = TARGET_PX.exec(line)) !== null) {
        const raw = m[1] + 'px';
        const hint = TOKEN_MAP[raw] || 'use var(--radius-*)';
        hits.push({ raw: `border-radius: ${raw}`, hint });
      }
      return hits;
    },
  },

  // ── WARNING: numeric line-height ─────────────────────────────────────────
  {
    level: 'WARN',
    extract(line) {
      const hits = [];
      if (!/line-height\s*:/.test(line)) return hits;
      if (/line-height\s*:\s*var\(/.test(line)) return hits;
      // match decimal values 1.4–1.9
      const re = /line-height\s*:\s*(1\.[4-9]\d*)/g;
      let m;
      while ((m = re.exec(line)) !== null) {
        const raw = m[1];
        const hint = TOKEN_MAP[raw] || 'use var(--leading-*)';
        hits.push({ raw: `line-height: ${raw}`, hint });
      }
      return hits;
    },
  },

  // ── WARNING: letter-spacing in em ────────────────────────────────────────
  {
    level: 'WARN',
    extract(line) {
      const hits = [];
      if (!/letter-spacing\s*:/.test(line)) return hits;
      if (/letter-spacing\s*:\s*var\(/.test(line)) return hits;
      const re = /letter-spacing\s*:\s*(-?[\d.]+em)/g;
      let m;
      while ((m = re.exec(line)) !== null) {
        const raw = m[1];
        const hint = TOKEN_MAP[raw] || 'use var(--tracking-*)';
        hits.push({ raw: `letter-spacing: ${raw}`, hint });
      }
      return hits;
    },
  },

  // ── WARNING: z-index number ───────────────────────────────────────────────
  {
    level: 'WARN',
    extract(line) {
      const hits = [];
      if (!/z-index\s*:/.test(line)) return hits;
      if (/z-index\s*:\s*var\(/.test(line)) return hits;
      const re = /z-index\s*:\s*(\d+)/g;
      let m;
      while ((m = re.exec(line)) !== null) {
        const raw = m[1];
        const hint = TOKEN_MAP[raw] || 'use var(--z-*)';
        hits.push({ raw: `z-index: ${raw}`, hint });
      }
      return hits;
    },
  },

  // ── WARNING: transition duration ─────────────────────────────────────────
  {
    level: 'WARN',
    extract(line) {
      const hits = [];
      if (!/transition\s*:/.test(line)) return hits;
      if (/transition\s*:\s*var\(/.test(line)) return hits;
      // Match known durations: 0.15s, 0.2s, 0.5s
      const re = /\b(0\.15s ease|0\.2s ease|0\.5s ease)\b/g;
      let m;
      while ((m = re.exec(line)) !== null) {
        const raw = m[1];
        const hint = TOKEN_MAP[raw] || 'use var(--ease*)';
        hits.push({ raw, hint });
      }
      return hits;
    },
  },
];

// ── File discovery ────────────────────────────────────────────────────────────

function* walkDir(dir, extensions) {
  const skip = new Set(['node_modules', 'dist', '.astro']);
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (skip.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkDir(full, extensions);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (extensions.includes(ext)) yield full;
    }
  }
}

// ── Astro style-block extraction ──────────────────────────────────────────────
// For .astro files we only want to audit lines inside <style> blocks.
// Lines outside <style> are JavaScript/TypeScript or template HTML — the hex
// values there are data (tradition colors, SVG fills, JS objects) not CSS.

function buildStyleLineMask(src) {
  const lines = src.split('\n');
  const mask  = new Array(lines.length).fill(false);
  let inside  = false;
  for (let i = 0; i < lines.length; i++) {
    if (!inside && /<style(\s[^>]*)?>/.test(lines[i])) {
      inside = true;
    }
    if (inside) mask[i] = true;
    if (inside && /<\/style>/.test(lines[i])) {
      inside = false;
    }
  }
  return mask;
}

// ── Line scanning ─────────────────────────────────────────────────────────────

function auditFile(filePath) {
  const src      = fs.readFileSync(filePath, 'utf8');
  const lines    = src.split('\n');
  const isAstro  = filePath.endsWith('.astro');
  const styleMask = isAstro ? buildStyleLineMask(src) : null;
  const violations = [];

  for (let i = 0; i < lines.length; i++) {
    // For .astro files skip anything outside a <style> block
    if (isAstro && !styleMask[i]) continue;

    const line    = lines[i];
    const trimmed = line.trim();

    // Skip blank lines and pure comments
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

    // Skip lines that are custom-property definitions in tokens.css or similar
    // e.g.  --accent: #9b4f19;
    if (/^\s*--[\w-]+\s*:/.test(line)) continue;

    // Apply global skip patterns
    let skip = false;
    for (const pat of SKIP_LINE_PATTERNS) {
      if (pat.test(trimmed)) { skip = true; break; }
    }
    if (skip) continue;

    // Run each rule
    for (const rule of RULES) {
      const hits = rule.extract(line);
      for (const { raw, hint } of hits) {
        violations.push({ lineNo: i + 1, level: rule.level, raw, hint });
      }
    }
  }
  return violations;
}

// ── Reporting ─────────────────────────────────────────────────────────────────

function levelLabel(level) {
  return level === 'ERROR' ? '[ERROR]' : '[WARN] ';
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  const projectRoot = path.resolve(__dirname, '..');
  const srcDir      = path.join(projectRoot, 'src');

  const files = [...walkDir(srcDir, ['.css', '.astro'])].sort();

  let totalErrors   = 0;
  let totalWarnings = 0;
  let filesWithIssues = 0;

  for (const file of files) {
    const violations = auditFile(file);
    if (violations.length === 0) continue;

    filesWithIssues++;
    const rel = path.relative(projectRoot, file);

    for (const v of violations) {
      const label = levelLabel(v.level);
      process.stdout.write(`${label} ${rel}:${v.lineNo} — "${v.raw}" — ${v.hint}\n`);
      if (v.level === 'ERROR') totalErrors++;
      else totalWarnings++;
    }
  }

  process.stdout.write('\n');
  process.stdout.write(
    `Summary: ${totalErrors} error${totalErrors !== 1 ? 's' : ''}, ` +
    `${totalWarnings} warning${totalWarnings !== 1 ? 's' : ''} ` +
    `across ${filesWithIssues} file${filesWithIssues !== 1 ? 's' : ''} ` +
    `(${files.length} scanned)\n`
  );

  process.exit(totalErrors > 0 ? 1 : 0);
}

main();
