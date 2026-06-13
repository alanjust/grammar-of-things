# Spacing

Source of truth: `src/styles/tokens.css`

---

## 1. Spacing scale

| Token | rem | ~px | Intended use |
|---|---|---|---|
| `--space-1` | 0.25rem | 4px | Icon-to-label nudge; hairline separation between tightly coupled elements |
| `--space-2` | 0.5rem | 8px | Tight internal gap — badge padding, inline tag spacing, list item micro-gap |
| `--space-3` | 0.75rem | 12px | Label-to-content gap; compact button padding; close sibling spacing |
| `--space-4` | 1rem | 16px | Default component internal padding; body text paragraph gap; form field spacing |
| `--space-5` | 1.25rem | 20px | Slightly relaxed internal gap; list items with breathing room |
| `--space-6` | 1.5rem | 24px | Card internal padding (compact); between related grouped elements |
| `--space-7` | 1.75rem | 28px | Moderate section sub-group spacing; nav item rhythm |
| `--space-8` | 2rem | 32px | Card / panel padding; primary internal section padding |
| `--space-10` | 2.5rem | 40px | Between card-level components; modal body padding |
| `--space-12` | 3rem | 48px | Between major content groups within a section |
| `--space-16` | 4rem | 64px | Intra-page section gap on desktop; generous card-to-card rhythm |
| `--space-20` | 5rem | 80px | Section vertical rhythm — top/bottom padding on full-page sections |
| `--space-24` | 6rem | 96px | Hero / large landing section vertical breathing room |

**Reading the scale:** steps 1–4 cover micro-spacing inside components; 5–8 handle component-level padding and card internals; 10–12 separate grouped blocks; 16–24 define page-level vertical rhythm.

---

## 2. Container tokens

| Token | Value | When to use |
|---|---|---|
| `--max-w` | 1200px | Page layout container — wraps the full site shell, nav, hero, card grids, and any section that spans the full content width. Apply with `margin-inline: auto` and horizontal padding to keep content off viewport edges at all breakpoints. |
| `--max-w-prose` | 70ch | Readable line-length constraint — apply to running text columns (concept body, analysis paragraphs, footnote blocks) where sustained reading is the goal. 70ch at the base font size yields ~65–75 characters per line, the typographic sweet spot. |

**Decision rule:** if the content is a layout structure (grid, nav, hero, card row), use `--max-w`. If the content is a column of prose meant to be read continuously, use `--max-w-prose`. Do not nest a `--max-w-prose` container inside another `--max-w-prose`.

---

## 3. Breakpoints

This project uses four named breakpoints. They are not tokenized in CSS custom properties — reference them by their px value directly in `@media` queries.

| Name | Value | Layout changes at this point |
|---|---|---|
| mobile | 640px | Single-column stacks collapse to full width; nav may switch to a condensed or drawer pattern; card grids drop to 1 column; horizontal padding reduces to `--space-4` or `--space-6` |
| tablet | 900px | Two-column layouts activate; sidebar content may appear; card grids move to 2 columns; nav items may expand from icon-only to icon+label |
| laptop | 1024px | Full desktop nav unlocks; three-column grids become viable; prose columns gain fixed `--max-w-prose` constraints rather than fluid width; section padding steps up to `--space-16`/`--space-20` |
| wide | 1200px | Container hits `--max-w` ceiling; layout stops growing and centers; any remaining fluid columns lock to their maximum intended width |

**Query convention:** write breakpoints mobile-first (`min-width`). The base styles target mobile; each breakpoint layer adds layout complexity upward.

---

## 4. Rules

**Always use tokens for layout spacing.**

- All `padding`, `margin`, and `gap` values must reference a `--space-*` token. Do not write raw numbers like `padding: 16px` or `gap: 24px`.
- If no token maps cleanly to a needed value, escalate: either the token scale needs a new entry (add it to `tokens.css` and document here) or the design needs to snap to the nearest existing step.

**Raw px is permitted only for structural geometry.**

Acceptable raw-px uses:
- SVG geometry — `width`, `height`, `viewBox`, `stroke-width`, path coordinates
- Fixed icon sizes where the icon must remain pixel-precise regardless of the surrounding text size
- `border-width` hairlines (1px, 2px) where sub-rem precision is required
- `border-radius` values that are already tokenized in `--radius-*` (use the token, not the raw value)

**Not acceptable:**
- `padding: 8px` — use `--space-2`
- `margin-top: 32px` — use `--space-8`
- `gap: 12px` — use `--space-3`
- Arbitrary values like `padding: 14px` that fall between token steps — snap to the nearest step or reconsider the design

**Responsive overrides** should still use tokens at each breakpoint level; only the token reference changes, not the unit system.
