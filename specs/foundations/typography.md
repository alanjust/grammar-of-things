# Typography

Design system typography spec for Grammar of Things. All tokens are defined in `src/styles/tokens.css`.

---

## 1. Font Families

| Token | Value | Role | When to use |
|---|---|---|---|
| `--font-display` | `Georgia, "Palatino Linotype", Palatino, serif` | Display / editorial | Page headings (`h1`–`h2`), Pass 1 analysis label, hero text, any text that carries the editorial voice of the site |
| `--font-body` | `system-ui, -apple-system, "Segoe UI", sans-serif` | Body / UI | Running prose, card text, navigation, buttons, form labels, any UI chrome |
| `--font-mono` | `ui-monospace, "Cascadia Code", "Source Code Pro", "Courier New", monospace` | Code / metadata / epistemic labels | Epistemic category labels (Observation, Interpretation, etc.), token values in documentation, inline code, metadata badges |

Georgia anchors the site's analytical, object-focused register. System-ui handles the interface layer without competing. Monospace signals precision and taxonomic thinking in epistemic labels and metadata.

---

## 2. Type Scale

| Token | rem | ~px | Example use cases |
|---|---|---|---|
| `--text-xs` | `0.75rem` | 12px | Fine-print metadata, badge text, timestamps, figure captions at smallest |
| `--text-sm` | `0.875rem` | 14px | Supporting metadata, card subtitles, secondary nav, form helper text |
| `--text-base` | `1rem` | 16px | Body paragraphs, default UI text, list items |
| `--text-lg` | `1.125rem` | 18px | Lead paragraphs, card titles, section intro text |
| `--text-xl` | `1.25rem` | 20px | Minor section headings (`h4`), prominent labels |
| `--text-2xl` | `1.5rem` | 24px | Subsection headings (`h3`), feature card headings |
| `--text-3xl` | `1.875rem` | 30px | Section headings (`h2`), major content headings |
| `--text-4xl` | `2.25rem` | 36px | Page-level headings (`h1` on interior pages) |
| `--text-5xl` | `3rem` | 48px | Hero headings, landing display text |

Base size (`--text-base`) is 16px, matching the browser default. Do not override `font-size` on `:root` or `html` — the rem scale depends on it.

---

## 3. Font Weights

| Token | Value | Examples |
|---|---|---|
| `--weight-normal` | `400` | Body paragraphs, running prose, secondary metadata |
| `--weight-medium` | `500` | UI labels, nav items, card subtitles, form labels |
| `--weight-semibold` | `600` | Subheadings (`h3`–`h4`), emphasis within body, epistemic label text |
| `--weight-bold` | `700` | Primary headings (`h1`–`h2`), Pass 1 section label, strong callouts |

Georgia at `--weight-bold` is the primary display voice. Use `--weight-semibold` for `--font-mono` labels — full bold reads as heavy at monospace tracking widths.

---

## 4. Letter Spacing

| Token | Value | When to use |
|---|---|---|
| `--tracking-tight` | `-0.02em` | Large display headings (`--text-4xl` and above) — counteracts optical spread at large sizes |
| `--tracking-snug` | `-0.015em` | Section headings (`--text-2xl`–`--text-3xl`) — subtle tightening for editorial feel |
| `--tracking-normal` | `0em` | All body text — no adjustment needed at reading sizes |
| `--tracking-wide` | `0.04em` | UI labels, uppercase short strings, button text |
| `--tracking-wider` | `0.06em` | Monospace labels at small sizes, metadata tokens |
| `--tracking-widest` | `0.08em` | Category labels set in all-caps, domain headers, strong uppercase callouts |

Negative tracking (tight/snug) applies only to display sizes — never apply to body or mono text. Positive tracking (wide through widest) pairs with `text-transform: uppercase` and small sizes; never apply to body paragraphs.

---

## 5. Line Heights

| Token | Value | When to use |
|---|---|---|
| `--leading-tight` | `1.25` | Headings (`h1`–`h3`) — keeps multi-line headings compact and unified |
| `--leading-snug` | `1.4` | Compact body blocks, UI labels, metadata rows, card text |
| `--leading-normal` | `1.6` | Default body text — general prose at reading sizes |
| `--leading-body` | `1.7` | Comfortable reading paragraphs, longer card descriptions |
| `--leading-relaxed` | `1.8` | Analysis body text — primary voice for Pass 1/Pass 2 output |
| `--leading-loose` | `1.9` | Long-form display text, extended analysis sections where breath matters |

Headings always use `--leading-tight`. Analysis output (the core reading surface) uses `--leading-relaxed` at minimum. Never use `--leading-tight` on paragraphs — it collapses descenders.

---

## 6. Rules

- **Never use raw em values for letter spacing.** Always reference a `--tracking-*` token. Raw values make global tuning impossible and obscure intent.
- **Never use numeric line heights directly.** Always reference a `--leading-*` token. This keeps line rhythm consistent across the scale and lets global adjustments propagate.
- **Always use scale tokens for font sizes.** No `font-size: 13px` or `font-size: 0.8125rem` — pick the nearest scale step.
- **Display font at display sizes only.** `--font-display` below `--text-lg` is rare and should be intentional (e.g., a small-caps decorative use). Default body text uses `--font-body`.
- **Mono is not for emphasis.** Use `--font-mono` for genuinely code-like or taxonomic content. For emphasis within prose, use weight or italics.
- **Pair negative tracking with large sizes only.** `--tracking-tight` and `--tracking-snug` are for headings. Applying them at body size tightens text below comfortable reading density.
- **Pair wide tracking with uppercase only.** `--tracking-wide` through `--tracking-widest` compensate for the optical crowding of uppercase glyphs. Do not apply to mixed-case or sentence-case text.
