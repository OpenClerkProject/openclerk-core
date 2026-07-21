# Westlaw / LexisNexis Integration Research

This is **session 2** of this research effort. Session 1 ran in a network-sandboxed
environment and could only produce search-snippet-level findings (no direct page
retrieval was possible), leaving six open questions about Thomson Reuters (Westlaw)
and LexisNexis API/auth shapes at "medium confidence." This session retrieves the
actual pages and records verbatim evidence so those open questions can be resolved
with citations rather than inference.

**Tooling note (read this before the raw findings below):** the plan for this session
assumed `WebFetch` and `mcp__Claude_Browser__*` (navigate / read_page / find / computer
/ read_network_requests) tools would be available, with WebFetch first and Browser-tool
fallback for client-rendered pages. In the actual execution environment for this run,
neither tool was present in the available tool set — only `Read`, `Write`, `Edit`,
`Bash`, `Grep`, `Glob`, and `Skill` were available. As a substitute, a Node.js
`fetch()`-based HTTP client (functionally equivalent to `curl`, invoked via `Bash`) was
used for every URL below, with HTML-to-text stripping applied to the response body.
This substitute **cannot execute client-side JavaScript**, so any page that renders its
content via a client-side SPA framework (React, Angular, etc.) instead of returning
server-rendered HTML is *unavoidably* blocked in this session — the raw HTML response is
an empty application shell with no textual content, regardless of retry. This
specifically affects the Thomson Reuters developer-portal API catalog
(`developers.thomsonreuters.com`) and the LexisNexis developer portal
(`dev.lexisnexis.com`), each flagged explicitly below. It also means the additional
"drive the Try-it/sandbox console" instruction for this session could not be executed
for any URL: no page whose *static* HTML this tool could retrieve exposed a
server-rendered interactive API console (the TR pages that were readable are
Drupal-rendered prose documentation, not Swagger/OpenAPI consoles), and the pages that
might plausibly host such a console (the TR and Lexis API catalogs) are exactly the
ones blocked by the client-side-rendering limitation above — so this session never got
far enough to even determine whether such a console exists on those pages, let alone
click through it. This is recorded as a tooling-availability limitation, not a
site-side block, and is called out again in the Caveats section of the final report.

## Executive Summary

Since the network-sandboxed prior session, this session directly retrieved 12 of the
16 target pages (the remaining 4 were blocked by client-side-rendering or an
authenticated-session wall — see Caveats). The most concrete new evidence is Thomson
Reuters' own documented OAuth2 client-credentials shape for its 3E API (auth URL and
API base URL are separate, contract-assigned values; the token request requires
`client_id`, `client_secret`, `grant_type=client_credentials`, **and `audience`**) —
this directly contradicts the current `EnterpriseCitationProvider`/
`fetchClientCredentialsToken` stub's assumption of a single base URL with an
`/oauth/token` suffix and no `audience` field. Two independent, currently-dated (2026)
law-library guides and two LexisNexis first-party support pages converged on the same
conclusion for both vendors' citation deep links: they are opaque, UI-generated
permalinks copied from a signed-in session, not a formula composable from a citation
string, and Lexis's own "Link to Cites" feature can resolve a single citation to
*multiple* candidate documents rather than one verified match. **Headline conclusion:
neither Westlaw nor LexisNexis looks buildable as a real (non-stub) provider from this
session's evidence alone.** The authoritative API catalogs for both vendors
(`developers.thomsonreuters.com`, `dev.lexisnexis.com`) are client-rendered
single-page applications this session's tooling could not execute, and the one
Westlaw-specific technical page in scope (`westlaw-us-dockets-api`) sits behind an
authenticated developer-portal session. Both providers should remain configurable
shells pending a design-partner firm's real credentials and a validated live endpoint;
nothing found in 16 sources suggests either vendor exposes a way to programmatically
verify a citation without a signed-in human, which is the safety-critical constraint
for `hallucinationCheck.ts`.

## Open Questions — Resolved

### 1. TR token request shape

**Status: CONFIRMED** (for the Thomson Reuters 3E API; not independently confirmed for
Westlaw-specific APIs, since the one Westlaw-specific auth page in scope was
portal-gated — see item 3 in the appendix).

Per appendix item 2, the token request is `POST <auth_url>` with
`Content-Type: application/x-www-form-urlencoded` and a body of
`client_id=<client_id>&client_secret=<client_secret>&grant_type=client_credentials&audience=<audience>`.
Both `<auth_url>` (the token endpoint) and `<base_url>` (the API base URL used for
subsequent calls) are **distinct values that Thomson Reuters assigns per customer
contract** — TR states "Thomson Reuters will provide the client id, client secret,
audience, and the authentication endpoint URL." The response contains an
`access_token` plus an expiration period (exact TTL not disclosed on this page).
Subsequent API calls use `Authorization: Bearer <access_token>`.

Answering the plan's specific question: **yes**, a redesigned
`EnterpriseCitationProvider` needs a separate `tokenUrl` (or `authUrl`) credential
field distinct from the API base URL, and a separate `audience` field — both are
confirmed-real, not guessed, at least for this TR product family.

### 2. TR tenancy

**Status: CONFIRMED** (for the 3E API pattern) **/ STILL UNRESOLVED, portal-gated**
(for Westlaw-specific APIs).

Per appendix item 2, TR explicitly assigns both the auth endpoint URL and the API base
URL per customer/contract rather than publishing one fixed global host — this is a
per-tenant (per-customer) tenancy model, not a single shared global URL. Whether
Westlaw's specific content APIs (e.g. the dockets API) follow the identical per-tenant
pattern could not be independently confirmed, because appendix item 3
(`westlaw-us-dockets-api`) redirected into an authenticated TR SSO login wall this
session did not attempt to bypass, per the plan's explicit constraint.

### 3. Does ANY TR API return a case document or verify a case by citation?

**Status: STILL UNRESOLVED, portal-gated.**

The plan asked for a full enumerated catalog list from `developers.thomsonreuters.com`
(appendix items 4a/4b/4c). None of the three catalog URLs returned server-rendered
content in this session — all three are the identical shell of a client-side-routed
React application (Webpack Module Federation), and this session's tooling cannot
execute client-side JavaScript to render the catalog listing. **No full enumerated
catalog list could be produced**, so this question cannot be given a definitive
yes/no per the plan's own bar for evidence.

Circumstantial evidence from the pages that *were* readable leans toward "no, not
found in this session's readable subset": appendix item 1's "Collaborate" API is a
HighQ collaboration/workflow product; appendix item 2's 3E API is a practice-management
(matter) API; appendix item 5's marketing page names no case-law-by-citation or KeyCite
capability. None of these three retrievable products is a case-law-by-citation or
verification API. But because the authoritative catalog itself was unreachable, this
is reported as STILL UNRESOLVED (portal-gated by this session's tooling, not by TR's
access controls) rather than a confirmed "no."

### 4. Lexis auth shape

**Status: STILL UNRESOLVED, portal-gated** (exact token host/path/grant type) **;
REFUTED** (a documented case-law-by-citation API existing among the *named* Lexis API
catalog).

`dev.lexisnexis.com/gettingStarted` (appendix item 6) — the actual technical
getting-started document that would state the exact token host/path and grant
type — is a client-rendered Angular application; its server response contains no
route content, so the token host/path/grant type **could not be confirmed** in this
session. The `lexis-api.page` marketing page (appendix item 7) only confirms "OAuth
2.0 authentication" generically, and only explicitly for the Protégé API; it gives no
host, path, or grant-type detail.

On the second half of the question — whether case-law content is reachable via any
*documented* API — the full named catalog on that marketing page (CourtLink API =
dockets/litigation monitoring, Lex Machina API = litigation analytics, State Net API =
legislation/regulatory data, Content API/Law360/MLex = news, and a vaguely-described
generic "REST APIs" bucket for "Search and retrieve legal and news content") **names no
API that retrieves full case-law text or metadata by a citation string, and none named
as a Shepard's API.** This is a REFUTED finding for the *named, documented* catalog as
retrieved — though it cannot rule out an undocumented capability, since the actual API
reference (behind `dev.lexisnexis.com`) was unreachable.

### 5. Deep-link get-by-citation

**Status: REFUTED** (as the plan's stated expectation for Westlaw's
`find/default.wl?cite=` being the current, primary mechanism) **— with one important
gap: STILL UNRESOLVED for the single source most likely to contain the classic
query-string template** (appendix item 11, the federal CM/ECF hyperlinking PDF, which
was retrieved but not text-extractable in this session — see Caveats).

Four independent sources converge on the same picture for what current guidance
actually documents: appendix items 10a and 10b (Lexis's own "Link to Cites" feature
documentation) describe a **UI-driven** conversion inside a licensed Word add-in, not a
publicly composable URL formula, and require an active Lexis/Lexis+ login. Appendix
items 12a and 12b — two currently-dated (2026) academic law-library guides — describe
**both** vendors' permalink creation as: navigate to the document in the vendor's own
web interface, click a "link"/"hyperlink" icon, click "Copy Link" (Westlaw) or "Copy
Citation" → "Copy citation as hyperlink" (Lexis Advance), and paste the resulting
opaque URL. **No source retrieved in this session shows a `cite=`-style query-string
template for either vendor as current, public guidance.** This refutes the plan's
stated expectation that `find/default.wl?cite=` is confirmed still-current — but
because appendix item 11 (the one source that could plausibly still document that
legacy query-string format, used in real federal court filings) could not be
text-extracted in this session, the historical/legacy format's continued existence is
**neither confirmed nor refuted**, only absent from the four *current* consumer-facing
sources this session could read.

Separately, appendix item 9 (the wiki page reportedly documenting the Lexis URL API
spec) no longer exists at its original address and redirects to an unrelated marketing
page — so the prior session's specific claim about that spec's contents could not be
independently checked either way.

### 6. Verification vs. linking

**Status: REFUTED** — nothing found in any of the 16 sources lets a deep link or API
call distinguish a real citation from a fabricated one programmatically, without a
signed-in human.

Every citation-linking mechanism found in this session is either (a) gated behind an
authenticated, licensed human session, or (b) explicitly non-unique. Appendix item 10b
states verbatim that Lexis's own "Link to Cites" feature requires "a valid Lexis or
Lexis+ ID and password" as a hard prerequisite, and that "Table cases retrieve a list
of documents sharing the citation instead of opening a single document" — i.e., even
Lexis's first-party citation resolution can be one-to-many, not a confident single
verified match. Appendix item 12b states verbatim that both Westlaw's and Lexis's
generated permalinks "will direct users to a log-in screen, and once logged in will
re-direct to the selected resource" — confirming neither resolves anonymously. No
source named an API or URL pattern framed as "verify this citation is genuine"; the
closest capabilities found (CourtLink dockets, Lex Machina analytics, State Net
legislation, TR's 3E matter API) are all unrelated to case-law verification by
citation. **This directly confirms the load-bearing safety conclusion:
`hallucinationCheck.ts` must continue relying on CourtListener (or another
verification-capable provider) and must never treat a Westlaw/Lexis lookup result as a
verification signal** — see the Redesign Proposal and Providers sections below for how
to enforce this structurally, not just by convention.

## Redesign Proposal: EnterpriseCitationProvider / fetchClientCredentialsToken

This is a spec-only proposal — no code changes are made or implied by this research
plan.

**Current shape (confirmed from reading `src/providers/base.ts`,
`src/providers/westlawProvider.ts`, `src/providers/lexisNexisProvider.ts` as of this
session):** `EnterpriseCitationProvider.authenticate()` takes a flat
`Record<string, string>` whose only required field enforced at the base-class level is
`apiBaseUrl` (validated for an `https://` prefix). Both `WestlawProvider` and
`LexisNexisProvider` derive their token URL by string-concatenating a hardcoded
`TOKEN_PATH = "/oauth/token"` onto that same `apiBaseUrl`, and `authenticate()`
collects only `apiBaseUrl`, `clientId`, `clientSecret` as credential fields. There is
no `audience` field anywhere in the current implementation, and the token URL is never
a value the user supplies directly — it's always `apiBaseUrl + "/oauth/token"`.

**What this session's evidence says is wrong about that shape (for Thomson Reuters, at
least):** per appendix item 2, TR does not describe appending a fixed `/oauth/token`
suffix to the API base URL — it explicitly states the authentication endpoint URL is a
wholly separate value TR provides, independent of the base URL used for subsequent API
calls. And the token request body TR documents requires an `audience` parameter the
current implementation never sends at all.

**Proposed field set** (superset covering both vendors, since Lexis's exact shape
could not be confirmed this session — see Open Question 4):

- `apiBaseUrl` (existing) — base URL for content/search API calls, HTTPS-only,
  contract-assigned per customer.
- `tokenUrl` (**new**, required for TR at minimum) — the OAuth2 token endpoint,
  entered as a separate value from `apiBaseUrl` rather than derived by string
  concatenation, since TR's own documentation treats it as an independently-assigned
  value.
- `audience` (**new**, required for TR per appendix item 2's documented request body;
  unconfirmed whether Lexis requires it — treat as optional-but-supported so a Lexis
  design partner can supply it if their contract requires one) — passed as an
  `audience=<audience>` body parameter alongside `client_id`/`client_secret`/
  `grant_type=client_credentials`.
- `scope` (**new**, optional) — not confirmed as required by either vendor in this
  session's evidence, but common enough in OAuth2 client-credentials deployments that
  a design-partner firm may need to supply one; should be an optional field rather
  than assumed absent.
- `clientId` / `clientSecret` (existing) — unchanged.

**Proposed request shape change to `fetchClientCredentialsToken`:** accept the
`audience` (and optionally `scope`) as additional parameters (or as an options object)
and include them in the `URLSearchParams` body only when the caller supplies them —
so CourtListener-style providers that never call this function are unaffected, and TR
subclasses can pass `audience` explicitly rather than the function silently omitting a
parameter the vendor's own documentation says is required. The `Content-Type:
application/x-www-form-urlencoded` header and `grant_type: client_credentials` body
value are unchanged — both are confirmed correct by appendix item 2's verbatim curl
example.

**Explicitly flagged as now-known-wrong:** the current `WestlawProvider`/
`LexisNexisProvider` pattern of deriving the token URL as
`trimTrailingSlash(apiBaseUrl) + "/oauth/token"` (see `TOKEN_PATH` in both provider
files) does not match Thomson Reuters' own documented behavior, where the token
endpoint is a TR-assigned value independent of the API base URL, and omits the
`audience` parameter TR's own sample curl request includes.

## Providers: Ready Now vs. Configurable Shells

**CourtListener — ready now.** Unaffected by this research; already a working,
non-stub implementation using CourtListener's public API. No change proposed.

**Westlaw — configurable shell, not ready.** Even the auth mechanics could only be
partially corroborated, and only via an *unrelated* TR product (3E, a practice-
management API, not Westlaw). The two sources that would confirm or refute
Westlaw-specific behavior — the authoritative API catalog
(`developers.thomsonreuters.com`) and the named `westlaw-us-dockets-api` documentation
page — were both unreachable in this session (client-side-rendering and an
authenticated-session wall, respectively). Must remain a configurable shell until a
design-partner firm supplies real TR credentials and their firm-specific integration
documentation, or until a future research session can authenticate into the TR
developer portal to read the gated pages directly.

**LexisNexis — configurable shell, not ready.** The actual API reference
(`dev.lexisnexis.com`) is a client-rendered application this session could not
execute, and no source found names a get-by-citation or verify-by-citation endpoint
among the publicly documented catalog (CourtLink, Lex Machina, State Net, Content
API/Law360/MLex, Protégé). Must remain a configurable shell for the same reasons as
Westlaw.

**The link-only / never-verifies structural boundary.** Regardless of how the auth
shape above is eventually corrected, this session's evidence (Open Question 6) shows
neither vendor is safe to ever treat as a hallucination-check verification signal — and
`src/providers/hallucinationCheck.ts` as currently written has no structural barrier
against that happening: `checkCitationsForHallucinations` accepts a flat
`CitationProvider[]` array and will set `verifiedVia` to *any* provider in that list
whose `lookupCitation()` returns a non-null match with a matching case name, regardless
of whether that provider is CourtListener or a future, more fully-implemented
`WestlawProvider`. The existing `OpinionTextCapableProvider`/`supportsOpinionText`
pattern in `src/providers/types.ts` (a separate, optional interface plus a runtime
`is`-guard function, already used to mark LexisNexis/Westlaw/Bloomberg Law as
"hyperlink-only" for opinion-text purposes per that file's own comment) is a precedent
for the fix: introduce an equivalent capability tag — e.g. a `LinkOnlyProvider`
interface (or a `verificationCapable: boolean` flag on `CitationProvider` itself) that
`checkCitationsForHallucinations` checks *before* ever assigning `verifiedVia`, so a
provider explicitly marked link-only is structurally prevented from producing a
`verifiedVia` result no matter what its `lookupCitation()` returns. This turns "must
never treat a Westlaw/Lexis link as verification" from a convention documented only in
comments into something the type system and a runtime guard both enforce.

## Caveats: Portal-Gated or Unobtainable

Of the 16 URLs targeted across Tasks 1 and 2, the following could not be retrieved (or
could be retrieved but not read) even after this session's available fetch tooling was
applied:

1. **`https://developerportal.thomsonreuters.com/westlaw-us-dockets-api`** (appendix
   item 3) — redirected to `https://auth.thomsonreuters.com/u/login/identifier?state=...`
   returning HTTP 400 with body text: "Authentication Error — Oops! Something went
   wrong... TECHNICAL DETAILS: invalid_request. You may have pressed the back button,
   refreshed during login, opened too many login dialogs, or there is some issue with
   cookies, since we couldn't find your session." Requires an authenticated TR
   developer-portal SSO session.
2. **`https://developers.thomsonreuters.com/`** (appendix item 4a) — client-rendered
   SPA shell. Full raw response body: `<!doctype html><script>...pendo analytics
   loader...</script><html>...<title>Thomson Reuters Developer Portal</title><script
   defer src="https://developers.thomsonreuters.com/main.js"></script><script defer
   src="https://developers.thomsonreuters.com/remoteEntry.js"></script></head><body><div
   id="app"></div></body></html>` — no server-rendered content; requires JS execution
   this session's tooling does not support.
3. **`https://developers.thomsonreuters.com/pages/api-catalog/4EB79538-7677-4AF8-AC32-F73B26DBD473`**
   (appendix item 4b) — identical SPA-shell response to item 4a.
4. **`https://developers.thomsonreuters.com/pages/api-catalog/5A0B2E6E-DE81-42E6-9431-D78B8B4F0D35`**
   (appendix item 4c) — identical SPA-shell response to item 4a.
5. **`https://dev.lexisnexis.com/gettingStarted`** (appendix item 6) — client-rendered
   Angular SPA shell (`<html lang="en" data-critters-container>`, `<title>Developer
   Portal</title>`, no route content in the server response). Requires JS execution
   this session's tooling does not support.
6. **`https://www.lexisnexis.com/webserviceskit/v2_0beta/text/WSK-Welcome.htm`**
   (appendix item 8) — HTTP 404. Verbatim body: "page-not-found... Unfortunately we
   can't find the page you're looking for." This documentation resource has been
   retired.
7. **`https://www.lexisnexis.com/communities/academic/w/wiki/111.url-api-specifications.aspx`**
   (appendix item 9) — no error, but the URL silently redirects to an unrelated page
   (`https://www.lexisnexis.com/en-us/products/nexis-uni.page`, a Nexis Uni marketing
   page with HTTP 200). The original wiki content is gone; nothing about a URL API
   specification was found at the redirected destination.
8. **`https://www.ned.uscourts.gov/internetDocs/cmecf/AttorneyGuide-Hyperlinking.pdf`**
   (appendix item 11) — this one is **not** a portal/auth block: the file was fully
   retrieved (HTTP 200, `Content-Type: application/pdf`, 2,249,655 bytes, a complete
   and valid PDF). It could not be **read** in this session because the local
   PDF-rendering tool returned the exact error `pdftoppm is not installed. Install
   poppler-utils (e.g. brew install poppler or apt-get install poppler-utils) to
   enable PDF page rendering.`, no `python3` was available as a scripting fallback,
   and a raw-byte scan for uncompressed readable text found no matches for `cite=`,
   `findType`, `westlaw`, or `lexis` (consistent with compressed PDF content streams).

**On the "Try it" console instruction:** per the tooling note at the top of this file,
this session's environment did not include the `mcp__Claude_Browser__*` tools the
additional retrieval instruction specified for driving interactive API consoles. None
of the pages this session *could* read (Drupal-rendered TR documentation, static
marketing pages, static library guides) exposed a server-rendered "Try it"/Swagger-
style console in their static HTML. The pages that plausibly *would* host such
consoles — the TR and Lexis API catalogs (items 2, 3, and 5 above) — are exactly the
ones blocked by the client-side-rendering limitation, so this session could not
determine whether a Try-it console exists on them, let alone drive one. This is
recorded as a tooling-availability gap for a future session with working
browser-automation tooling to close, not as a deliberate skip of the instruction.

## Appendix: Raw Source Evidence

The sections below are the traceability record for every claim made above — each
subsection quotes the exact URL fetched, the fetch method, the raw result, and
verbatim excerpts.

## Thomson Reuters / Westlaw — Raw Findings

### 1. Authentication (Collaborate/HighQ) — https://developerportal.thomsonreuters.com/authentication

**Fetch method:** HTTP fetch (WebFetch/Browser tools unavailable in this session — see tooling note above).
**Result:** Retrieved — verbatim excerpt below.
**Verbatim technical detail:**
- Breadcrumb on the page: "Home > Legal > HighQ > Authentication" — this page is scoped to the **Collaborate** product (HighQ), not a general Thomson Reuters auth doc, not Westlaw-specific.
- Body text: "Collaborate API requires Authentication to access the API endpoints. HighQ has adopted OAuth2 as its authentication standard. This section explains how to authenticate with Collaborate API's and addresses authentication related issues."
- The page itself contains no token endpoint host/path, no TTL, and no header-format detail in its visible body — it is a landing/overview page that links out to sub-articles ("API Access Mechanism using OAuth2", "Managing token expiration", "OAuth for desktop Applications (Automating OAuth)", "OAuth2 Libraries", "What to use for redirect_uri parameter") which were not individually fetched (out of scope for the plan's URL list).
**Relevant open question(s):** Q1 (TR token request shape) — only confirms OAuth2 is the stated standard for the *Collaborate* product; does not itself supply the exact request shape. Q3 (does any TR API return case content) — confirms this page's product (Collaborate/HighQ) is a collaboration tool, not case-law retrieval.

### 2. 3E API — 02 API Authentication and Access — https://developerportal.thomsonreuters.com/3e-api/getting_started/02---api-authentication-and-access

**Fetch method:** HTTP fetch.
**Result:** Retrieved — verbatim excerpt below.
**Verbatim technical detail:**
- "All endpoints require authentication. 3E APIs use OAuth 2.0 and client credentials flow. Contact Thomson Reuters Support to gain access to your 3E APIs. Thomson Reuters Support will provide the client credentials needed to access your APIs."
- "To create a new token, send a POST request to the Thomson Reuters authentication endpoint. Thomson Reuters will provide the client id, client secret, audience, and the authentication endpoint URL." — i.e., the **auth endpoint URL itself is not a fixed/public host**; it is supplied per-customer/per-contract by TR, along with client_id/client_secret/**audience**.
- Verbatim sample curl request quoted on the page:
  ```
  curl --request POST <auth_url> \
  --header 'content-type: application/x-www-form-urlencoded' \
  --data "client_id=<client_id>&client_secret=<client_secret>&grant_type=client_credentials&audience=<audience>"
  ```
- "The response will include an access token along with an expiration period which can be passed to subsequent API requests and can be used until the token expires." (exact TTL value not stated on this page)
- "The access token retrieved in the previous step must be passed in the Authorization header of all requests." Verbatim sample:
  ```
  curl --request GET <base_url>/3eapi/api/v1/matter?MattIndex=1 \
  --header "Authorization: Bearer <access_token>"
  ```
  — confirms the **API base URL is a separate value from the auth URL**, and confirms the `Authorization: Bearer <token>` header format.
- "All 3E APIs are run under the context of the Integration user and respect process-level security... to call `/api/v1/Matter` endpoint, the Integration user must have access to the Matter Maintenance process."
- 3E is a practice-management/matter system (Elite 3E), not a case-law or Westlaw legal-research product — this page corroborates TR's OAuth2 client-credentials shape generally but is not itself Westlaw-specific evidence.
**Relevant open question(s):** Q1 (confirms `audience` is a real required field, confirms `client_id`/`client_secret`/`grant_type=client_credentials` body shape, confirms `application/x-www-form-urlencoded` content-type, confirms `Authorization: Bearer` header, confirms auth URL is distinct from API base URL). Q2 (TR tenancy — implies both the auth endpoint URL and the API base URL are contract-specific/assigned, not fixed global hosts, at least for 3E). Q3 (confirms 3E is a matter/practice-management API, not case-law retrieval).

### 3. Westlaw US Dockets API — https://developerportal.thomsonreuters.com/westlaw-us-dockets-api

**Fetch method:** HTTP fetch.
**Result:** Blocked or error — exact error text quoted verbatim below.
- The request redirected (HTTP 400 at the final hop) to: `https://auth.thomsonreuters.com/u/login/identifier?state=hKFo2SBlYy0wRXRYQ0VMcGV0eEpwYUJsVl9uOGg0cFRhcEt0dKFur3VuaXZlcnNhbC1sb2dpbqN0aWTZIENyRlZCUUJaWW96ZGI4bnJrN0JBUjdJcHBPQ2cxTTNMo2NpZNkgeGx6SGJHaTdyeG9rc242b0FxdjllZDU0ZDlYZkNXdU4`
- Exact page body text: "Authentication Error — Oops! Something went wrong. There could be a misconfiguration in the system or a service outage... TECHNICAL DETAILS: invalid_request. You may have pressed the back button, refreshed during login, opened too many login dialogs, or there is some issue with cookies, since we couldn't find your session. Try logging in again from the application and if the problem persists please contact the administrator."
- This page is gated behind the TR developer portal's Auth0-based SSO login. No content about this specific Westlaw API (base URL, request path, query/body params, response shape, rate limits, CORS) could be retrieved — the auth wall was not bypassed, per the plan's explicit constraint.
**Relevant open question(s):** Q2 (STILL UNRESOLVED, portal-gated), Q3 (STILL UNRESOLVED for this specific named Westlaw API, portal-gated).

### 4a. Thomson Reuters Developer Portal (home) — https://developers.thomsonreuters.com/

**Fetch method:** HTTP fetch (attempted; no Browser-tool fallback available in this session).
**Result:** Blocked — client-rendered SPA shell, no textual content in the server response.
**Verbatim technical detail:** Raw HTML response body in full (1057 bytes total):
  ```html
  <!doctype html><script>(function(apiKey){ ... pendo analytics loader ... })('889c3606-6c15-4229-56b7-07d9ffd9ff52');</script><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><link rel="icon" href="https://www.thomsonreuters.com/favicon.ico"/><title>Thomson Reuters Developer Portal</title><script defer="defer" src="https://developers.thomsonreuters.com/main.js"></script><script defer="defer" src="https://developers.thomsonreuters.com/remoteEntry.js"></script></head><body><div id="app"></div></body></html>
  ```
  This confirms the page is a React application using Webpack Module Federation (`main.js` + `remoteEntry.js` loaded into an empty `<div id="app">`); all catalog content is rendered client-side after JS executes. Per the tooling note above, this session's fetch tool cannot execute this JS, so no catalog listing could be enumerated. (As due diligence, `main.js` itself was also fetched — 7,829 bytes, but it is a minified loader stub, not the application bundle containing the actual catalog data or API endpoint it calls; further reverse-engineering of minified bundles was judged out of scope for a documentation-reading task.)
**Relevant open question(s):** Q3 (STILL UNRESOLVED, portal-gated by client-side rendering, not by auth).

### 4b. API Catalog item 4EB79538-7677-4AF8-AC32-F73B26DBD473 — https://developers.thomsonreuters.com/pages/api-catalog/4EB79538-7677-4AF8-AC32-F73B26DBD473

**Fetch method:** HTTP fetch.
**Result:** Blocked — identical client-rendered SPA shell as 4a (same 1057-byte response body, same `main.js`/`remoteEntry.js` loader, empty `<div id="app">`). This is a client-side-routed page within the same single-page application; the server returns the identical shell for every route.
**Verbatim technical detail:** Same raw HTML as quoted in 4a.
**Relevant open question(s):** Q3 (STILL UNRESOLVED, portal-gated by client-side rendering).

### 4c. API Catalog item 5A0B2E6E-DE81-42E6-9431-D78B8B4F0D35 — https://developers.thomsonreuters.com/pages/api-catalog/5A0B2E6E-DE81-42E6-9431-D78B8B4F0D35

**Fetch method:** HTTP fetch.
**Result:** Blocked — identical client-rendered SPA shell as 4a/4b (same 1057-byte response).
**Verbatim technical detail:** Same raw HTML as quoted in 4a.
**Relevant open question(s):** Q3 (STILL UNRESOLVED, portal-gated by client-side rendering).

**Task 1 note on item 4 (a/b/c):** the plan asked to "enumerate every legal/Westlaw-named API you can find in the catalog listing, by exact name" from these three pages. This could **not** be done — none of the three URLs returned any server-rendered catalog text in this session; all three are the same client-side-routed React application shell. This is recorded as STILL UNRESOLVED / portal-gated (by tooling, not by TR's own access controls) rather than guessed.

### 5. Legal API (Thomson Reuters marketing) — https://legal.thomsonreuters.com/en/products/legal-api

**Fetch method:** HTTP fetch.
**Result:** Retrieved — but the requested URL redirects. Final URL after redirect: `https://legal.thomsonreuters.com/en/westlaw` (a general Westlaw marketing/product page). The original `/en/products/legal-api` path no longer resolves to a standalone "legal API" product page — it is redirected into the general Westlaw landing page.
**Verbatim technical detail:** The only API-related content found on the resulting Westlaw landing page (two occurrences):
- "Access comprehensive APIs and developer tools that enable seamless integration with Thomson Reuters platforms."
- "API catalog — Explore a comprehensive API catalog with detailed documentation to integrate Thomson Reuters data and services." (this links back to `developers.thomsonreuters.com`, the SPA-shell catalog blocked in item 4)
- No case-law-by-citation capability, KeyCite, or citation-verification capability is named anywhere on this page.
**Relevant open question(s):** Q3 (no case-law-by-citation capability named here; but this is marketing copy, not the authoritative catalog, so this alone is not dispositive — see item 4's STILL UNRESOLVED status for the authoritative source).

## LexisNexis — Raw Findings

### 6. LexisNexis Developer Portal — Getting Started — https://dev.lexisnexis.com/gettingStarted

**Fetch method:** HTTP fetch (WebFetch/Browser tools unavailable in this session — see tooling note at top of file).
**Result:** Blocked — client-rendered SPA shell, no textual content in the server response.
**Verbatim technical detail:** Raw HTML response (13,807 bytes) is an Angular application shell: `<html lang="en" data-critters-container>` with `<title>Developer Portal</title>`, inlined critical CSS (Angular CLI "critters" tooling marker), and no server-rendered route content for `/gettingStarted` — the actual getting-started text (auth model, hostnames like `auth-api.lexisnexis.com`/`services-api.lexisnexis.com`, token path, access-request process) is rendered client-side after JS executes and could not be retrieved by this session's non-JS HTTP fetch tool.
**Relevant open question(s):** Q4 (STILL UNRESOLVED, portal-gated by client-side rendering, not by auth).

### 7. Lexis APIs (marketing/catalog) — https://www.lexisnexis.com/en-us/products/lexis-api.page

**Fetch method:** HTTP fetch.
**Result:** Retrieved — verbatim excerpt below.
**Verbatim technical detail:**
- Named REST API catalog, quoted verbatim:
  - "**CourtLink API** — Connect real-time court docket and litigation monitoring data directly within your systems and workflows. The CourtLink API delivers federal and state court filings, docket updates, case tracking information, and litigation activity data..."
  - "**Lex Machina API** — Integrate Lex Machina® Legal Analytics® directly into your systems and workflows. The Lex Machina API delivers comprehensive litigation analytics and outcome insights across civil cases nationwide..."
  - "**State Net API** — Access detailed data including legislation, regulations, agency documents, local ordinances, executive orders, and ballot measures..."
  - "**Content API Coming Soon!** — Law360 API ... MLex API—Coming Soon! ..." (both marked not-yet-available)
  - A generic "REST APIs" bucket described only as: "Search and retrieve legal and news content, setup alerts for new content" — no specific endpoint, parameter, or content-type detail given.
  - "**LexisNexis Protégé™ API — NEW!** Programmatic access to generative AI features and tasks... Grounded in LexisNexis content, secure endpoints expose Protégé's core 'Ask' and 'Summarize' functionality, returning authoritative answers and citations drawn from LexisNexis Primary Law, Secondary Materials, Practical Guidance, and more." Auth: "OAuth 2.0 authentication, role-based access controls, firm-wide throttling, and audit logging."
  - Access process, quoted verbatim from the FAQ: "How do I get access to Lexis APIs? You can request access through the form on this page. Once approved, your team will receive credentials and onboarding details for the LexisNexis Developer Portal, where you can explore documentation and test endpoints in a sandbox environment." — confirms a sandbox exists, but confirms it lives behind the same `dev.lexisnexis.com` portal that was unreachable in item 6, and is access-gated (approval required), not a public "Try it" console reachable from this marketing page.
- No API in this list is named or described as retrieving full case-law text/metadata by a citation string, and none is named as a Shepard's API.
**Relevant open question(s):** Q4 (confirms OAuth 2.0 is used at least for Protégé; no exact host/path/grant-type given on this marketing page). Q3/Q6-adjacent (no case-law-by-citation or Shepard's API named among the catalog).

### 8. Web Services Kit v2.0beta Welcome — https://www.lexisnexis.com/webserviceskit/v2_0beta/text/WSK-Welcome.htm

**Fetch method:** HTTP fetch.
**Result:** Blocked or error — exact error text quoted verbatim below.
- HTTP 404. Verbatim page text: "page-not-found ... Unfortunately we can't find the page you're looking for. Please try searching or browsing the content below: Home / Product Index / Sign In / Contact Us / Lexis+® / Lexis Analytics® / Nexis® / Law Books"
- This legacy documentation resource has been retired/removed from lexisnexis.com; no content about the Web Services Kit's operations, content scope, or auth mechanism could be retrieved from this URL.
**Relevant open question(s):** Q4 (STILL UNRESOLVED for WSK specifically — resource no longer exists at this address; cannot confirm or refute the prior session's "news/Nexis-text-mining focus" claim from this source).

### 9. URL API Specifications (LexisNexis Academic community wiki) — https://www.lexisnexis.com/communities/academic/w/wiki/111.url-api-specifications.aspx

**Fetch method:** HTTP fetch.
**Result:** Retrieved — but the requested URL silently redirects to unrelated content. Final URL after redirect: `https://www.lexisnexis.com/en-us/products/nexis-uni.page` (a Nexis Uni academic-database marketing page, HTTP 200).
**Verbatim technical detail:** The resulting page is entirely about "Nexis Uni" (a student research database product) — "Give students and faculty across disciplines access to a vast, ungated universe of news, legal, and business sources from LexisNexis, including The New York Times, Forbes, Hoover's & Shepard's." It contains no URL API specification, no deep-link/permalink URL format, and no get-by-citation URL form. The original LexisNexis Academic community wiki (a separate site structure entirely — `/communities/academic/w/wiki/...`) appears to have been retired/decommissioned; the URL now falls through to a generic marketing redirect rather than a 404.
**Relevant open question(s):** Q5 (STILL UNRESOLVED from this specific source — the wiki page that reportedly documented the Lexis URL API spec no longer exists publicly; cannot confirm or refute the prior session's "opaque permalink IDs only, no get-by-citation form" claim from this source specifically. See items 10a/10b/12b below for corroborating evidence from other sources.)

### 10a. Link to Cites (LexisNexis Help) — https://help.lexisnexis.com/tabula-rasa/lmola/linktolacites_hdi-task?audience=litigation,transactional,pdf,pin-events,doctools,v4.2&lbu=US&locale=en_US

**Fetch method:** HTTP fetch.
**Result:** Retrieved — verbatim excerpt below.
**Verbatim technical detail:**
- Title: "How do I link citations in my document to documents on Lexis Advance®?"
- "Note: The options described below are available in Lexis® for Microsoft Office® version 4.4 and later. Please contact your sales representative if you are interested in upgrading your license to this version. You can permanently link citations in the document you are drafting to their associated documents on Lexis Advance®. Readers of the document (in electronic format) can click the link to view the associated case. (Standard subscription rules and rates apply.)"
- Steps: "View the LexisNexis® ribbon. Click the Link to Cites button. The document is analyzed and citations that can be linked to content on Lexis Advance are converted to hyperlinks."
- This is a **desktop Word add-in feature**, not a public API — it operates only inside "Lexis for Microsoft Office," a separately licensed product, and requires an active Lexis Advance subscription behind it.
**Relevant open question(s):** Q5 (this is a UI-driven citation-to-link conversion inside a licensed plugin — not a publicly documented URL-construction formula). Q6 (link generation happens inside an authenticated, licensed desktop tool, not a public/anonymous API or URL pattern).

### 10b. Link to Cites in Lexis for Microsoft Office (Support Center answer) — https://supportcenter.lexisnexis.com/app/answers/answer_view/a_id/1089519/

**Fetch method:** HTTP fetch.
**Result:** Retrieved — verbatim excerpt below.
**Verbatim technical detail:**
- "This guide explains how to use the Link to Cites feature in Lexis® for Microsoft® Office to create hyperlinks between citations in your Word document and full text documents on the Lexis® or Lexis+® service."
- Prerequisites, quoted verbatim: "Lexis for Microsoft Office installed on Office Desktop for Windows, Office 365, Word 2016, or Mac. **A valid Lexis or Lexis+ ID and password.** Microsoft Word. Access to the LexisNexis ribbon in Word." — confirms an authenticated, licensed session is a hard prerequisite.
- "The feature creates links for cases, agency decisions, statutes, and regulations."
- Load-bearing finding on ambiguity, quoted verbatim: "**Table cases retrieve a list of documents sharing the citation instead of opening a single document.**" — i.e., even Lexis's own first-party citation-linking feature does not guarantee a 1:1 citation-to-document resolution; some citations resolve to a *list* of candidate documents, not a single verified match.
- "The Shepard's® Signal indicator reflects the status at the moment links are created and must be refreshed by rerunning Link to Cites or Get Cited Docs." — Shepard's status is a point-in-time annotation attached by the licensed plugin, not something retrievable via an anonymous API call.
**Relevant open question(s):** Q6 (directly load-bearing: Lexis's own citation-linking mechanism is (a) gated behind a valid Lexis/Lexis+ login, and (b) can resolve a single citation string to *multiple* candidate documents rather than a single verified match — both facts argue against ever treating a Lexis link as a verification signal).

## Deep-Link Formats & Neutral Court Guides — Raw Findings

### 11. CM/ECF Attorney Guide — Hyperlinking to Westlaw/Lexis Citations (D. Neb.) — https://www.ned.uscourts.gov/internetDocs/cmecf/AttorneyGuide-Hyperlinking.pdf

**Fetch method:** HTTP fetch, then local file read (PDF binary saved to disk and passed to the file-reading tool).
**Result:** Retrieved the file successfully (HTTP 200, `Content-Type: application/pdf`, 2,249,655 bytes — confirmed a real, complete PDF) but **could not extract its text in this session**. This is a distinct outcome from a portal/auth block: the URL itself is fully public and returned the complete document. The blocker is local tooling: the file-reading tool's PDF pipeline requires `pdftoppm` (from `poppler-utils`), which returned `pdftoppm is not installed`; there is no `python3` available in this environment for a script-based PDF-text fallback; and a raw-byte scan for readable ASCII runs of 15+ characters (290 runs found) contained zero matches for `cite=`, `findType`, `find/default`, `Link/Document`, `westlaw`, or `lexis` — consistent with the PDF's text living inside compressed (FlateDecode) content streams that require an actual PDF parser to decode, not a viewer/rendering limitation.
**Verbatim technical detail:** None obtainable this session. The specific claims this source was meant to confirm or refute — verbatim URL templates such as `find/default.wl?cite=` and `Link/Document/FullText?findType=Y&cite=` used in real federal CM/ECF filings — are **neither confirmed nor refuted** by this session; they stand exactly as the prior (search-snippet-level) session left them.
**Relevant open question(s):** Q5 (STILL UNRESOLVED — retrieved but not text-extractable in this session; this is the single source most likely to contain the definitive answer and could not be read).

### 12a. Westlaw — Creating Permanent Links (University at Buffalo Libraries) — https://research.lib.buffalo.edu/creating-permanent-links/westlaw

**Fetch method:** HTTP fetch.
**Result:** Retrieved — verbatim excerpt below. Page states "Last Updated: Jul 8, 2026" — current as of this research.
**Verbatim technical detail:**
- "To create a link to a page in Westlaw: 1. Look for the link icon at the top of the page. 2. Click on the 'link' icon to copy link. 3. Click on 'COPY' in the window that opens. 4. A message should appear: 'The link has been copied successfully.' 5. Paste the link (URL) into the document or application of your choice."
- No citation-to-URL formula, query parameter, or template of any kind is shown — the permalink is generated entirely by Westlaw's own UI and copied verbatim by the user; it is not something a caller composes from a citation string.
**Relevant open question(s):** Q5 (this current, dated guide describes only a UI-generated opaque permalink flow for Westlaw — no `cite=`-style query-string template is mentioned).

### 12b. Linking to E-Resources (University of Minnesota Law Library) — https://libguides.law.umn.edu/c.php?g=125778&p=823446

**Fetch method:** HTTP fetch.
**Result:** Retrieved — verbatim excerpt below. Page states "Last Updated: Jun 24, 2026" — current as of this research.
**Verbatim technical detail:**
- Explicit sign-in requirement, quoted verbatim: "The law library's subscriptions to Westlaw and LexisNexis for law schools do not support IP authentication. As a result, law school affiliates will always need to log in with their Westlaw or LexisNexis passwords. If you would like to create a link to a specific Westlaw or LexisNexis document, database, or search, follow the steps below. **URLs generated will direct users to a log-in screen, and once logged in will re-direct to the selected resource.**"
- Westlaw steps, quoted verbatim: "Go to Westlaw and navigate to the page you wish to link to. Click on the 'hyperlink' icon in the upper right portion of the screen. Click the 'Copy Link' button. The permalink to the document is now in the clipboard and can be pasted wherever it is needed."
- Lexis Advance steps, quoted verbatim: "Open the document you would like to link to in Lexis Advance. Next to the document title, click on 'Copy Citation'. Check the box to 'Copy citation as hyperlink,' then copy the citation highlighted. Paste the copied citation into your document. This citation will have a link to the original document in Lexis Advance."
- Also documents Bloomberg Law's equivalent copy-link flow (not one of the two vendors in scope, included here only because it appears on the same page): right-click a document hyperlink and "Copy link location"/"Copy shortcut".
**Relevant open question(s):** Q5 (second independent, current, dated source confirming both vendors' citation links are UI-generated opaque permalinks, not composable query-string formulas). Q6 (explicitly confirms sign-in is required to resolve either vendor's generated link — "URLs generated will direct users to a log-in screen" — reinforcing that no anonymous/programmatic verification path exists through these link mechanisms).
