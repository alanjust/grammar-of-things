# Token Reference — Grammar of Things Design System

Master reference for every CSS custom property defined in `src/styles/tokens.css`. All tokens are declared on `:root` and available globally.

---

## Backgrounds

| Token | Value | Category | When to use |
|---|---|---|---|
| `--bg` | `#f4f1ec` | Backgrounds | Page canvas — the default warm off-white background for the entire page body |
| `--bg-surface` | `#fffefb` | Backgrounds | Raised surfaces — cards, panels, drawers that sit above the page canvas |
| `--bg-alt` | `#ede9e2` | Backgrounds | Recessed surfaces — code blocks, alternate table rows, inset wells |
| `--bg-dark` | `#1c1917` | Backgrounds | Inverted surface — footer, dark hero sections, any dark-mode panel |
| `--bg-inset` | `#2c2824` | Backgrounds | Deeper surface nested inside dark sections — secondary dark panels within `--bg-dark` regions |

## Text

| Token | Value | Category | When to use |
|---|---|---|---|
| `--text` | `#1c1917` | Text | Primary body text on light backgrounds |
| `--text-muted` | `#6b6055` | Text | Secondary and supporting text — captions, meta, helper copy |
| `--text-subtle` | `#8a8079` | Text | Quiet text on dark surfaces — footer secondary lines, timestamps on `--bg-dark` |
| `--text-dim` | `#4a4540` | Text | Mid-range contrast on dark — footer body copy, descriptions within dark sections |
| `--text-invert` | `#f4f1ec` | Text | Text placed directly on `--bg-dark` inverted surfaces |

## Accent

| Token | Value | Category | When to use |
|---|---|---|---|
| `--accent` | `#9b4f19` | Accent | Primary terracotta — links, active states, focus rings, primary buttons |
| `--accent-light` | `#c4742a` | Accent | Hover / lighter accent state — link hover, button hover |
| `--accent-dim` | `#f2e6da` | Accent | Pale accent background — highlighted callouts, selected row tint |
| `--accent-wash` | `rgba(155, 79, 25, 0.10)` | Accent | Very subtle accent background — card hover fill, quiet highlights |
| `--accent-glow` | `rgba(155, 79, 25, 0.12)` | Accent | Card hover shadow tint — use as a box-shadow color on interactive surfaces |

## Borders

| Token | Value | Category | When to use |
|---|---|---|---|
| `--border` | `#d4cdc4` | Borders | Default border — dividers, card outlines, input borders |
| `--border-strong` | `#a09487` | Borders | Emphasized border — active inputs, section separators that need more contrast |

## State Colors

| Token | Value | Category | When to use |
|---|---|---|---|
| `--color-error` | `#c0392b` | State Colors | Destructive / error states — error messages, delete confirmations, invalid field borders |
| `--color-warn` | `#e5c68a` | State Colors | Caution border — amber outline on warning banners |
| `--color-warn-bg` | `#fef3c7` | State Colors | Caution background — interior fill of warning banners |
| `--color-diff-bg` | `#fffdf5` | State Colors | Mismatch / diff surface — background for panels showing changed or compared content |

## Epistemic Labels

| Token | Value | Category | When to use |
|---|---|---|---|
| `--obs` | `#1d5fa8` | Epistemic Labels | Observation label text — the "Observation" badge foreground |
| `--obs-bg` | `#e8f0fa` | Epistemic Labels | Observation label background |
| `--interp` | `#6d28d9` | Epistemic Labels | Interpretation label text |
| `--interp-bg` | `#f0ebfd` | Epistemic Labels | Interpretation label background |
| `--cons` | `#166534` | Epistemic Labels | Consequence label text |
| `--cons-bg` | `#e8f5ed` | Epistemic Labels | Consequence label background |
| `--theory` | `#92500a` | Epistemic Labels | Theory label text |
| `--theory-bg` | `#fdf0e3` | Epistemic Labels | Theory label background |

## Font Families

| Token | Value | Category | When to use |
|---|---|---|---|
| `--font-display` | `Georgia, "Palatino Linotype", Palatino, serif` | Font Families | Display headings, hero text, editorial titles |
| `--font-body` | `system-ui, -apple-system, "Segoe UI", sans-serif` | Font Families | All body copy, UI labels, navigation, buttons |
| `--font-mono` | `ui-monospace, "Cascadia Code", "Source Code Pro", "Courier New", monospace` | Font Families | Code blocks, inline code, token names, technical identifiers |

## Font Weights

| Token | Value | Category | When to use |
|---|---|---|---|
| `--weight-normal` | `400` | Font Weights | Body copy, default prose |
| `--weight-medium` | `500` | Font Weights | Slightly emphasized UI labels, sub-headings |
| `--weight-semibold` | `600` | Font Weights | Buttons, active nav items, field labels |
| `--weight-bold` | `700` | Font Weights | Page headings, strong emphasis, hero titles |

## Type Scale

| Token | Value | Category | When to use |
|---|---|---|---|
| `--text-xs` | `0.75rem` | Type Scale | Fine print, metadata badges, tiny labels |
| `--text-sm` | `0.875rem` | Type Scale | Secondary body text, captions, helper copy |
| `--text-base` | `1rem` | Type Scale | Default body text size |
| `--text-lg` | `1.125rem` | Type Scale | Slightly enlarged body — intro paragraphs, card body |
| `--text-xl` | `1.25rem` | Type Scale | Small headings, card titles, section subheads |
| `--text-2xl` | `1.5rem` | Type Scale | Mid-level headings — H3 equivalent |
| `--text-3xl` | `1.875rem` | Type Scale | Section headings — H2 equivalent |
| `--text-4xl` | `2.25rem` | Type Scale | Page-level headings — H1 equivalent |
| `--text-5xl` | `3rem` | Type Scale | Hero / display headings |

## Letter Spacing

| Token | Value | Category | When to use |
|---|---|---|---|
| `--tracking-tight` | `-0.02em` | Letter Spacing | Large display headings where tighter tracking improves cohesion |
| `--tracking-snug` | `-0.015em` | Letter Spacing | Section headings |
| `--tracking-normal` | `0em` | Letter Spacing | Body text — default, no tracking adjustment |
| `--tracking-wide` | `0.04em` | Letter Spacing | UI labels, uppercase short strings |
| `--tracking-wider` | `0.06em` | Letter Spacing | Mono labels, technical identifiers |
| `--tracking-widest` | `0.08em` | Letter Spacing | Category labels, strong uppercase callouts |

## Line Heights

| Token | Value | Category | When to use |
|---|---|---|---|
| `--leading-tight` | `1.25` | Line Heights | Headings — tight stacking for multi-line titles |
| `--leading-snug` | `1.4` | Line Heights | Compact body text, UI labels |
| `--leading-normal` | `1.6` | Line Heights | Base body text — default reading rhythm |
| `--leading-body` | `1.7` | Line Heights | Comfortable reading — standard prose blocks |
| `--leading-relaxed` | `1.8` | Line Heights | Analysis body — longer-form content where extra space aids comprehension |
| `--leading-loose` | `1.9` | Line Heights | Long-form display — maximum openness for editorial layouts |

## Spacing

| Token | Value | Category | When to use |
|---|---|---|---|
| `--space-1` | `0.25rem` | Spacing | Hairline gaps — icon-to-label, badge inner padding |
| `--space-2` | `0.5rem` | Spacing | Tight internal padding — inline element gaps, compact list spacing |
| `--space-3` | `0.75rem` | Spacing | Small padding — button vertical padding, tag gaps |
| `--space-4` | `1rem` | Spacing | Base unit — default padding, small gaps between elements |
| `--space-5` | `1.25rem` | Spacing | Slightly larger than base — form field vertical rhythm |
| `--space-6` | `1.5rem` | Spacing | Component internal padding — card body padding |
| `--space-7` | `1.75rem` | Spacing | Section sub-divisions |
| `--space-8` | `2rem` | Spacing | Component-to-component gaps, card grid gutters |
| `--space-10` | `2.5rem` | Spacing | Section top/bottom padding on smaller viewports |
| `--space-12` | `3rem` | Spacing | Inter-section spacing on medium layouts |
| `--space-16` | `4rem` | Spacing | Large section padding, hero vertical rhythm |
| `--space-20` | `5rem` | Spacing | Page-level vertical padding — generous section breaks |
| `--space-24` | `6rem` | Spacing | Maximum page rhythm — top-of-page hero padding |

## Container

| Token | Value | Category | When to use |
|---|---|---|---|
| `--max-w` | `1200px` | Container | Maximum page content width — apply to the outermost layout wrapper |
| `--max-w-prose` | `70ch` | Container | Maximum prose width — apply to any block of reading text or analysis output |

## Border Radius

| Token | Value | Category | When to use |
|---|---|---|---|
| `--radius-xs` | `2px` | Border Radius | Badges, inline code snippets |
| `--radius-sm` | `3px` | Border Radius | Small panels, label chips |
| `--radius-md` | `4px` | Border Radius | Buttons, inputs, standard cards |
| `--radius-pill` | `20px` | Border Radius | Pill-shaped badges and tags |
| `--radius-full` | `40px` | Border Radius | Circle elements or fully-rounded buttons |

## Shadows

| Token | Value | Category | When to use |
|---|---|---|---|
| `--shadow-sm` | `0 2px 8px rgba(28, 25, 23, 0.08)` | Shadows | Subtle lift — default card shadow, light surface elevation |
| `--shadow-md` | `0 2px 12px rgba(155, 79, 25, 0.12)` | Shadows | Accent-tinted lift — hovered cards, focused panels |
| `--shadow-accent` | `0 2px 10px rgba(155, 79, 25, 0.10)` | Shadows | Subtle accent shadow — secondary interactive elements |
| `--shadow-overlay` | `0 4px 24px rgba(0, 0, 0, 0.30)` | Shadows | Modal, drawer, or tooltip overlay elevation |

## Z-Index

| Token | Value | Category | When to use |
|---|---|---|---|
| `--z-base` | `1` | Z-Index | Stacking context baseline — elements that need to be above static flow but below everything else |
| `--z-above` | `2` | Z-Index | One step above base — overlapping sibling elements |
| `--z-nav` | `200` | Z-Index | Sticky navigation bar, selection bar, persistent toolbars |
| `--z-overlay` | `300` | Z-Index | Back links, overlays, modals, drawers — highest layer |

## Motion

| Token | Value | Category | When to use |
|---|---|---|---|
| `--ease` | `0.2s ease` | Motion | Default transition — color, opacity, background changes on hover |
| `--ease-fast` | `0.15s ease` | Motion | Fast micro-interactions — button presses, focus ring appearance |
| `--ease-slow` | `0.5s ease` | Motion | Slow transitions — panel open/close, skeleton fade-in |

---

## Quick Rules

- Never use raw hex or rgba() — always var(--token)
- Font weight: always var(--weight-*), never 400/500/600/700
- Letter spacing: always var(--tracking-*), never raw em
- Line height: always var(--leading-*), never raw number
- Border radius: always var(--radius-*)
- Z-index: always var(--z-*)
- Transitions: always var(--ease), var(--ease-fast), or var(--ease-slow)
- Shadows: always var(--shadow-*)
- Add class="prose" to any element receiving renderMarkdown() output
