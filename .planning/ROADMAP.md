# Roadmap: openclerk-core — CourtListener Test Porting & Bug Fixes

## Overview

This milestone ports the portable subset of CourtListener's own citation-matching test suite
(`cl/citations/tests.py`) into this standalone library as `tests/courtListenerPorted.test.ts`,
and fixes whatever bugs those tests expose in `src/providers/citationParser.ts` and
`src/providers/hallucinationCheck.ts`. Each phase is an end-to-end vertical slice: port the
tests for one category of citation-matching behavior, then fix (with adversarial regression
coverage) whatever those tests reveal is broken — never "all tests first, all fixes later."
The three phases move from foundational parsing normalization, through the fragile
short-form/supra/ambiguous-match resolution logic that shares the `caseNamesMatch` gate, to
case-name/HTML safety and final cross-category traceability.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Reporter-Spacing Normalization** - Port reporter-spacing edge-case tests and fix any parser normalization bug they expose, without introducing new ReDoS risk
- [ ] **Phase 2: Short-Form, Supra & Ambiguous-Match Resolution** - Port short-form/supra/ambiguous-match tests and fix the caseNamesMatch/hallucinationCheck bugs they expose
- [ ] **Phase 3: Case-Name & HTML Safety, Full Traceability** - Port HTML-escaping/case-name-safety tests and finalize the dedicated ported-test file across all four categories

## Phase Details

### Phase 1: Reporter-Spacing Normalization
**Goal**: Citations with non-canonical reporter spacing/formatting are extracted and matched identically to canonically-formatted citations, with any exposed parser bug fixed safely.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: TEST-01, FIX-01
**Success Criteria** (what must be TRUE):
  1. Ported CourtListener reporter-spacing test cases (e.g. `"22 U. S. 33"` vs `"22 U.S. 33"`) exist in `tests/courtListenerPorted.test.ts`, each traceable via comment to its source test in `cl/citations/tests.py`, and all pass.
  2. `extractCaseCitations`/`parseCaseCitation` produce the identical `ParsedCitation` shape for reporter-spacing variants of the same citation (e.g. extra internal spaces, non-canonical punctuation spacing).
  3. Any parser bug found and fixed in `citationParser.ts` is benchmarked against adversarial input (per the existing ReDoS-safety pattern documented in `SECURITY_AUDIT.md`) with no new quadratic/catastrophic-backtracking regex introduced.
  4. Full `npm test` suite still passes after the fix, with no regression to citations whose non-canonical spacing was already handled correctly.
**Plans**: TBD

### Phase 2: Short-Form, Supra & Ambiguous-Match Resolution
**Goal**: Short-form and `supra`-style citations resolve to the correct preceding full citation, and citations with ambiguous volume/reporter/page triples are flagged as multi-candidate rather than falsely resolved to a single match — with any `caseNamesMatch`/hallucination-check bugs these expose fixed.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: TEST-02, TEST-03, TEST-04, FIX-02, FIX-03
**Success Criteria** (what must be TRUE):
  1. Ported short-form citation test cases (e.g. `"515 U.S., at 240"`) resolve to the correct preceding full citation when one exists in the same text, each traceable via comment to its `cl/citations/tests.py` source.
  2. Ported `supra`-style citation test cases resolve to the correct preceding full citation.
  3. Ported ambiguous-match test cases (citations whose volume/reporter/page could match multiple candidates) are flagged as multi-candidate/ambiguous rather than silently resolved to one false match.
  4. Any bug in `hallucinationCheck.ts` exposed by the ambiguous-match cases is fixed while preserving the "never throw" contract (`checkCitationsForHallucinations` still returns without throwing for not-found/rate-limited cases).
  5. Any bug in `caseNamesMatch`/`normalizeCaseNameParty` exposed by short-form, supra, or ambiguous-match cases is fixed, with new adversarial regression cases added (e.g. empty/punctuation-only parties, single-letter parties, substring-contained abbreviations) mirroring the bypass patterns already documented in `SECURITY_AUDIT.md`.
**Plans**: TBD

### Phase 3: Case-Name & HTML Safety, Full Traceability
**Goal**: Case names containing quotes, ampersands, and script-injection-shaped strings are safely escaped in any HTML-rendering path, and the ported CourtListener test file provides complete, source-traceable coverage across all four portable categories.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: TEST-05, TEST-06
**Success Criteria** (what must be TRUE):
  1. Ported test cases for case names containing quotes, ampersands, and script-injection-shaped strings confirm safe HTML-escaping — no raw injection reaches any HTML-rendering helper.
  2. `tests/courtListenerPorted.test.ts` exists as a single dedicated file covering TEST-01 through TEST-05, with every ported case carrying a comment tracing it to its source test in `cl/citations/tests.py`.
  3. Full `npm test` suite passes with the new file included, and no new runtime dependency was introduced by any fix across the milestone.
  4. Existing hyperlink/escaping tests (`tests/hyperlinks.test.ts`) continue to pass, confirming the newly-ported cases don't reveal a regression in already-fixed escaping logic.
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Reporter-Spacing Normalization | 0/TBD | Not started | - |
| 2. Short-Form, Supra & Ambiguous-Match Resolution | 0/TBD | Not started | - |
| 3. Case-Name & HTML Safety, Full Traceability | 0/TBD | Not started | - |
