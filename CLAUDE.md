# Grammar of Things — AI Assistant Instructions

Read this file at the start of every session. Follow these rules without exception.

## Before Starting Any Session
1. Read NEXT_SESSION.md for open items.
2. Read specs/tokens/token-reference.md if touching UI.
3. Run `node scripts/token-audit.js` if touching CSS.

---

## Design System

Before writing or modifying any UI code, read specs/tokens/token-reference.md.
Use only tokens from src/styles/tokens.css. Never use raw hex, rgba(), numeric font-weight, raw em letter-spacing, numeric line-height, or raw px border-radius.
Run: `node scripts/token-audit.js` — must exit clean (zero errors) before committing.

Rules enforced by the audit script:
- Color: var(--token), never #hex or rgba()
- Font weight: var(--weight-*), never 400/500/600/700
- Letter spacing: var(--tracking-*), never raw em
- Line height: var(--leading-*), never raw number
- Border radius: var(--radius-*)
- Z-index: var(--z-*)
- Transitions: var(--ease), var(--ease-fast), or var(--ease-slow)
- Shadows: var(--shadow-*)

To add a new visual value: add the token to tokens.css first, then use it. Never add a raw value directly to a component.

---

## Markdown Rendering

renderMarkdown() in src/lib/markdown.ts is the only approved markdown-to-HTML function.
Add class="prose" to every container that receives renderMarkdown() output.
The .prose class in base.css provides structural styles for rendered markdown elements.
Never use marked.parse() directly. Never set innerHTML from untrusted content.

---

## Auth & Security

Read-only public: anyone can view everything. All mutations require admin auth.
- requireAdmin(request) — server-side guard on every API mutation endpoint.
- isAdmin(Astro.request) — SSR rendering gate on corpus/[id] and review pages.
- AdminGate.astro + body[data-admin="1"] CSS — client-side gate on prerendered pages.
- mcp-ingest requires Authorization: Bearer ADMIN_TOKEN header — most likely cause of ingestion failures.
- ADMIN_TOKEN is a Cloudflare Secret, never in wrangler.toml [vars]. Local: .dev.vars (gitignored).

---

## Deploy

`npm run deploy` from project root — Workers Assets model only.
Live: https://grammar-of-things.alan-66a.workers.dev
NOT via Cloudflare Pages git connection — API routes only work on the Worker URL.
Env access: `import { env } from 'cloudflare:workers'` — not locals.runtime.env.

At the start of your first reply in each session, greet me as "Mr. Fuzzface" and tell me which CLAUDE.md files you loaded this session (list the full paths). Keep greeting me this way in every session. If you ever stop, assume something's wrong with how this file is loading.
---



## Decision Log

Settled architectural choices — do not re-litigate without a concrete new requirement.

**Why D1 over Durable Objects / KV / Hyperdrive+Postgres:**
The data model requires multi-table relational queries (objects → analyses joins), FTS5 full-text search (a SQLite extension), and vector storage alongside relational metadata — all in one place. KV is flat key-value with no query capability. Durable Objects are coordination actors, not relational stores. D1 is the native SQLite-on-Cloudflare option; its FTS5 support (added in migration 0017) confirms the choice was right. No explicit rationale is recorded in commits — inferrable from the schema structure.

**Why markdown rendering is centralized in `src/lib/markdown.ts`:**
An external code review (commit `3bc2684`) flagged dispersed `marked.parse()` calls across pages as an XSS vector — each call site had to remember to sanitize, and none uniformly did. One hardened renderer (HTML escaping + URL scheme allowlist) is auditable in one place. Every page that sets innerHTML from model or scraped output now routes through it.

**Why auth uses three layers (`requireAdmin` + `isAdmin` + `AdminGate.astro`):**
Astro mixes SSR and prerendered pages, and they need different mechanisms. SSR pages run server code per request — `requireAdmin(request)` blocks mutations, `isAdmin(Astro.request)` gates rendering. Prerendered pages are compiled at build time and cannot run server code at request time — `AdminGate.astro` + `body[data-admin="1"]` CSS handles client-side gating there. The three layers are not redundant; they cover different rendering paths. Introduced by commit `3bc2684` (external code review).

---

## Architecture

Key files:
- src/lib/auth.ts — admin auth primitives (requireAdmin, isAdmin, session helpers)
- src/lib/markdown.ts — hardened marked renderer; safe for untrusted model/scraped output
- src/lib/principles.ts — prompt content and principle data
- src/lib/model-router.ts — PassConfig, resolveModelConfig, streamModel, callModel
- src/lib/retrieval.ts — FTS retrieval + citation injection into Pass 2
- src/db/types.ts — D1 table types, VECTOR_KEY, serializeVector/parseVector
- src/styles/tokens.css — all design tokens (extend here first)
- src/styles/base.css — global reset, .container, .prose, .label-*, admin gate CSS
- specs/ — design system documentation for LLM reference
