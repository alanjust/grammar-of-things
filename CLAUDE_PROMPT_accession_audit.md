# Claude Code Prompt: Accession Number Uniqueness Audit

## Context

We discovered that the Smithsonian assigns **accession numbers at the acquisition-lot level**, not the individual object level. Multiple distinct physical objects share the same accession number (e.g., all three bowls in the screenshot show `070367`). This is correct per the Smithsonian's own catalog — it's not a bug in the data.

**The problem:** The current codebase treats `accession_number` as if it were unique:
- `mcp-ingest.ts` deduplicates incoming records by accession number (after ARK), which may have **silently collapsed distinct objects into one database row**
- `corpus.astro` and `[id].astro` display accession number as the primary headline identifier

We need to audit the current database to understand the scope of the damage before fixing anything.

## Database

- **D1 database name:** `grammar-of-things`
- **database_id:** `c1a25de3-3bd9-4627-ba35-5466afead0a0`
- **Binding:** `DB`

Use `wrangler d1 execute grammar-of-things --remote` for all queries.

## Task

Run the following queries and report the results. Do not modify any data. Audit only.

---

### Query 1 — How many objects share an accession number?

```sql
SELECT
  accession_number,
  COUNT(*) AS object_count
FROM objects
WHERE accession_number IS NOT NULL
GROUP BY accession_number
HAVING COUNT(*) > 1
ORDER BY object_count DESC;
```

Report: total count of accession numbers that are shared, the top 10 most-shared values with their counts, and the total number of objects affected.

---

### Query 2 — What does the catalog_number look like for shared-accession objects?

```sql
SELECT
  accession_number,
  catalog_number,
  ezid_ark,
  id
FROM objects
WHERE accession_number IN (
  SELECT accession_number
  FROM objects
  WHERE accession_number IS NOT NULL
  GROUP BY accession_number
  HAVING COUNT(*) > 1
)
ORDER BY accession_number, catalog_number;
```

Report: Are catalog numbers distinct within a shared accession group? Do they follow a pattern (e.g., suffixes, sequential numbers)? Any NULLs?

---

### Query 3 — Overall identifier coverage

```sql
SELECT
  COUNT(*) AS total_objects,
  COUNT(accession_number) AS has_accession,
  COUNT(catalog_number) AS has_catalog,
  COUNT(ezid_ark) AS has_ark,
  COUNT(CASE WHEN accession_number IS NULL AND catalog_number IS NULL AND ezid_ark IS NULL THEN 1 END) AS has_none
FROM objects;
```

Report: How many objects have each type of identifier? How many have none?

---

### Query 4 — Are catalog numbers unique?

```sql
SELECT
  catalog_number,
  COUNT(*) AS object_count
FROM objects
WHERE catalog_number IS NOT NULL
GROUP BY catalog_number
HAVING COUNT(*) > 1
ORDER BY object_count DESC
LIMIT 20;
```

Report: Are catalog numbers unique across the corpus, or do they also repeat? (If they repeat, we need to understand why before promoting catalog_number to primary identifier.)

---

## What to report back

Summarize findings in plain language:
1. **Severity of dedup damage** — did the ingest dedup logic actually collapse any objects, or did most shared-accession objects arrive via different code paths and survive intact?
2. **Is catalog_number a safe replacement primary identifier?** Based on Query 4, is it unique or does it also repeat?
3. **Recommended identifier priority order** for display and dedup, based on what the data actually shows.

Do not fix anything yet. Report only.
