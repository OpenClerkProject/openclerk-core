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
    "openclerk-core": "github:OpenClerkProject/openclerk-core#v0.2.0"
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
