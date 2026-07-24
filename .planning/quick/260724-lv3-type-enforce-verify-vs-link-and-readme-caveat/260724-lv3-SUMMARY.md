---
status: complete
phase: quick
plan: 260724-lv3
subsystem: providers
tags: [enterprise-providers, hallucination-check, link-only, verify-vs-link, readme, type-safety]
dependency-graph:
  requires:
    - .planning/research/westlaw-lexisnexis-integration.md
  provides:
    - "LinkOnlyProvider / isLinkOnlyProvider capability tag (type-enforced verify-vs-link boundary)"
    - "HallucinationCheckResult.linkOnlyProviders field"
  affects:
    - src/providers/types.ts
    - src/providers/base.ts
    - src/providers/hallucinationCheck.ts
tech-stack:
  added: []
  patterns:
    - "Capability-marker interface + runtime is-guard (mirrors supportsOpinionText / supportsRateLimitAwareness)"
    - "Fail-safe default: enterprise providers are link-only unless proven verification-capable (opt-out, not opt-in)"
key-files:
  created:
    - tests/linkOnlyProvider.test.ts
  modified:
    - src/providers/types.ts
    - src/providers/base.ts
    - src/providers/hallucinationCheck.ts
    - README.md
    - package.json
    - package-lock.json
decisions:
  - "Implemented the research doc's own Redesign-Proposal recommendation: a LinkOnlyProvider capability tag checked by checkCitationsForHallucinations BEFORE verifiedVia is ever assigned, rather than a verificationCapable boolean on the base contract."
  - "Placed the link-only default on EnterpriseCitationProvider (typed boolean, value true) so it is fail-safe: every contract-gated vendor is quarantined from verification unless a subclass explicitly proves itself verification-capable and sets linkOnly=false. CourtListener is not an enterprise provider, so it stays verification-capable."
  - "Did NOT build a westlawLinkForCitation() composable-URL deep-link builder: research Open Question 5 (REFUTED across 13 years of sources) shows no composable vendor deep-link URL exists; fabricating one would manufacture the exact wrong-link/false-verified outcome the task exists to prevent. The existing lookupCitation already yields the vendor's own permalink for the link-out use case."
  - "Bumped 0.4.2 -> 0.5.0 for the additive public exports, per PR #18 precedent (new public surface -> minor bump)."
metrics:
  completed: 2026-07-24
  tests-added: 7
  tests-total: "347 passed, 5 skipped (opt-in live-network)"
---

# Quick Task 260724-lv3: Type-enforce verify-vs-link + README enterprise caveat — Summary

Closed plan steps 3 and 4 from the provider-versioning line of work. The load-bearing change makes
the "a Westlaw/LexisNexis/Bloomberg link is NOT a citation verification" boundary part of the type
system and the hallucination-check control flow, instead of a comment; the README now documents the
enterprise providers' configurable-shell / link-only / customer-specific-terms posture.

## What changed

- **`src/providers/types.ts`** — new `LinkOnlyProvider` interface (`readonly linkOnly: true`) and
  `isLinkOnlyProvider` runtime guard, following the established
  `OpinionTextCapableProvider`/`supportsOpinionText` idiom. `CitationMatch` doc now states a
  non-null match means "here is a URL", not "this citation is genuine".
- **`src/providers/base.ts`** — `EnterpriseCitationProvider.linkOnly = true` (typed `boolean` so a
  future proven-verification-capable subclass can override to `false`). Fail-safe default: every
  enterprise vendor (Westlaw, LexisNexis, Bloomberg Law, and the USPTO placeholder) is link-only
  out of the box.
- **`src/providers/hallucinationCheck.ts`** — `checkCitationsForHallucinations` checks
  `isLinkOnlyProvider` FIRST (before auth/lookup), records the provider under a new
  `linkOnlyProviders: string[]` result field, and `continue`s without ever calling it for a match
  or setting `verifiedVia`. Never-throw contract preserved (pure additive if/continue).
- **`tests/linkOnlyProvider.test.ts`** (new, 7 tests) — the real enterprise providers report
  link-only and CourtListener does not; a link-only provider whose `lookupCitation` WOULD return a
  clean name-matching match still never verifies and is quarantined (a jest spy proves it is not
  even called); a non-link-only control with the identical match DOES verify, proving the marker is
  the deciding factor; mixed and link-only-only orderings behave correctly.
- **`README.md`** — new "Enterprise providers are link-only, configurable shells" subsection
  (no shipped endpoint/key + unverified content paths; link-never-verification enforced in the type
  system; customer-specific subscriber terms restricting automated/bulk access).
- **`package.json` / `package-lock.json`** — 0.4.2 → 0.5.0.

## Verification

- `npm run build` (tsc 5.4.2, pinned) — clean.
- `npx jest` — 347 passed, 5 skipped (the opt-in `*.live.test.ts` network suite), 0 failed
  (up from 340 before this task).
- No new runtime dependencies.

## Explicitly deferred / not done

- No composable deep-link URL builder (see the decision above — research refutes any such formula).
- No change to the enterprise providers' speculative `SEARCH_PATH` content endpoints — they remain
  unverified placeholders (plan step 2's "configurable shell until a design partner" posture).
- USPTO ODP provider (plan step 5) — separate track, not in scope.
