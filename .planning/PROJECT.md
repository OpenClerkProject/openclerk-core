# openclerk-core

## What This Is

`openclerk-core` is a zero-dependency, platform-agnostic TypeScript library for legal citation parsing, lookup, and Bluebook-format validation, published as an npm package and consumed by host add-ins (Word, Google Docs, LibreOffice). It provides two plugin-registry subsystems: citation lookup providers (CourtListener plus enterprise vendors) and Bluebook rule-set editions (20th/21st/22nd).

## Core Value

Citations extracted and matched by this library must be correct and never silently wrong — a false "verified" or a missed hallucination undermines the entire point of the hallucination-check feature.

## Requirements

### Validated

- ✓ [Existing capability] Citation extraction/parsing from raw document text (`src/providers/citationParser.ts`) — existing
- ✓ [Existing capability] Citation lookup against CourtListener and enterprise providers via plugin registry (`src/providers/registry.ts`) — existing
- ✓ [Existing capability] Hallucination detection by cross-checking parsed citations against a lookup provider (`src/providers/hallucinationCheck.ts`) — existing
- ✓ [Existing capability] Bluebook rule-set validation across three editions (`src/bluebook/`) — existing
- ✓ [Existing capability] Host-environment-agnostic HTTP transport via swappable `HttpClient` (`src/http.ts`) — existing
- ✓ [Existing capability] In-memory-only credential handling for enterprise providers (`src/providers/base.ts`) — existing

### Active

- [ ] Port applicable test cases from CourtListener's own citation test suite (`cl/citations/tests.py`) into a new dedicated test file, covering four portable categories:
  - [ ] Reporter-spacing/regex normalization edge cases (e.g. `"22 U. S. 33"` must still match `"22 U.S. 33"`)
  - [ ] Short-form and `supra`-style citation resolution requiring a preceding full citation
  - [ ] Ambiguous-match detection — citations that should resolve to multiple candidates rather than a false single match
  - [ ] HTML-escaping / case-name-with-punctuation safety (quotes, ampersands, script-injection-shaped input)
- [ ] Fix any bugs in `src/providers/citationParser.ts` and `src/providers/hallucinationCheck.ts` that the ported tests expose

### Out of Scope

- Porting Django/DB/Elasticsearch-dependent CourtListener tests (`RECAPDocumentObjectTest`, most of `CitationObjectTest`, `CitationCommandTest`, `CitationFeedTest`, `GroupParentheticalsTest`) — these test integration with CourtListener's own case-record database and search index, which has no equivalent in this standalone library
- Parenthetical descriptiveness scoring (`FilterParentheticalTest` / `DescriptionScoreTest`) — loosely related but not a feature this library implements; skipped per user decision to focus on parsing/hallucination categories
- Implementing the USPTO Patent Center provider — separate pre-existing tech debt item (`CONCERNS.md`), not part of this work
- Consolidating the three near-duplicate enterprise providers (Westlaw/LexisNexis/Bloomberg) — separate pre-existing tech debt item, not part of this work
- Fixing the `openclerk-word` / `openclerk-core` drift (duplicate logic across repos) — out of scope, lives in a separate repo

## Context

This is a brownfield project — `.planning/codebase/` contains a full codebase map (STACK, ARCHITECTURE, STRUCTURE, CONVENTIONS, TESTING, INTEGRATIONS, CONCERNS) generated 2026-07-15.

Relevant prior findings from `CONCERNS.md`:
- `citationParser.ts` (439 lines) has twice produced quadratic/ReDoS regexes during past feature work, both since fixed and documented in `SECURITY_AUDIT.md`. Any new regex touching full document text needs adversarial-input benchmarking.
- `caseNamesMatch` / `normalizeCaseNameParty` in `citationParser.ts` (consumed by `hallucinationCheck.ts`) is flagged as fragile — the exact area CourtListener's ambiguous-match and reporter-normalization tests would exercise. Two real bypasses were already found and fixed here (empty-string substring bypass, short-fragment substring bypass).
- `hallucinationCheck.ts` fails open (reports "verified") when either the parsed citation or the provider match lacks a case name — a documented, deliberate design choice worth keeping in mind when porting ambiguous-match tests.

Source material for this work: `https://github.com/freelawproject/courtlistener/blob/main/cl/citations/tests.py` (CourtListener's own citation-matching test suite, ~9 classes / ~35 test methods). Only a subset is portable to this standalone library; see Active requirements above for the four portable categories identified.

## Constraints

- **Test framework**: Jest 30.x with `ts-jest`, tests live under `tests/**/*.test.ts` — new ported tests should follow this convention
- **Zero runtime dependencies**: Library declares no runtime `dependencies`, only `devDependencies` — any bug fixes must not introduce new runtime dependencies
- **Never throw on expected "not found"**: `lookupCitation` and `checkCitation` must never throw for "not found"/"no issues" — return `null`/`[]` instead; bug fixes must preserve this contract
- **Regex safety**: Any new or modified regex scanning full document text must be benchmarked against adversarial input before merge, per the existing pattern in `citationParser.ts`

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Port only 4 of ~9 CourtListener test categories | Most CourtListener tests depend on Django ORM/DB/Elasticsearch that doesn't exist in this standalone library; only parsing/matching/escaping logic is portable | — Pending |
| New dedicated test file rather than extending existing test files | Keeps CourtListener-sourced cases traceable to their origin | — Pending |
| Scope includes fixing bugs the ported tests expose, not just adding tests | User explicitly confirmed "tests + fixes" over "tests only" | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-15 after initialization*
