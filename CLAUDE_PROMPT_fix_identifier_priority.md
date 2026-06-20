# Claude Code Prompt: Fix Identifier Priority

## Background

An audit confirmed that accession numbers in the Smithsonian corpus are **lot-level identifiers**, not per-object identifiers. Multiple distinct objects share the same accession number. Catalog numbers are per-object and unique. The codebase currently has this backwards.

No data loss occurred — ARK-first dedup protected us — but the display and dedup logic need to be corrected.

**Correct priority order:**
1. `ezid_ark` — dedup and cross-system linking only (never display as headline)
2. `catalog_number` — primary per-object display identifier and fallback dedup key
3. `accession_number` — contextual metadata only (lot/acquisition reference); never use for dedup or as a headline identifier

---

## Changes Required

### 1. `src/pages/corpus.astro`

**Line ~110** — the variable used as the card headline:

```js
// CURRENT (wrong):
const accession = obj.accession_number ?? obj.catalog_number ?? `#${obj.id}`;

// CHANGE TO:
const displayId = obj.catalog_number ?? `#${obj.id}`;
```

Then replace every use of `accession` in the card templates with `displayId`. The variable name change matters — `accession` implies it's an accession number, which it no longer is.

Also update the CSS class name `.card-accession` → `.card-display-id` to match (update both the class assignment in the template and the style definition around line 337). This prevents future confusion about what the field contains.

---

### 2. `src/pages/corpus/[id].astro`

**Page title (~line 148):**
```astro
// CURRENT (wrong):
<title>{notFound ? 'Not found' : `Object ${object?.accession_number ?? id} — Corpus`} · The Grammar of Things</title>

// CHANGE TO:
<title>{notFound ? 'Not found' : `Object ${object?.catalog_number ?? id} — Corpus`} · The Grammar of Things</title>
```

**Headline h1 (~line 185):**
```astro
// CURRENT (wrong):
<h1>{object.accession_number ?? object.catalog_number ?? `Object ${object.id}`}</h1>

// CHANGE TO:
<h1>{object.catalog_number ?? `Object ${object.id}`}</h1>
```

**Metadata dl (~lines 189–190)** — reorder so accession appears after catalog, and label it clearly as an acquisition lot reference:
```astro
// CURRENT:
{object.catalog_number     && <div><dt>Catalog no.</dt><dd>{object.catalog_number}</dd></div>}
{object.accession_number   && <div><dt>Accession</dt><dd>{object.accession_number}</dd></div>}

// CHANGE TO:
{object.catalog_number     && <div><dt>Catalog no.</dt><dd>{object.catalog_number}</dd></div>}
{object.accession_number   && <div><dt>Accession lot</dt><dd>{object.accession_number}</dd></div>}
```

The label change from "Accession" to "Accession lot" signals to viewers that this number covers a group of objects, not just this one.

---

### 3. `src/pages/api/mcp-ingest.ts` — Two dedup blocks

**Block A — Step 3 (~line 217), full-mode ingest:**

```ts
// CURRENT (wrong):
// ── Step 3: Dedupe — match by ARK, then accession ─────────────────────────
const ark             = record.claim.identifiers.ark;
const accessionNumber = record.claim.identifiers.accession_number;
let existingId: number | null = null;

if (ark) {
  const row = await db.prepare('SELECT id FROM objects WHERE ezid_ark = ?').bind(ark).first();
  if (row) existingId = row.id as number;
}
if (!existingId && accessionNumber) {
  const row = await db.prepare('SELECT id FROM objects WHERE accession_number = ?').bind(accessionNumber).first();
  if (row) existingId = row.id as number;
}

// CHANGE TO:
// ── Step 3: Dedupe — match by ARK, then catalog number ────────────────────
const ark            = record.claim.identifiers.ark;
const catalogNumber  = record.claim.identifiers.catalog_number;
let existingId: number | null = null;

if (ark) {
  const row = await db.prepare('SELECT id FROM objects WHERE ezid_ark = ?').bind(ark).first();
  if (row) existingId = row.id as number;
}
if (!existingId && catalogNumber) {
  const row = await db.prepare('SELECT id FROM objects WHERE catalog_number = ?').bind(catalogNumber).first();
  if (row) existingId = row.id as number;
}
```

**Block B — reference-mode dedup (~line 136):**

Same change. Replace:
```ts
const refAccession = record.claim.identifiers.accession_number;
// ...
if (!refExistingId && refAccession) {
  const row = await db.prepare('SELECT id FROM objects WHERE accession_number = ?').bind(refAccession).first();
  if (row) refExistingId = (row as any).id;
}
```

With:
```ts
const refCatalogNumber = record.claim.identifiers.catalog_number;
// ...
if (!refExistingId && refCatalogNumber) {
  const row = await db.prepare('SELECT id FROM objects WHERE catalog_number = ?').bind(refCatalogNumber).first();
  if (row) refExistingId = (row as any).id;
}
```

The comment on Step 3 should also be updated in both blocks to read "match by ARK, then catalog number" so the intent is clear.

---

## Design system check

After making changes, run:
```
node scripts/token-audit.js
```
Must exit clean. The CSS class rename (`.card-accession` → `.card-display-id`) is the only style change; confirm no raw values were introduced.

---

## Do not change

- The `accession_number` column in the database schema — the data is correct, the presentation logic was wrong
- The ingest logic that *stores* the accession number — it should still be saved as metadata
- Any API response shapes that include `accession_number` — consumers may depend on it

---

## One orphan object

The audit found one object in the DB with no ARK, no catalog number, and no accession number (identifiers are all NULL). This object cannot be reliably deduped if re-ingested. After the above fixes are deployed, do a separate follow-up: `SELECT id, source_institution, source_url, created_at FROM objects WHERE ezid_ark IS NULL AND catalog_number IS NULL AND accession_number IS NULL;` and report what it is so we can decide whether to delete or manually tag it.
