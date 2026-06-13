# Elevation, Motion & Radius

Spec for border radius, shadows, z-index layers, and motion timing. All tokens are defined in `src/styles/tokens.css`.

---

## 1. Border Radius

| Token | Value | Use Case |
|---|---|---|
| `--radius-xs` | `2px` | Badges, inline code |
| `--radius-sm` | `3px` | Small panels, labels |
| `--radius-md` | `4px` | Buttons, inputs, cards |
| `--radius-pill` | `20px` | Status tags, pill badges |
| `--radius-full` | `40px` | Avatar circles, fully rounded elements |

---

## 2. Shadows

| Token | CSS Value | Use Case |
|---|---|---|
| `--shadow-sm` | `0 2px 8px rgba(28, 25, 23, 0.08)` | Subtle lift — neutral, low-contrast surfaces |
| `--shadow-md` | `0 2px 12px rgba(155, 79, 25, 0.12)` | Accent-tinted card lift — default elevated card state |
| `--shadow-accent` | `0 2px 10px rgba(155, 79, 25, 0.10)` | Hover state — interactive card or panel focus |
| `--shadow-overlay` | `0 4px 24px rgba(0, 0, 0, 0.30)` | Modal, drawer, and floating overlay surfaces |

---

## 3. Z-Index Layers

| Token | Value | What Lives on This Layer |
|---|---|---|
| `--z-base` | `1` | Inline elements that need to stack above static flow |
| `--z-above` | `2` | Dropdowns, tooltips, and small floating UI |
| `--z-nav` | `200` | Sticky header, selection bar |
| `--z-overlay` | `300` | Back-links, overlays, and modal backdrops |

---

## 4. Motion

| Token | Value | Role |
|---|---|---|
| `--ease` | `0.2s ease` | Standard interactive — buttons, links, border changes |
| `--ease-fast` | `0.15s ease` | Micro-interactions — icon swaps, badge state changes |
| `--ease-slow` | `0.5s ease` | Reveal animations — page-load fades, content entrances |

**Rules:**

- Use only these three tokens. Never write a custom `transition` duration directly in component CSS.
- Apply `--ease` as the default for any interactive state change unless there is a specific reason to reach for fast or slow.
- `--ease-fast` is for changes so small they should feel instant but still smoothed — do not use it for layout shifts.
- `--ease-slow` is reserved for deliberate, perceptible reveals — overusing it makes the UI feel sluggish.
