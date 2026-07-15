# Requirements: openclerk-core

**Defined:** 2026-07-15
**Core Value:** Citations extracted and matched by this library must be correct and never silently wrong — a false "verified" or a missed hallucination undermines the entire point of the hallucination-check feature.

## v1 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### Ported Test Coverage

- [x] **TEST-01**: Reporter-spacing variants (e.g. `"22 U. S. 33"`) are extracted as the same citation as canonical spacing (`"22 U.S. 33"`)
- [x] **TEST-02**: Short-form citations (e.g. `"515 U.S., at 240"`) resolve correctly when a preceding full citation exists in the same text
- [x] **TEST-03**: `supra`-style citations resolve to the correct preceding full citation
- [ ] **TEST-04**: Citations with ambiguous volume/reporter/page triples are flagged as multiple-candidate matches rather than falsely resolved to a single match
- [ ] **TEST-05**: Case names containing quotes, ampersands, and script-injection-shaped strings are safely escaped in any HTML-rendering path
- [ ] **TEST-06**: A new dedicated test file (`tests/courtListenerPorted.test.ts`) exists covering TEST-01 through TEST-05, with each ported case traceable in a comment to its source test in `cl/citations/tests.py`

### Bug Fixes

- [x] **FIX-01**: Any parser bug in `src/providers/citationParser.ts` exposed by the ported reporter-spacing/regex tests (TEST-01) is fixed without introducing new ReDoS risk — verified against adversarial input per the existing benchmarking pattern in this file
- [ ] **FIX-02**: Any hallucination-check bug in `src/providers/hallucinationCheck.ts` exposed by the ported ambiguous-match tests (TEST-04) is fixed while preserving the documented "never throw" contract
- [x] **FIX-03**: Any case-name matching bug in `caseNamesMatch`/`normalizeCaseNameParty` (`src/providers/citationParser.ts`) exposed by ported tests (TEST-02, TEST-03, TEST-04) is fixed, with new adversarial-input regression cases added alongside the fix

## v2 Requirements

None — this is a focused, single-milestone project.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Porting Django/DB/Elasticsearch-dependent CourtListener tests (`RECAPDocumentObjectTest`, most of `CitationObjectTest`, `CitationCommandTest`, `CitationFeedTest`, `GroupParentheticalsTest`) | These test integration with CourtListener's own case-record database and search index — no equivalent exists in this standalone library |
| Parenthetical descriptiveness scoring (`FilterParentheticalTest` / `DescriptionScoreTest`) | Loosely related but not a feature this library implements; user chose to focus on parsing/hallucination categories only |
| Implementing the USPTO Patent Center provider | Pre-existing tech debt item tracked separately in `CONCERNS.md`, not part of this work |
| Consolidating the three near-duplicate enterprise providers (Westlaw/LexisNexis/Bloomberg) | Pre-existing tech debt item, not part of this work |
| Fixing `openclerk-word` / `openclerk-core` logic drift | Lives in a separate repo, out of scope here |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| TEST-01 | Phase 1 | Complete |
| TEST-02 | Phase 2 | Complete |
| TEST-03 | Phase 2 | Complete |
| TEST-04 | Phase 2 | Pending |
| TEST-05 | Phase 3 | Pending |
| TEST-06 | Phase 3 | Pending |
| FIX-01 | Phase 1 | Complete |
| FIX-02 | Phase 2 | Pending |
| FIX-03 | Phase 2 | Complete |

**Coverage:**

- v1 requirements: 9 total
- Mapped to phases: 9 ✓
- Unmapped: 0

---
*Requirements defined: 2026-07-15*
*Last updated: 2026-07-15 after roadmap creation*
