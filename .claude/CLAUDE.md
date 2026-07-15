<!-- GSD:project-start source:PROJECT.md -->

## Project

**openclerk-core**

`openclerk-core` is a zero-dependency, platform-agnostic TypeScript library for legal citation parsing, lookup, and Bluebook-format validation, published as an npm package and consumed by host add-ins (Word, Google Docs, LibreOffice). It provides two plugin-registry subsystems: citation lookup providers (CourtListener plus enterprise vendors) and Bluebook rule-set editions (20th/21st/22nd).

**Core Value:** Citations extracted and matched by this library must be correct and never silently wrong — a false "verified" or a missed hallucination undermines the entire point of the hallucination-check feature.

### Constraints

- **Test framework**: Jest 30.x with `ts-jest`, tests live under `tests/**/*.test.ts` — new ported tests should follow this convention
- **Zero runtime dependencies**: Library declares no runtime `dependencies`, only `devDependencies` — any bug fixes must not introduce new runtime dependencies
- **Never throw on expected "not found"**: `lookupCitation` and `checkCitation` must never throw for "not found"/"no issues" — return `null`/`[]` instead; bug fixes must preserve this contract
- **Regex safety**: Any new or modified regex scanning full document text must be benchmarked against adversarial input before merge, per the existing pattern in `citationParser.ts`

<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->

## Technology Stack

## Languages

- TypeScript 5.4.2 - Entire library (`src/`), target `es2019`, module `commonjs`
- JavaScript (Node.js) - Data-generation script `scripts/generate-bluebook-data.js`

## Runtime

- Node.js (CI validated on Node 20 for build/test, Node 22 for publish workflow — see `.github/workflows/publish.yml` comment: npm's Trusted Publishing/OIDC support requires npm >= 11.5.1, which requires Node >= 22)
- Library ships as compiled CommonJS (`lib/index.js`) for consumption by host environments (Word add-in, Google Docs, LibreOffice, potentially Google Apps Script)
- npm
- Lockfile: present (`package-lock.json`)

## Frameworks

- None (this is a small, dependency-free TypeScript library — no runtime framework). `package.json` declares zero `dependencies`, only `devDependencies`.
- Jest 30.x (`devDependencies`) with `ts-jest` 29.4.0 preset
- Config embedded in `package.json` under `"jest"` key: `testEnvironment: node`, `testMatch: ["**/tests/**/*.test.ts"]`
- TypeScript compiler (`tsc`) - `npm run build` compiles `src/` → `lib/` per `tsconfig.json`
- `npm run prepare` runs build automatically on install (standard npm lifecycle hook, used for publish pipeline)

## Key Dependencies

- None declared as runtime `dependencies` in `package.json` — the library is intentionally zero-dependency so it can run inside constrained host environments (Word/Office.js add-in, Google Apps Script, etc.)
- `typescript` ^5.4.2 - compilation
- `jest` ^30.0.0 - test runner
- `ts-jest` ^29.4.0 - TypeScript transform for Jest
- `@types/jest` ^30.0.0 - type defs for Jest globals

## Configuration

- No `.env` or environment-variable-based configuration detected. All provider credentials (API tokens, OAuth client id/secret, API base URLs) are supplied at runtime by the host application via `authenticate(credentials)` calls and held in memory only (see `src/providers/base.ts`, `src/providers/courtListenerProvider.ts`) — nothing is read from process env or written to disk.
- `tsconfig.json`: target `es2019`, module `commonjs`, `lib: ["es2019", "dom"]` (DOM lib included likely for `fetch`/`URLSearchParams` typings), `declaration: true` (emits `.d.ts`), `outDir: lib`, `rootDir: src`, strict-ish settings (`forceConsistentCasingInFileNames`, `esModuleInterop`), excludes `tests/`

## Platform Requirements

- Node.js + npm (version implied by CI: Node 20 minimum; Node 22 required to run the publish workflow's `npm@latest`)
- No native/binary dependencies
- Distributed as an npm package (`openclerk-core`) - see `package.json` `"main": "lib/index.js"`, `"types": "lib/index.d.ts"`, `"files": ["lib"]`
- Consumed by host integrations (Word, Google Docs, LibreOffice add-ins) that are out of scope for this repo
- The `HttpClient` abstraction (`src/http.ts`) allows a host without a `fetch`-shaped API (e.g. Google Apps Script's synchronous `UrlFetchApp.fetch()`) to supply its own implementation via `setHttpClient()`, since the default just wraps global `fetch`

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

## Naming Patterns

- camelCase for regular modules: `citationParser.ts`, `hallucinationCheck.ts`, `opinionTextExtractor.ts`
- Provider implementations suffixed `Provider`: `courtListenerProvider.ts`, `lexisNexisProvider.ts`, `westlawProvider.ts`, `bloombergLawProvider.ts`, `usptoPatentCenterProvider.ts`
- Generated/vendored data lives under `src/bluebook/generated/` with a `.generated.ts` suffix: `caseNameAbbreviations.generated.ts`, `reporterAbbreviations.generated.ts`, `stateAbbreviations.generated.ts` — regenerated via `scripts/generate-bluebook-data.js` (npm script `bluebook:update-data`), never hand-edited.
- Bluebook edition-specific rule sets named by edition: `edition20th.ts`, `edition21st.ts`, `edition22nd.ts`.
- Tests mirror source module name with `.test.ts` suffix, placed in a top-level `tests/` directory (not co-located): `tests/providers.test.ts`, `tests/bluebook.test.ts`, `tests/utils.test.ts`.
- One test file, `tests/courtListener.live.test.ts`, is named `*.live.test.ts` to flag it hits a real network dependency rather than mocks (opt-in / manual-run style test).
- camelCase, verb-first, descriptive of exact behavior: `extractCitationTokens`, `clusterCitationTokens`, `findOrphanedCitations`, `parseCaseCitation`, `caseNamesMatch`, `isSafeHyperlinkUrl`, `escapeRegExp`.
- Boolean-returning functions prefixed `is`/`has`/`was`: `isLikelyCaseCitation`, `isSafeHyperlinkUrl`, `isAuthenticated`, `wasLastRequestRateLimited`, `isReadyForOpinionText`.
- Internal (non-exported) helpers used only within one module are declared with `function` (not arrow-const) and kept file-private: `matchAllToArray`, `partyWordsContain`, `normalizeCaseNameParty` in `src/providers/citationParser.ts`.
- camelCase for locals/params.
- SCREAMING_SNAKE_CASE for module-level regex/string constants that define grammar fragments: `NAME_START_TOKEN`, `CASE_NAME`, `PINCITE_LIST`, `CASE_CITATION_REGEX`, `ALLOWED_HYPERLINK_SCHEMES` (`src/providers/citationParser.ts`, `src/utils.ts`).
- PascalCase interfaces/type aliases, no `I`-prefix: `ParsedCitation`, `CitationMatch`, `CitationProvider`, `HttpClient`, `CitationToken`, `CitationCluster`.
- Union string literal types over enums: `export type CitationTokenType = "full" | "short" | "id" | "supra";` (`src/providers/citationParser.ts:100`).
- Optional fields used liberally on parsed-data interfaces (`ParsedCitation` in `src/providers/types.ts`) rather than separate variant types — "unset means unknown, don't check" is an explicit convention documented in the field's JSDoc.

## Code Style

- No `.prettierrc` or `.eslintrc` file present in the repo — formatting is not enforced by tooling; consistency is maintained by convention/review only.
- 2-space indentation throughout.
- Double quotes preferred in `src/` (e.g. `src/utils.ts`, `src/providers/citationParser.ts`); single quotes are used throughout `tests/*.test.ts`. This split is consistent — treat `src/` as double-quote, `tests/` as single-quote.
- Semicolons used consistently everywhere.
- No lint config detected. One inline suppression exists: `// eslint-disable-next-line @typescript-eslint/no-explicit-any` in `src/http.ts:13` on the `HttpResponse.json()` return type, implying an ESLint ruleset is expected/used in CI or by contributors even without a committed config in this snapshot.
- `tsconfig.json` targets `es2019`, `module: commonjs`, `declaration: true`, `outDir: lib`, `rootDir: src`. No explicit `"strict": true` flag set — treat the codebase as stricter-than-configured based on actual usage (explicit return types on all exported functions, no implicit `any` in practice).
- `src/` is compiled; `tests/` is excluded from the build (`tsconfig.json` `"exclude": ["node_modules", "lib", "tests"]`) and type-checked instead via `ts-jest` at test time.

## Import Organization

- None configured. All cross-module imports use relative paths (`../utils`, `./types`, `../providers/citationParser`).

## Error Handling

- Providers never throw from lookup/query methods — a failed HTTP call, network error, or non-OK response is caught and converted to `null` (or `{ excerpt: null }`), documented explicitly as "moves on" behavior. See `src/providers/courtListenerProvider.ts` and the corresponding tests: `'moves on (returns null) instead of throwing on a network failure'` (`tests/providers.test.ts:379`).
- Auth/setup-time failures (`authenticate()`) throw `Error` with a specific, user-facing message rather than returning a boolean: `throw new Error(\`Missing required field(s): ...\`)` (`src/providers/base.ts:32`), `throw new Error("The API base URL must start with https://...")` (`src/providers/base.ts:37`).
- Rate-limit (HTTP 429) is treated as a distinct condition from a plain miss/404 — surfaced via a `rateLimited: true` flag or a `wasLastRequestRateLimited()` accessor, not conflated with "not found". See `src/providers/courtListenerProvider.ts` and tests under `describe('rate-limit awareness ...')` in `tests/providers.test.ts:437`.
- Best-effort parsing/regex functions return `null` (not throw) when input doesn't match the expected shape: `parseCaseCitation` returns `null` for non-citation-shaped text (`src/providers/citationParser.ts:360-439`).
- `try/catch` used for validating untrusted input shape, not control flow, e.g. `isSafeHyperlinkUrl` wraps `new URL(...)` in `try { ... } catch { return false; }` (`src/utils.ts:48-53`).

## Logging

## Comments

- Extremely dense, deliberate JSDoc/inline commentary is the dominant convention, especially in `src/providers/citationParser.ts` and `src/utils.ts` — every non-obvious regex or algorithmic choice is explained with *why*, not just *what*, often citing the specific Bluebook rule number (e.g. "Rule 10.9", "Rule 1.2") or a concrete real-world example that motivated the code.
- Regression-motivating comments are common and expected: when a bug is fixed, the corresponding code and test both carry a comment describing the original failure mode, e.g. `// Regression test: found via manual validation against a real brief. The old single-pincite pattern stopped after "505"...` (`tests/providers.test.ts:99-100`).
- Performance-sensitive regex bounds are always annotated with the complexity risk and evidence: `// ...confirmed ~20s on a 150K-char adversarial input before this bound was added.` (`src/providers/citationParser.ts:19-23`) and similarly at `src/providers/citationParser.ts:74-81`.
- Known limitations are documented as tests, not left implicit: `test('known limitation: nominative reporters in a parenthetical before the page are not parsed', ...)` (`tests/providers.test.ts:92`).
- Every exported function/class in `src/` gets a `/** ... */` doc comment describing purpose, and frequently the specific hallucination/security scenario it defends against (see `caseNamesMatch` in `src/providers/citationParser.ts:237-251`, referencing the Mata v. Avianca ChatGPT citation-hallucination incident).
- Interface fields also carry per-field JSDoc explaining edge cases (see `ParsedCitation` in `src/providers/types.ts:9-46`).

## Function Design

## Module Design

## Extensibility Pattern (Providers)

- New citation-lookup sources implement the `CitationProvider` interface (`src/providers/types.ts`) and register with `CitationProviderRegistry` (`src/providers/registry.ts`) — nothing else needs to know which provider is active.
- Enterprise/paid providers (LexisNexis, Westlaw, Bloomberg Law) extend the abstract `EnterpriseCitationProvider` base class (`src/providers/base.ts`), which centralizes credential validation, HTTPS-only base-URL enforcement, and the OAuth2 client-credentials handshake (`fetchClientCredentialsToken`) — new enterprise providers should extend this base rather than reimplementing auth.
- Unimplemented/placeholder providers (e.g. `src/providers/usptoPatentCenterProvider.ts`) are still registered and return `null`/throw "not implemented" rather than being omitted, keeping the provider list stable; naming convention marks them clearly with a `(TODO)` suffix in the `name` field.

<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

## System Overview

```text

```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Public API barrel | Re-exports the stable package surface consumed by host integrations | `src/index.ts` |
| Citation parser | Regex-based extraction/clustering of case citations from raw document text | `src/providers/citationParser.ts` |
| Provider registry | Plugin registry mapping provider id → `CitationProvider` instance | `src/providers/registry.ts` |
| Provider contracts | Interfaces (`CitationProvider`, `OpinionTextCapableProvider`, `RateLimitAwareProvider`) all providers implement | `src/providers/types.ts` |
| Enterprise provider base | Shared credential/auth handling for contract-gated vendors | `src/providers/base.ts` |
| Concrete providers | Vendor-specific lookup implementations (CourtListener, LexisNexis, Westlaw, Bloomberg Law, USPTO) | `src/providers/*Provider.ts` |
| Hallucination check | Cross-checks parsed citations against a lookup provider to flag likely-fabricated citations | `src/providers/hallucinationCheck.ts` |
| Opinion text extraction | Pulls excerpt text around a pincite page from a fetched opinion | `src/providers/opinionTextExtractor.ts` |
| Pincite expansion | Expands page ranges/lists (e.g. "705-06") into concrete page numbers | `src/providers/pincitePages.ts` |
| Bluebook rule registry | Plugin registry mapping rule-set id (edition) → `BluebookRuleSet` | `src/bluebook/registry.ts` |
| Bluebook editions | Per-edition (20th/21st/22nd) rule-set implementations composing shared checks | `src/bluebook/edition20th.ts`, `edition21st.ts`, `edition22nd.ts` |
| Bluebook rule modules | Individual rule-check logic (reporters, case names, page ranges, typeface, courts) | `src/bluebook/*Rules.ts`, `checkCaseNameAbbreviations.ts` |
| Generated reference data | Vendored reporter/case-name/state abbreviation tables from reporters-db | `src/bluebook/generated/*.generated.ts` |
| HTTP indirection | Swappable fetch abstraction so non-browser hosts (e.g. Google Apps Script) can supply their own transport | `src/http.ts` |
| Shared text utilities | Text normalization, HTML escaping/hyperlink safety helpers used across modules | `src/utils.ts` |
| Data generation script | Dev-time-only script that regenerates `src/bluebook/generated/*` from a pinned reporters-db tag | `scripts/generate-bluebook-data.js` |

## Pattern Overview

- Two independent, structurally identical plugin systems: `CitationProviderRegistry` (`src/providers/registry.ts`) and `BluebookRuleSetRegistry` (`src/bluebook/registry.ts`), both simple `Map`-backed singletons with register/unregister/get/list.
- Built-in plugins self-register via side-effecting imports in `src/providers/index.ts` and `src/bluebook/index.ts` at module load time.
- Host environment independence achieved via the `HttpClient` indirection (`src/http.ts`) instead of calling global `fetch` directly.
- Optional capabilities (opinion-text fetching, rate-limit awareness) are modeled as additional interfaces with runtime type-guard functions (`supportsOpinionText`, `supportsRateLimitAwareness`) rather than baked into the base contract — providers only implement what they can support.
- Credentials for enterprise providers are held in memory only (never persisted), enforced in `EnterpriseCitationProvider` (`src/providers/base.ts`).
- Reference data (reporter abbreviations, state abbreviations, case-name abbreviations) is vendored/generated at dev time from a pinned upstream tag, not fetched at runtime.

## Layers

- Purpose: Defines the exact surface consumers of this package can rely on.
- Location: `src/index.ts`
- Contains: Curated re-exports from `utils`, `providers`, `http`, `providers/base`, `providers/opinionTextExtractor`, `providers/pincitePages`, and all of `bluebook`.
- Depends on: All lower layers.
- Used by: Host integrations (Word/Docs/LibreOffice add-ins), consumed as `lib/index.js` after build.
- Purpose: Look up a parsed citation against an external legal-research source and return a URL/match, optionally opinion text.
- Location: `src/providers/`
- Contains: `types.ts` (contracts), `registry.ts` (plugin registry), `base.ts` (enterprise auth base class), one file per vendor (`courtListenerProvider.ts`, `lexisNexisProvider.ts`, `westlawProvider.ts`, `bloombergLawProvider.ts`, `usptoPatentCenterProvider.ts`), plus citation parsing/clustering (`citationParser.ts`), hallucination detection (`hallucinationCheck.ts`), opinion excerpt extraction (`opinionTextExtractor.ts`), and pincite page math (`pincitePages.ts`).
- Depends on: `src/http.ts` (transport), `src/utils.ts` (text helpers).
- Used by: `src/index.ts`; host add-ins drive lookups through `citationProviderRegistry`.
- Purpose: Validate a parsed citation's formatting against a specific edition of The Bluebook.
- Location: `src/bluebook/`
- Contains: `types.ts` (contracts: `BluebookRuleSet`, `BluebookIssue`), `registry.ts` (plugin registry), per-edition rule sets (`edition20th.ts`, `edition21st.ts`, `edition22nd.ts`), shared rule modules (`commonRules.ts`, `reporterRules.ts`, `courtRules.ts`, `pageRangeRules.ts`, `typefaceRules.ts`, `caseNameAbbreviations.ts`, `checkCaseNameAbbreviations.ts`, `manualCorrections.ts`), and `generated/` (vendored reference tables).
- Depends on: `src/providers/types.ts` (`ParsedCitation` shape).
- Used by: `src/index.ts`; host add-ins select an edition via `bluebookRuleSetRegistry` and call `checkCitation`.
- Purpose: Text normalization/HTML-safety helpers and the HTTP transport indirection used by both layers above.
- Location: `src/utils.ts`, `src/http.ts`
- Depends on: Nothing internal (leaf modules).
- Used by: Both `providers/` and `bluebook/` layers.

## Data Flow

### Citation lookup path

### Hallucination-check path

### Bluebook rule-checking path

- No global mutable application state beyond the two registries (`citationProviderRegistry`, `bluebookRuleSetRegistry`), which are populated once at module-load time via side-effecting imports.
- Enterprise provider credentials are held in-memory per provider instance (`this.credentials` in `EnterpriseCitationProvider`) and cleared via `signOut()`; never persisted to disk/localStorage.
- `HttpClient` is a single swappable module-level reference (`currentHttpClient` in `src/http.ts`), settable via `setHttpClient()` and restorable via `resetHttpClient()` (primarily for tests).

## Key Abstractions

- Purpose: Decouple "what providers/rule-sets exist" from "what code uses them" — consumers look up by id, never import vendor-specific classes directly.
- Examples: `src/providers/registry.ts` (`CitationProviderRegistry`), `src/bluebook/registry.ts` (`BluebookRuleSetRegistry`)
- Pattern: `Map<string, T>` with register/unregister/get/list; a singleton instance is exported and pre-populated with built-ins via a side-effecting import in the module's `index.ts`.
- Purpose: Let a provider optionally support extra behavior (opinion text, rate-limit awareness) without forcing every provider to implement stub methods.
- Examples: `OpinionTextCapableProvider`/`supportsOpinionText`, `RateLimitAwareProvider`/`supportsRateLimitAwareness` (`src/providers/types.ts`)
- Pattern: Extend the base interface, then export a `function supportsX(provider): provider is X` runtime guard using duck-typing (`typeof candidate.method === "function"`).
- Purpose: Centralize the credential-validation, in-memory-only storage, and HTTPS-enforcement logic shared by all contract-gated vendor providers.
- Examples: `EnterpriseCitationProvider` (`src/providers/base.ts`), extended by `lexisNexisProvider.ts`, `westlawProvider.ts`, `bloombergLawProvider.ts`, `usptoPatentCenterProvider.ts`
- Pattern: Abstract class implementing `CitationProvider`; subclasses only implement `verifyCredentials` and `lookupCitation`.
- Purpose: Make outbound HTTP swappable per host environment (e.g. Google Apps Script's synchronous `UrlFetchApp.fetch()` has no native `fetch`-shaped API).
- Examples: `src/http.ts`
- Pattern: Interface (`HttpClient`) + module-level default instance + `setHttpClient`/`getHttpClient`/`resetHttpClient` free functions.

## Entry Points

- Location: `src/index.ts` (built to `lib/index.js`, referenced by `package.json` `main`/`types`)
- Triggers: Import by a host add-in (Word/Docs/LibreOffice), or by tests in `tests/`
- Responsibilities: Curated re-export of the entire public API surface across utils, providers, http, and bluebook.
- Location: `src/providers/index.ts`
- Triggers: Evaluated on first import of `src/providers` (transitively via `src/index.ts`)
- Responsibilities: Instantiates and registers all five built-in `CitationProvider`s into `citationProviderRegistry`.
- Location: `src/bluebook/index.ts`
- Triggers: Evaluated on first import of `src/bluebook` (transitively via `src/index.ts`)
- Responsibilities: Instantiates and registers all three built-in `BluebookRuleSet` editions into `bluebookRuleSetRegistry`.
- Location: `scripts/generate-bluebook-data.js`
- Triggers: Manually run via `npm run bluebook:update-data`; never invoked at build or runtime.
- Responsibilities: Fetches reporters-db data at a pinned tag and regenerates `src/bluebook/generated/*.generated.ts`.

## Architectural Constraints

- **Threading:** Single-threaded, synchronous/async Node/browser-compatible TypeScript — no worker threads, no concurrency primitives beyond `Promise`/`async`.
- **Global state:** Two module-level singleton registries (`citationProviderRegistry` in `src/providers/registry.ts`, `bluebookRuleSetRegistry` in `src/bluebook/registry.ts`) and one module-level swappable client reference (`currentHttpClient` in `src/http.ts`). All three are intentional, documented seams, not incidental state.
- **Circular imports:** None observed — `bluebook/` depends one-way on `providers/types.ts` for `ParsedCitation`; `providers/` depends one-way on `http.ts` and `utils.ts`.
- **Platform-agnostic by design:** This package must not assume DOM/Node/browser-specific globals beyond `fetch` (itself abstracted via `HttpClient`). No file system, storage, or UI code belongs here — that lives in the separate host add-in repos.
- **No runtime network calls to fetch reference data:** All reporter/case-name/state abbreviation tables are pre-generated and committed (`src/bluebook/generated/`); only the dev-time script touches the network for this purpose.

## Anti-Patterns

### Calling global `fetch` directly from a provider

### Persisting provider credentials

## Error Handling

- `lookupCitation` must resolve to `null` (never throw) for "not found", "not authenticated", or "request failed" (see `CitationProvider.lookupCitation` doc in `src/providers/types.ts`).
- `checkCitation` on a `BluebookRuleSet` must never throw; an unrecognized citation simply yields no issues (`src/bluebook/types.ts`).
- `fetchOpinionExcerpt` must never throw; unavailability is reported via `excerpt: null` plus an optional `rateLimited: true` flag (`src/providers/types.ts`).
- Setup-time validation (`authenticate()` in `src/providers/base.ts`) throws descriptive `Error`s for missing fields or insecure (non-`https://`) base URLs — these are meant to surface to the user, not be silently swallowed.

## Cross-Cutting Concerns

<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
