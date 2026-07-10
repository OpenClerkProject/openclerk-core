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

## Usage

Not yet published to the npm registry — consume it as a git dependency:

```json
{
  "dependencies": {
    "openclerk-core": "github:OpenClerkProject/openclerk-core#v0.1.0"
  }
}
```

```ts
import { parseCaseCitation, bluebookRuleSetRegistry, citationProviderRegistry } from "openclerk-core";
```

## Development

```bash
npm install
npm run build   # compiles src/ -> lib/ (CommonJS + .d.ts)
npm test        # runs the Jest suite
```

To pick up upstream reporters-db updates:

```bash
npm run bluebook:update-data
```

## License

MIT
