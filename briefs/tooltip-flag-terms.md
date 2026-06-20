# Build Brief: Tooltip explanations for fingerprint flag terms

## Goal
Add hover tooltips to the `.flag-badge` (alignment verdict) and `.flag-strength` (confidence level) labels so users understand what the terms mean without hunting for documentation.

## Context
Two terms appear side-by-side on every fingerprint comparison result:
- `.flag-badge` — one of: `aligned`, `inconclusive`, `divergent`
- `.flag-strength` — one of: `none`, `weak`, `moderate`, `strong`

Currently they display as plain monospace text with no explanation. Users don't know what they mean.

## Approach: CSS-only `data-tooltip` pattern

Add a reusable `[data-tooltip]` CSS pattern to `src/styles/base.css`. No JS needed.

```css
/* Tooltip — CSS-only, triggered by data-tooltip attribute */
[data-tooltip] {
  position: relative;
  cursor: help;
  text-decoration-line: underline;
  text-decoration-style: dotted;
  text-decoration-color: var(--text-muted);
  text-underline-offset: 2px;
}
[data-tooltip]::after {
  content: attr(data-tooltip);
  position: absolute;
  bottom: calc(100% + var(--space-2));
  left: 50%;
  transform: translateX(-50%);
  background: var(--text);
  color: var(--bg);
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  font-weight: var(--weight-normal);
  letter-spacing: var(--tracking-normal);
  text-transform: none;
  line-height: var(--leading-normal);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-xs);
  white-space: nowrap;
  max-width: 28ch;
  white-space: normal;
  text-align: center;
  pointer-events: none;
  opacity: 0;
  transition: opacity var(--ease-fast);
  z-index: var(--z-tooltip);
}
[data-tooltip]:hover::after {
  opacity: 1;
}
```

Check if `--z-tooltip` exists in `src/styles/tokens.css`. If not, add it (a safe value is 100).

## Tooltip copy

### Alignment verdicts (`.flag-badge`)

| Value | `data-tooltip` text |
|---|---|
| `aligned` | Fingerprint scores are perceptually consistent with the claimed tradition |
| `inconclusive` | Insufficient signal to draw a conclusion — the default for most objects |
| `divergent` | At least two scores warrant closer human examination |

### Flag strength (`.flag-strength`)

| Value | `data-tooltip` text |
|---|---|
| `none` | Nothing flagged for follow-up |
| `weak` | Minor signals worth noting |
| `moderate` | More notable signals |
| `strong` | Significant flags — close examination recommended |

## Files to change

### 1. `src/styles/base.css`
Add the `[data-tooltip]` CSS block above.

### 2. `src/pages/corpus/[id].astro`

Two locations — static SSR render and JS dynamic builder.

**Static SSR (around line 285–286):**
```astro
<span class="flag-badge" data-tooltip={ALIGNMENT_TOOLTIPS[flag.alignment]}>{flag.alignment}</span>
<span class="flag-strength" data-tooltip={STRENGTH_TOOLTIPS[flag.flag_strength]}>{flag.flag_strength}</span>
```

Define lookup maps near the top of the frontmatter:
```ts
const ALIGNMENT_TOOLTIPS: Record<string, string> = {
  aligned:     'Fingerprint scores are perceptually consistent with the claimed tradition',
  inconclusive:'Insufficient signal to draw a conclusion — the default for most objects',
  divergent:   'At least two scores warrant closer human examination',
};
const STRENGTH_TOOLTIPS: Record<string, string> = {
  none:    'Nothing flagged for follow-up',
  weak:    'Minor signals worth noting',
  moderate:'More notable signals',
  strong:  'Significant flags — close examination recommended',
};
```

**JS dynamic builder (around lines 486–491):**
Add `data-tooltip` attributes when building the DOM nodes:
```js
const ALIGNMENT_TOOLTIPS = { aligned: '...', inconclusive: '...', divergent: '...' };
const STRENGTH_TOOLTIPS  = { none: '...', weak: '...', moderate: '...', strong: '...' };

badge.setAttribute('data-tooltip', ALIGNMENT_TOOLTIPS[flag.alignment] ?? '');
strength.setAttribute('data-tooltip', STRENGTH_TOOLTIPS[flag.flag_strength] ?? '');
```

### 3. `src/pages/corpus/[id]/analysis/[analysisId].astro`

Same static SSR pattern as above (around lines 109–110). Add the same lookup maps in the frontmatter and apply `data-tooltip` to both spans.

## Token audit
Run `node scripts/token-audit.js` after changes. The tooltip CSS uses only tokens — should exit clean.

## Do not
- Add JavaScript tooltip libraries
- Use `title` attribute (browser-styled, inconsistent)
- Add raw hex, px border-radius, or numeric font-weight to the new CSS
