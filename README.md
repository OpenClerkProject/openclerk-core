# openclerk-core

Platform-agnostic citation parsing, Bluebook rule-checking, and citation-lookup provider logic
shared across [OpenClerk](https://github.com/OpenClerkProject)'s Word add-in, and its planned
Google Docs and LibreOffice integrations.

This package holds no document-editor-specific code — no Office.js, no Google Apps Script, no
DOM APIs. It was extracted from
[openclerk-word](https://github.com/OpenClerkProject/openclerk-word) so that logic doesn't have
to be duplicated (or drift out of sync) across each platform integration.

## What's in here

- **`src/providers/`** — the citation-lookup provider plugin architecture (`CitationProvider`
  interface, a registry, and implementations for CourtListener, Westlaw, LexisNexis, Bloomberg
  Law, and USPTO Patent Center), plus citation parsing (`citationParser.ts`), pincite-page
  handling (`pincitePages.ts`), and cited-opinion-text extraction (`opinionTextExtractor.ts`).
  `citationParser.ts` also does eyecite-style citation resolution: `extractCitationTokens` finds
  full, short-form (`444 U.S. at 495`), `Id.`, and `supra` citations in running text;
  `clusterCitationTokens` groups them by which case each one refers to; and
  `findOrphanedCitations` surfaces a short-form/`Id.`/`supra` citation with no resolvable
  antecedent. `hallucinationCheck.ts`'s `checkCitationsForHallucinations` checks a list of
  citations against a list of `CitationProvider`s and reports any that none of them can verify —
  see `tests/hallucinationCheck.test.ts`, which runs this against real text from the *Mata v.
  Avianca* filing at the center of the widely reported ChatGPT-fabricated-citation incident, and
  confirms the two fabricated cases in it are correctly flagged as unverified. (The PDF itself,
  and the OCR pipeline used to recover its text, live in
  [openclerk-web](https://github.com/OpenClerkProject/openclerk-web) — that's a heavy,
  browser-upload-specific concern this platform-agnostic package deliberately doesn't carry.)
  Resolving a citation's locator (reporter/volume/page) is not the same as confirming the case is
  real — CourtListener's citation-lookup API, for one, resolves purely by locator, so it returns
  whatever real case is actually published there even if the case name typed alongside it names
  something else entirely. `checkCitationsForHallucinations` guards against this with
  `caseNamesMatch`: a provider result only counts as `verifiedVia` when its returned case name
  actually corresponds to the citation's own parsed name; a locator that resolves to a genuine but
  differently-named case is reported via the result's `nameMismatch` field instead — a stronger
  fabrication signal than a plain miss, since it means the reporter/volume/page is real but
  misattributed.
- **`src/bluebook/`** — Bluebook citation format-checking across the 20th/21st/22nd editions,
  including reporter/case-name/state abbreviation data vendored from
  [reporters-db](https://github.com/freelawproject/reporters-db) (`src/bluebook/generated/`) and a
  hand-maintained `manualCorrections.ts` for community-contributed fixes.
- **`src/utils.ts`** — shared string/HTML helpers (text normalization, HTML escaping, hyperlink
  URL safety checks).

### Enterprise providers are link-only, configurable shells

Only **CourtListener** is a working, verification-capable provider. The enterprise research
vendors — **Westlaw**, **LexisNexis**, and **Bloomberg Law** — are **configurable shells**, not
finished integrations:

- **No shipped endpoint or key.** Each vendor provisions API access per customer contract, so the
  API base URL and credentials are always supplied by the host at runtime (held in memory only,
  never persisted). The OAuth2 token shapes are modelled from real-world evidence
  (`.planning/research/vendor-oauth-endpoints-code-evidence.md`), but the **content/search paths
  are unverified placeholders** to confirm against your firm's own API documentation before
  relying on them. Bloomberg Law's programmatic auth could not be confirmed at all and is left
  registered-but-commented-out in `src/providers/index.ts`.
- **Link, never verification.** Extensive research
  (`.planning/research/westlaw-lexisnexis-integration.md`, Open Questions 5 & 6) found that neither
  Westlaw nor LexisNexis exposes any anonymous, programmatic way to *verify a citation exists*:
  their citation "links" are opaque, UI-generated permalinks that resolve only behind a signed-in,
  licensed human — and resolve to *something* even for a fabricated cite. Treating such a link as
  confirmation would manufacture the exact false-"verified" outcome this library exists to prevent
  (the *Mata v. Avianca* failure mode). This boundary is enforced in the type system, not just by
  convention: every `EnterpriseCitationProvider` is **link-only by default** (see
  `LinkOnlyProvider` / `isLinkOnlyProvider` in `src/providers/types.ts`), and
  `checkCitationsForHallucinations` quarantines any link-only provider — it is reported under the
  result's `linkOnlyProviders` field and can **never** set `verifiedVia`. The realistic model is:
  *verify* against CourtListener's open data, *link out* to Westlaw/Lexis.
- **Terms are customer-specific.** Westlaw/LexisNexis/Bloomberg Law subscriber agreements
  typically restrict automated and bulk access; whether — and how — a firm may drive these APIs is
  governed by that firm's own contract. These providers are intended to be wired up by a
  design-partner firm using credentials it already holds, not used speculatively.

## Usage

Published to the npm registry — a CI workflow (`.github/workflows/publish.yml`) runs `npm
publish` whenever a `vX.Y.Z` tag is pushed, authenticated via [npm Trusted
Publishing](https://docs.npmjs.com/trusted-publishers/) (OIDC) rather than a stored token: no
`NPM_TOKEN` secret exists in this repo. `prepare` builds `src/` -> `lib/` at publish time, the
same as any other npm package; consumers never run a build step themselves.

Trusted Publishing requires a one-time setup on npmjs.com's package settings page (Settings ->
Trusted Publisher -> GitHub Actions), specifying this org/repo/workflow filename exactly. npm
doesn't allow configuring a trusted publisher for a package that doesn't exist yet, so the very
first publish of a new package has to happen manually (`npm publish` from an authenticated local
session) before trusted publishing can be turned on for every release after that.

```json
{
  "dependencies": {
    "openclerk-core": "^0.2.6"
  }
}
```

```ts
import { parseCaseCitation, bluebookRuleSetRegistry, citationProviderRegistry } from "openclerk-core";
```

(Earlier versions were consumed as a git dependency instead — abandoned because installing a git
dependency requires its `prepare` script to run at install time on the *consumer's* machine, which
some npm setups block behind an `allowScripts` allowlist that a fresh git dependency can't satisfy
[due to a known npm/cli bug](https://github.com/npm/cli/issues/9450), even with an explicit
`allowScripts` entry. Registry installs don't have this problem: `prepare` only ever runs once, at
publish time, on this repo's own CI.)

## Development

```bash
npm install
npm run build   # compiles src/ -> lib/ (CommonJS + .d.ts)
npm test        # runs the Jest suite
```

To cut a release: bump `version` in `package.json`, merge, then `git tag vX.Y.Z && git push origin
vX.Y.Z` — the tag push triggers the publish workflow, which fails closed if the tag doesn't match
`package.json`'s version.

To pick up upstream reporters-db updates:

```bash
npm run bluebook:update-data
```

## License

MIT
