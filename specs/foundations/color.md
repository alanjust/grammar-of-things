# Color System

Source of truth: `src/styles/tokens.css`. All tokens are CSS custom properties on `:root`.

---

## Palette

### Backgrounds

| Token | Value | Description |
|---|---|---|
| `--bg` | `#f4f1ec` | Page canvas — warm off-white |
| `--bg-surface` | `#fffefb` | Raised surface — cards, panels |
| `--bg-alt` | `#ede9e2` | Recessed surface — code blocks, alternating rows |
| `--bg-dark` | `#1c1917` | Inverted surface — footer, dark sections |
| `--bg-inset` | `#2c2824` | Deeper surface within dark sections |

### Text

| Token | Value | Description |
|---|---|---|
| `--text` | `#1c1917` | Primary body text |
| `--text-muted` | `#6b6055` | Secondary / supporting text |
| `--text-subtle` | `#8a8079` | Quiet text on dark surfaces (footer secondary) |
| `--text-dim` | `#4a4540` | Mid-range on dark surfaces (footer body) |
| `--text-invert` | `#f4f1ec` | Primary text on `--bg-dark` |

### Accent

| Token | Value | Description |
|---|---|---|
| `--accent` | `#9b4f19` | Primary terracotta — links, active states, CTAs |
| `--accent-light` | `#c4742a` | Hover / lighter accent |
| `--accent-dim` | `#f2e6da` | Pale accent background — selected rows, highlights |
| `--accent-wash` | `rgba(155,79,25,0.10)` | Very subtle accent fill — hover states, cards |
| `--accent-glow` | `rgba(155,79,25,0.12)` | Hover / card accent shadow |

### Borders

| Token | Value | Description |
|---|---|---|
| `--border` | `#d4cdc4` | Default border — inputs, dividers, card edges |
| `--border-strong` | `#a09487` | Emphasized border — active inputs, section dividers |

### State

| Token | Value | Description |
|---|---|---|
| `--color-error` | `#c0392b` | Destructive action / error text |
| `--color-warn` | `#e5c68a` | Caution border — amber |
| `--color-warn-bg` | `#fef3c7` | Caution background |
| `--color-diff-bg` | `#fffdf5` | Mismatch / diff surface |

### Epistemic Labels

| Token | Value | Description |
|---|---|---|
| `--obs` | `#1d5fa8` | Observation — text/icon |
| `--obs-bg` | `#e8f0fa` | Observation — label background |
| `--interp` | `#6d28d9` | Interpretation — text/icon |
| `--interp-bg` | `#f0ebfd` | Interpretation — label background |
| `--cons` | `#166534` | Consensus — text/icon |
| `--cons-bg` | `#e8f5ed` | Consensus — label background |
| `--theory` | `#92500a` | Theory — text/icon |
| `--theory-bg` | `#fdf0e3` | Theory — label background |

---

## Epistemic Color System

The four epistemic categories mark the **confidence and source** of a claim. Each has a foreground token (for text, icons, borders) and a background token (for label fills and chips).

### Categories

**Observation** (`--obs` / `--obs-bg`) — Blue
A claim grounded in direct sensory evidence: what is physically present, measurable, or visually verifiable without interpretive leap. Use when the statement could be confirmed by anyone looking at the object.
Example: "The painting measures 24 × 36 inches."

**Interpretation** (`--interp` / `--interp-bg`) — Violet
An inference or reading that goes beyond what is directly observable. Applies when meaning, intent, or significance is being proposed rather than reported.
Example: "The fractured horizon line suggests psychological disintegration."

**Consensus** (`--cons` / `--cons-bg`) — Green
A position that is broadly accepted within the relevant scholarly or expert community. Not necessarily proven fact, but settled enough that dissent requires explicit justification.
Example: "This work is considered a pivotal example of Abstract Expressionism."

**Theory** (`--theory` / `--theory-bg`) — Amber-brown
A structured explanatory framework or speculative proposition that organizes multiple observations or interpretations. Higher-order than a single interpretation; more contested or provisional than consensus.
Example: "The grid functions as a means of resisting the tyranny of compositional hierarchy."

### When to use each pair

- Always pair the foreground token with its matching background token — do not mix (e.g., `--obs` text on `--interp-bg`).
- Use foreground tokens on white/light surfaces for inline label text, icons, or left-border accents.
- Use background tokens for pill/chip fills; place the matching foreground token as the text color inside the chip.
- Do not use epistemic tokens for general UI color — they carry semantic weight and should appear only on content that carries an epistemic claim.

---

## Dark Surface Rules

Dark surfaces are `--bg-dark` and `--bg-inset`. They appear in the footer and any inverted section.

### When to use each

| Token | Use |
|---|---|
| `--bg-dark` | Top-level inverted section (footer shell, dark hero) |
| `--bg-inset` | Nested element within a dark section — sub-panel, code block, inset card |

### Text tokens on dark surfaces

| Token | Use on dark |
|---|---|
| `--text-invert` | Primary readable text — headings, body copy |
| `--text-dim` | Secondary body text — supporting copy, descriptions |
| `--text-subtle` | Quiet / de-emphasized text — metadata, footnotes, labels |

Do not use `--text`, `--text-muted` on dark surfaces — they are near-black and will not meet contrast requirements against `--bg-dark`.

---

## Usage Rules

1. **Never use raw hex values in component or page CSS.** Always reference a token: `color: var(--text);` not `color: #1c1917;`.

2. **Opacity variants are provided as dedicated tokens.** For a translucent accent fill use `var(--accent-wash)` or `var(--accent-glow)` — do not write `rgba()` inline or apply `opacity` to a solid accent token.

3. **Accent token hierarchy.** Default interactive elements use `--accent`. Hover states step up to `--accent-light`. Subtle backgrounds use `--accent-dim` (opaque) or `--accent-wash` (semi-transparent). Shadow tints use `--accent-glow`.

4. **Border tokens are not interchangeable.** Use `--border` for passive dividers and default input outlines. Use `--border-strong` only for focus rings, active states, or deliberately prominent separators.

5. **State tokens are for feedback only.** `--color-error`, `--color-warn`, `--color-warn-bg`, and `--color-diff-bg` exist to communicate system state. Do not repurpose them for decoration.

6. **Epistemic tokens carry meaning.** Using `--obs-bg` as a generic blue chip or `--interp` as a purple accent breaks the epistemic reading layer. Reserve these tokens exclusively for epistemically labelled content.
