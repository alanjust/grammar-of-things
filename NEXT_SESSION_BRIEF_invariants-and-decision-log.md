# Build brief: CLAUDE.md invariants + decision log — RESOLVED

## Status

- **Task 1 (Invariants section) — DECIDED AGAINST.** Do not implement. See reasoning below.
- **Task 2 (Decision log) — DONE.** Added as `## Decision Log` section in CLAUDE.md above `## Architecture`.

---

## Why Task 1 was rejected

The brief proposed a numbered invariants checklist near the top of CLAUDE.md, extracted from the existing Design System / Markdown / Auth sections.

Rejected because: it creates a duplicate copy of every rule. CLAUDE.md is short enough (under 100 lines) that the rules are easy to find. Two copies means two places to update — in practice they drift. The maintenance cost outweighs the scan-speed benefit. The detailed sections are the canonical source; no shadow list needed.

**Do not revisit this unless the file grows substantially longer or the duplicated-rules problem is solved structurally.**

---

## Why Task 2 was done

Purely additive — captures settled architectural rationale (D1, markdown renderer, three-layer auth) that wasn't recorded anywhere in the codebase. Prevents future sessions from re-opening these questions.
