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
- ✓ Reporter-spacing/regex normalization edge cases ported from CourtListener into `tests/courtListenerPorted.test.ts`, and the reporter-spacing bug they exposed fixed via `normalizeReporterSpacing` + a `ParsedCitation.reporterRaw`/`reporter` field split (so Bluebook formatting checks still see as-written text while citation matching treats spacing variants as equivalent) — Phase 1
- ✓ Opt-out toggle for reporter-spacing normalization (`setReporterSpacingNormalizationEnabled`/`isReporterSpacingNormalizationEnabled`/`resetReporterSpacingNormalization`, mirroring the `http.ts` swappable-client pattern) — emerged during Phase 1 UAT sign-off as a risk mitigation, shipped as a quick task
- ✓ Short-form and `supra`-style citation resolution ported from CourtListener into `tests/courtListenerPorted.test.ts`; three reproduced bugs fixed: missing optional comma before "at" (`"515 U.S., at 240"` was unparseable), locator-based short-form misattachment (bare short forms now resolve by their own volume/reporter before falling back to the most-recently-seen citation), and `caseNameMatchesToken`'s raw-substring bypass (rewritten to delegate to the already-hardened `normalizeCaseNameParty`/`partyWordsContain`) — Phase 2
- ✓ Ambiguous-match detection: `CitationMatch`/`HallucinationCheckResult`/`OpinionExcerptResult` gained an `ambiguousMatch?: { candidateCount }` field; `CourtListenerProvider.lookupCitation` and `resolveClusterId` (used by "Embed Cited Text") both now disambiguate multi-cluster locator results via `caseNamesMatch` instead of silently taking the first candidate — Phase 2
- ✓ HTML-escaping / case-name-with-punctuation safety ported from CourtListener into `tests/courtListenerPorted.test.ts` — `escapeHtml`, `isSafeHyperlinkUrl`, `stripHtmlHyperlinks`, and `stripHtmlTags` were all confirmed already correct against CourtListener's real adversarial case-name/script-injection fixtures (no production bug found); code review caught and fixed two test-quality issues instead (a flaky wall-clock ReDoS benchmark ceiling, an overstated "lossless round-trip" claim) — Phase 3
- ✓ `tests/courtListenerPorted.test.ts` provides complete, source-traceable coverage across all four portable CourtListener categories (reporter-spacing, short-form/supra/ambiguous-match, HTML-escaping), audited end-to-end across all three phases — Phase 3, closes TEST-06 and the CourtListener test-porting milestone

### Active

None — this milestone's scope is fully shipped. See Out of Scope below for what remains deliberately unaddressed.

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
- `caseNamesMatch` / `normalizeCaseNameParty` in `citationParser.ts` (consumed by `hallucinationCheck.ts`) is flagged as fragile — the exact area CourtListener's ambiguous-match and reporter-normalization tests would exercise. Two real bypasses were already found and fixed here (empty-string substring bypass, short-fragment substring bypass). Phase 2 found a third instance of the same bypass class living in a sibling comparator, `caseNameMatchesToken` (used by `clusterCitationTokens`, not `caseNamesMatch` itself) — it had never received the same hardening. Any future function that independently compares case names should be checked against this pattern.
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
| Port only 4 of ~9 CourtListener test categories | Most CourtListener tests depend on Django ORM/DB/Elasticsearch that doesn't exist in this standalone library; only parsing/matching/escaping logic is portable | ✓ Good |
| New dedicated test file rather than extending existing test files | Keeps CourtListener-sourced cases traceable to their origin | ✓ Good |
| Scope includes fixing bugs the ported tests expose, not just adding tests | User explicitly confirmed "tests + fixes" over "tests only" | ✓ Good — Phase 1 code review found and fixed 2 real regressions (CR-01/CR-02) this scope decision would have missed |
| Split `ParsedCitation.reporter` into normalized (`reporter`) and as-written (`reporterRaw`) fields | Code review found that normalizing `reporter` at the source silently defeated the Bluebook reporter-format checker for 138 documented reporters-db typo entries (CR-02); a single field couldn't serve both citation-matching and Bluebook-formatting needs | ✓ Good — Phase 1 |
| Add an opt-out toggle for `normalizeReporterSpacing` | Requested during UAT sign-off as a production safety net for a heuristic-based fix, mirroring the existing `http.ts` swappable-client pattern; defaults to enabled, fully backward compatible | ✓ Good — shipped as quick task 260715-ki4 |
| Do not presuppose a bug in short-form/supra resolution before researching | `clusterCitationTokens` already existed and looked correct on a static read; research was tasked with confirming or disproving rather than assuming | ⚠️ Revisit as a blanket heuristic — Phase 2's research reproduced 3 real bugs against the actual built library (comma-before-"at", locator misattachment, `caseNameMatchesToken` bypass) that a static read alone would likely have missed. The lesson isn't "assume no bug" — it's "always let research execute against real input before trusting a static read either way." |
| Ambiguous-match surfacing via `ambiguousMatch?: { candidateCount }` field, mirroring `nameMismatch` | Follows the existing "found something, with a caveat" optional-field convention (`rateLimited?`, `nameMismatch?`) rather than a breaking return-type change | ✓ Good — Phase 2, and code review caught that the initial fix only covered `lookupCitation`; extended to the sibling `resolveClusterId` (CR-01) before merge |
| Scope TEST-05 to the 4 functions that actually touch HTML (`escapeHtml`, `isSafeHyperlinkUrl`, `stripHtmlHyperlinks`, `stripHtmlTags`) rather than inventing a citation-to-HTML rendering pipeline | Repo-wide grep confirmed these are the only HTML-touching functions; this library is platform-agnostic and doesn't render citations into HTML itself (that's host-side) | ✓ Good — Phase 3, all four confirmed already correct against real CourtListener adversarial fixtures |

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
*Last updated: 2026-07-15 after Phase 3 (milestone v1.0 complete)*
