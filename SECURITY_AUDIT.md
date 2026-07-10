# Security audit — openclerk-core

Date: 2026-07-09 (updated 2026-07-10 — see finding 4, found while rebasing
this audit's branch onto `main` after PR #2 landed)
Scope: `openclerk-core` only (platform-agnostic citation parsing, Bluebook
rule-checking, and citation-lookup provider plugin architecture). A
companion audit of `openclerk-word` — the Office.js Word add-in that
currently maintains its own separate copy of similar logic — was performed
alongside this one; see that repo's `SECURITY_AUDIT.md`. `openclerk-gdocs`
and `openclerk-libreoffice` were out of scope: both are empty placeholder
repos with no commits and no code.

## Methodology

Manual read-through plus targeted checks of: outbound network calls and
credential handling in `src/providers/`; the HTML-escaping and
hyperlink-URL-safety helpers in `src/utils.ts`; the `reporters-db` data
vendoring pipeline (`scripts/generate-bluebook-data.js`) and how that data
is consumed in `src/bluebook/`; regex complexity in the citation-scanning
hot path (`src/providers/citationParser.ts`), verified with an actual
timing benchmark against adversarial input rather than by inspection alone;
and a search for `eval`/`Function`/dynamic code execution. No `npm audit`
was run against `package.json` (it currently has zero runtime
`dependencies` — only `devDependencies` — so npm supply-chain exposure for
consumers of the published package is minimal).

## Findings fixed in this audit

### 1. Quadratic ReDoS in `extractCaseCitations` — fixed
**File:** `src/providers/citationParser.ts` (was lines 10-12,
`CASE_CITATION_REGEX` at lines 25-28, `extractCaseCitations` at 43-55)

`extractCaseCitations` runs on full "running document text" (per its own
docstring) and used an unbounded `(?:\s+TOKEN)*` repetition for the
case-name portion of the pattern, appearing twice in the same regex.
Benchmarked before the fix: a 150,000-character adversarial input (a long
run of capitalized two-letter tokens with no `" v "` and no closing
citation — e.g. an all-caps heading or a name-heavy appendix) took ~20
seconds to scan. A multi-hundred-KB Word document containing such text
would block the add-in for minutes.

**Fix:** bounded the case-name continuation-token repetition from `*`
(unbounded) to `{0,12}` (real Bluebook case names don't run past a handful
of words). Re-benchmarked after the fix: a 488,893-character adversarial
input now completes in 2ms (previously, 150,000 characters took ~20,000ms).
Full `npm test` suite (111 tests) still passes.

### 2. Unpinned supply-chain fetch feeding unescaped `RegExp` construction — fixed
**Files:** `scripts/generate-bluebook-data.js` (fetch URLs, was lines
20-24), `src/bluebook/courtRules.ts:27`,
`src/bluebook/checkCaseNameAbbreviations.ts:77`

`generate-bluebook-data.js` (the manually-run `npm run bluebook:update-data`
script that vendors Free Law Project's `reporters-db` data into
`src/bluebook/generated/`) fetched three JSON files from
`raw.githubusercontent.com/freelawproject/reporters-db/main/...` — pinned
to the mutable `main` branch, not a tag/commit/checksum. This script is
dev-time-only (not part of `npm run build`, not run in CI, no `postinstall`
hook), so exploitation would require a maintainer to run it and commit a
malicious diff without noticing. But two call sites splice values sourced
from that vendored data directly into `new RegExp()` without escaping regex
metacharacters:
- `src/bluebook/courtRules.ts:27` — `fullName` from
  `STATE_ABBREVIATIONS` (vendored)
- `src/bluebook/checkCaseNameAbbreviations.ts:77` — `entry.word` from
  `T6_T13_MERGER_ABBREVIATIONS` (hand-written, not vendored — lower risk on
  its own, but fixed for consistency)

Today's vendored values are plain words, so this was inert in practice, but
it's a real supply-chain-to-regex-injection chain: a malicious upstream
`reporters-db` entry containing regex metacharacters (e.g. something
`(a+)+$`-shaped) could, once vendored and committed, become a ReDoS or
unintended-match primitive that fires on every document scanned by every
consumer of this library.

**Fix:**
- Pinned the three fetch URLs in `generate-bluebook-data.js` to the
  `v3.2.66` tag of `freelawproject/reporters-db` (verified this tag's data
  files fetch successfully) instead of `main`, with a comment documenting
  how a maintainer bumps the pin after reviewing an upstream update. No
  regeneration of the vendored `.generated.ts` files was performed as part
  of this fix — only the pin itself changed; the currently-committed
  generated data is unaffected.
- Added an `escapeRegExp` helper to `src/utils.ts` and used it at both
  `new RegExp()` call sites above.

### 3. Double-unescape bug in `stripHtmlHyperlinks` — fixed
**File:** `src/utils.ts` (was lines 65-83)

`stripHtmlHyperlinks` decoded HTML entities via sequential `.replace()`
calls (one per entity), unlike its sibling
`src/providers/opinionTextExtractor.ts`'s `stripHtmlTags`, which explicitly
uses a single combined-regex pass specifically to avoid double-unescaping
(that function's own comment calls this out). The bug: input like
`"&amp;amp;lt;"` would incorrectly decode all the way to `"&lt;"` instead
of stopping at the correct `"&amp;lt;"`, because the `&amp;` → `&`
substitution ran first and manufactured a new `&lt;` match for a later
substitution to consume. No current caller in this repo re-renders this
function's output as HTML, so this wasn't an active injection vector, but
it was a real correctness/consistency gap next to a sibling function that
explicitly guards against exactly this.

**Fix:** rewrote `stripHtmlHyperlinks`'s entity decoding as a single
combined-regex pass, mirroring `opinionTextExtractor.ts`'s approach.

### 4. Quadratic ReDoS in `SHORT_FORM_REGEX` (`extractCitationTokens`) — fixed
**File:** `src/providers/citationParser.ts` (`SHORT_FORM_REGEX`)

Found while rebasing this audit's branch onto `main` after PR #2 ("Extract
platform-agnostic core...") landed there and added `extractCitationTokens`
(short-form/`Id.`/`supra` citation tokenizing, used by the new
`hallucinationCheck`/citation-clustering feature) — not part of the
original 2026-07-09 pass, since that code didn't exist on `main` yet when
this audit started.

`SHORT_FORM_REGEX` matches things like `"444 U.S. at 495"` or
`"Liepelt, 444 U.S. at 495"`. Unlike `CASE_CITATION_REGEX` (where a
required literal `" v "` sharply limits how many text positions the
expensive part of the pattern is even attempted from), `SHORT_FORM_REGEX`'s
leading case name is optional, so a bare `\d+\b` can anchor a match attempt
at nearly every digit run in the text. Combined with the reporter
segment's unbounded lazy quantifier (`[A-Za-z0-9.&' ]+?`) scanning forward
each time looking for a literal `" at "` a document may never contain, this
was quadratic: confirmed ~8s at ~109,000 chars and ~25s at ~189,000 chars
(and didn't complete within a 2-minute timeout at ~589,000 chars).

**Fix:** bounded the reporter segment to `{1,40}` (no real Bluebook
reporter abbreviation runs anywhere near 40 characters). Re-benchmarked:
~589,000 chars now completes in 90ms, ~1,539,000 chars in 228ms. Full test
suite (130 tests, including the new `citationClustering.test.ts` and
`hallucinationCheck.test.ts` from PR #2) still passes.

## Findings documented only (no code change)

### A. `openclerk-word` does not consume this package
`openclerk-core`'s README states it was "extracted from `openclerk-word` so
logic doesn't have to be duplicated (or drift out of sync)." Verified this
is not yet true in practice: `openclerk-word/package.json` has no
dependency on `openclerk-core`, nothing is installed under
`openclerk-word/node_modules`, and `openclerk-word` maintains its own
separate copies of provider logic, Bluebook logic, and the
`escapeHtml`/`isSafeHyperlinkUrl` helpers (e.g.
`openclerk-word/src/taskpane/bluebook/manualCorrections.ts` is a distinct
file from this repo's `src/bluebook/manualCorrections.ts`). Practical
consequence: the fixes in this audit (items 1-3 above) do **not**
automatically reach the shipped Word add-in — they'd need to be
independently ported, or `openclerk-word` would need to be migrated to
depend on this package as originally intended. Recommend the maintainers
either wire `openclerk-word` up to consume `openclerk-core`, or explicitly
retire one of the two copies to stop them drifting further apart.

### B. Enterprise provider `apiBaseUrl` is user-supplied, scheme-checked only
`src/providers/base.ts:34-37` (and each enterprise provider, e.g.
`westlawProvider.ts:21`) accepts a user-supplied `apiBaseUrl` credential
field for Westlaw/LexisNexis/Bloomberg Law, validated only for the
`https://` scheme — no host allowlist, no block on internal/private IP
ranges (`127.0.0.1`, `169.254.169.254` cloud-metadata, RFC1918, etc.). This
reads as intentional "bring your own enterprise endpoint" design (per the
class doc comment in `base.ts`) rather than an externally exploitable bug —
it's the authenticated user's own input, and OAuth credentials they
themselves typed in. Flagging for product-owner confirmation rather than
restricting unilaterally, since narrowing this would break the intended
enterprise-BYO-endpoint feature for legitimate deployments.

### C. `CourtListener` result URL is trusted from the API response
`src/providers/courtListenerProvider.ts:144` builds
`` `${SITE_ORIGIN}${cluster.absolute_url}` `` from the CourtListener JSON
response's `absolute_url` field without independently re-validating it
before returning it as `CitationMatch.url`. If CourtListener's API were
ever compromised or MITM'd, this could theoretically return an
attacker-shaped "URL" (e.g. a scheme-relative `//evil.com/...`) that a
caller might treat as a trusted hyperlink target. In practice,
`openclerk-word` already runs every hyperlink target through its own
`isSafeHyperlinkUrl` before insertion (verified at all 4 call sites in that
repo), so this is defense-in-depth only. Noting it as a downstream trust
boundary — any future consumer of this package should not skip that
validation step.

### D. CI action pinning
`.github/workflows/ci.yml` in this repo pins `actions/checkout` and
`actions/setup-node` to major-version tags (`@v4`), not commit SHAs.
Standard practice, but not maximally hardened against a compromised
upstream Action release. Lower priority here since this workflow has no
secrets and no publish step (build+test only).

## Out of scope

`openclerk-gdocs` and `openclerk-libreoffice` — both empty repositories
with no commits on the `claude/security-audit-r5lbyz` branch or elsewhere;
nothing to audit.
