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

**Follow-up pass (same session, orchestrator-level, with WebFetch + real browser tools
available):** after the sub-agent execution above, the orchestrating session — which
does have `WebFetch` and `mcp__Claude_Browser__*` available — went back over the 4
SPA-gated URLs, the unreadable PDF, and the "Try it" console instruction directly. This
closed some gaps and refined others; every change is reflected inline in the affected
appendix items and Caveats entries below, each marked "(Follow-up pass finding:"). Net
result: `dev.lexisnexis.com/gettingStarted` (item 6) is now fully read via the browser
tool's real Chromium rendering — the earlier SPA-shell block was a genuine tooling gap
now closed. The CM/ECF hyperlinking PDF (item 11) is now fully text-extracted via
`pdftotext` (present on this machine even though `pdftoppm`, which the `Read` tool's
PDF pipeline requires, is not). `developers.thomsonreuters.com` and its two catalog
sub-pages (items 4a/4b/4c) remain unread, but for a **different and more specific**
reason than originally recorded: WebFetch confirmed the same non-JS shell as the
sub-agent's raw fetch, but the real browser tool got further — it successfully
navigated and the page `<title>` rendered (proof the JS app does execute) — and then
blocked all content-reading calls (`get_page_text`, `read_page`, `computer` screenshot)
with "This site requires per-action approval; Browser read tools are not available on
it." This is a per-origin approval gate in the browser tool itself, not a technical
JS-rendering limitation and not a Thomson Reuters access control — it requires the
user's explicit action in their own client to grant, which this session cannot do on
its own. See the Caveats section for the exact error text.

## Executive Summary

Since the network-sandboxed prior session, this session directly retrieved 14 of the
16 target pages (the remaining 3 — all three are the Thomson Reuters
`developers.thomsonreuters.com` API catalog — are blocked by a browser-tool per-origin
approval gate; see Caveats). The most concrete new evidence is Thomson Reuters' own
documented OAuth2 client-credentials shape for its 3E API (auth URL and API base URL
are separate, contract-assigned values; the token request requires `client_id`,
`client_secret`, `grant_type=client_credentials`, **and `audience`**) — this directly
contradicts the current `EnterpriseCitationProvider`/`fetchClientCredentialsToken`
stub's assumption of a single base URL with an `/oauth/token` suffix and no `audience`
field. Two independent, currently-dated (2026) law-library guides, two LexisNexis
first-party support pages, **and now a fully-read 2013 federal-court CM/ECF
hyperlinking guide (the single source most likely to document a legacy `cite=`-style
query-string template)** all converged on the same conclusion for both vendors'
citation deep links: they are opaque, UI-generated permalinks copied from a signed-in
session, not a formula composable from a citation string — no source, old or new, shows
a constructable URL template — and Lexis's own "Link to Cites" feature can resolve a
single citation to *multiple* candidate documents rather than one verified match.
LexisNexis's getting-started page (now fully read via a real browser) names only news
(Metabase), litigation-analytics (Lex Machina), and legislative-tracking (State Net)
APIs, plus two "Coming Soon" news APIs (MLex, Law360) — no case-law-by-citation or
Shepard's API among them, though it also confirms the exact auth hostnames/token path
are gated behind free developer registration, not published on the getting-started page
itself. **Headline conclusion: neither Westlaw nor LexisNexis looks buildable as a real
(non-stub) provider from this session's evidence alone.** The authoritative Thomson
Reuters API catalog (`developers.thomsonreuters.com`) remains unread — blocked by a
browser-tool approval gate the user would need to grant, not by TR's own access
controls — and the one Westlaw-specific technical page in scope
(`westlaw-us-dockets-api`) sits behind an authenticated developer-portal session. Both
providers should remain configurable shells pending a design-partner firm's real
credentials and a validated live endpoint; nothing found in 16 sources suggests either
vendor exposes a way to programmatically verify a citation without a signed-in human,
which is the safety-critical constraint for `hallucinationCheck.ts`.

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
(appendix items 4a/4b/4c). None of the three catalog URLs returned readable content in
this session. (Follow-up pass finding: a real browser confirmed the page's JavaScript
does execute — the tab title renders as "Thomson Reuters Developer Portal" — so this is
no longer purely a "can't execute JS" tooling gap; the browser tool's content-reading
calls were instead blocked by a per-origin approval requirement specific to this site,
which requires the user's own action to grant and which this session could not grant on
its own. See Caveats for the exact error text.) Either way, **no full enumerated
catalog list could be produced**, so this question cannot be given a definitive yes/no
per the plan's own bar for evidence.

Circumstantial evidence from the pages that *were* readable leans toward "no, not
found in this session's readable subset": appendix item 1's "Collaborate" API is a
HighQ collaboration/workflow product; appendix item 2's 3E API is a practice-management
(matter) API; appendix item 5's marketing page names no case-law-by-citation or KeyCite
capability. None of these three retrievable products is a case-law-by-citation or
verification API. But because the authoritative catalog itself was unreachable, this
is reported as STILL UNRESOLVED (portal-gated by this session's tooling, not by TR's
access controls) rather than a confirmed "no."

### 4. Lexis auth shape

**Status: STILL UNRESOLVED, registration-gated** (exact token host/path/grant type) **;
REFUTED** (a documented case-law-by-citation API existing among the *named* Lexis API
catalog).

(Follow-up pass finding: `dev.lexisnexis.com/gettingStarted`, appendix item 6, is no
longer SPA-blocked — a real browser rendered it fully and it was read in full.) The
page confirms the getting-started document is a **catalog and use-case guide, not a
technical auth reference**: it names the available APIs (Metabase Filters/Firehose/
Search for news, Lex Machina for litigation analytics, State Net for legislation, MLex
and Law360 marked "Coming Soon") and states plainly that "registering for a
LexisNexis® Developer Portal account gives you access to detailed information and
documentation on all our APIs, data delivery options, schemas, and sample code" — i.e.
the exact token host/path/grant-type detail sits one step further behind a **free
registration wall**, not behind unreadable client-side JavaScript. So the status is
more precisely "registration-gated" than "portal-gated" now. The `lexis-api.page`
marketing page (appendix item 7) still only confirms "OAuth 2.0 authentication"
generically, and only explicitly for the Protégé API; it gives no host, path, or
grant-type detail.

On the second half of the question — whether case-law content is reachable via any
*documented* API — the full named catalog is now corroborated by **two independent
LexisNexis-first-party pages** (item 6's getting-started catalog and item 7's
marketing catalog), together naming: CourtLink API (dockets/litigation monitoring),
Lex Machina API (litigation analytics), State Net API (legislation/regulatory data),
Metabase Filters/Firehose/Search (news/social, item 6 only), Content API/Law360/MLex
(news, "Coming Soon"), Protégé (generative-AI Q&A grounded in Lexis content, item 7
only), and a vaguely-described generic "REST APIs" bucket for "Search and retrieve
legal and news content." **Across both independently-read catalog pages, no API is
named or described as retrieving full case-law text or metadata by a citation string,
and none is named as a Shepard's API.** This is now a stronger REFUTED finding for the
*named, documented* catalog (corroborated by two sources instead of one) — though it
still cannot rule out an undocumented capability, since the actual API *reference*
docs (schemas, sample code — one registration step beyond the getting-started page)
remain unread.

### 5. Deep-link get-by-citation

**Status: REFUTED** — for both the plan's stated expectation that Westlaw's
`find/default.wl?cite=` is a current, composable query-string template, **and now also
for the historical/legacy version of that same claim**, following the follow-up pass's
successful text-extraction of appendix item 11 (see below).

Five independent sources now converge on the same picture, spanning 2013 to 2026:
appendix items 10a and 10b (Lexis's own "Link to Cites" feature documentation) describe
a **UI-driven** conversion inside a licensed Word add-in, not a publicly composable URL
formula, and require an active Lexis/Lexis+ login. Appendix items 12a and 12b — two
currently-dated (2026) academic law-library guides — describe **both** vendors'
permalink creation as: navigate to the document in the vendor's own web interface,
click a "link"/"hyperlink" icon, click "Copy Link" (Westlaw) or "Copy Citation" → "Copy
citation as hyperlink" (Lexis Advance), and paste the resulting opaque URL. (Follow-up
pass finding: appendix item 11, a **federal CM/ECF attorney guide revised May 8,
2013** — 13 years old, the single source most likely to document a legacy `cite=`-style
query-string template, since neutral court guides are exactly where such internal
formulas would leak into public documentation — was fully text-extracted via
`pdftotext` in this follow-up pass. It documents **exactly the same** manual
sign-in-and-copy-the-URL workflow as the two 2026 guides ("Sign into the legal research
website and open the cited document. Select the url address for the document.
Right-click, and Copy the address."), plus two now-largely-discontinued commercial
Word-plugin tools — Westlaw InsertLinks and Shepard's/Lexis Links for Microsoft Office
— that automate the same copy-into-Word workflow rather than composing a URL from a
citation string. A full scan of every `http(s)://` URL in the 890-line extracted text
found only three static tool-download/product URLs, none containing a `cite=` or
`findType=` parameter.) **No source retrieved in this session — spanning 13 years of
guidance, from a 2013 federal court manual to 2026 law-library guides — shows a
`cite=`-style query-string template for either vendor, at any point.** This both
refutes the plan's stated expectation that `find/default.wl?cite=` is confirmed
still-current, and now also closes the historical gap: the one source that could
plausibly have documented that legacy format, even from over a decade ago, does not
contain it either.

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
citation. (Follow-up pass finding: appendix item 11's now-fully-read 2013 federal
court guide adds a third, independent, much older corroborating source — its only
documented linking methods are "sign into the legal research website" (manual) or a
licensed Word-plugin tool, both requiring an authenticated session; neither is framed
as citation verification.) **This directly confirms the load-bearing safety conclusion:
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

**LexisNexis — configurable shell, not ready.** The getting-started catalog page
(`dev.lexisnexis.com/gettingStarted`) is now fully read (follow-up pass) and, together
with the marketing catalog page, gives two independent, converging enumerations of the
named API catalog (CourtLink, Lex Machina, State Net, Metabase, Content
API/Law360/MLex, Protégé) — no source found names a get-by-citation or
verify-by-citation endpoint among them. The deeper *technical reference* docs (schemas,
sample code, exact auth hostnames) remain unread, gated behind free developer
registration rather than client-side rendering. Must remain a configurable shell: the
catalog-level evidence is now stronger than before, but the exact request/response
shape needed to implement a real provider is still not available without registering
and a design-partner firm's actual credentials.

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

Of the 16 URLs targeted across Tasks 1 and 2, 14 were ultimately retrieved and read
(12 by the sub-agent's HTTP-fetch pass, 2 more — items 6 and 11 — by the orchestrator's
follow-up pass with WebFetch and real browser tools). The following **6** could not be
retrieved (or could be retrieved but not read) even after both passes' available
tooling was applied:

1. **`https://developerportal.thomsonreuters.com/westlaw-us-dockets-api`** (appendix
   item 3) — redirected to `https://auth.thomsonreuters.com/u/login/identifier?state=...`
   returning HTTP 400 with body text: "Authentication Error — Oops! Something went
   wrong... TECHNICAL DETAILS: invalid_request. You may have pressed the back button,
   refreshed during login, opened too many login dialogs, or there is some issue with
   cookies, since we couldn't find your session." Requires an authenticated TR
   developer-portal SSO session. Not re-attempted in the follow-up pass — same
   authenticated-session wall applies regardless of tooling, and bypassing it would
   violate the plan's explicit auth-wall constraint.
2. **`https://developers.thomsonreuters.com/`** (appendix item 4a) — **(follow-up pass
   update)** the sub-agent's raw HTTP fetch got only a client-rendered SPA shell (see
   the full response body quoted in appendix item 4a). The orchestrator's follow-up
   pass confirmed via `WebFetch` that the same non-JS-executing shell is all a plain
   fetch ever returns, then tried a real browser (`mcp__Claude_Browser__navigate` +
   `get_page_text`): navigation succeeded and the tab title rendered as "Thomson Reuters
   Developer Portal" (proof the page's JavaScript does execute in a real browser), but
   every content-reading call was refused with the exact error text: **"This site
   requires per-action approval; Browser read tools are not available on it."** This is
   a per-origin approval gate inside the browser tool itself — it requires the user's
   own action in their client to grant, which this session could not do on its own. Not
   a TR access-control block, and no longer purely a "JS doesn't execute" tooling gap.
3. **`https://developers.thomsonreuters.com/pages/api-catalog/4EB79538-7677-4AF8-AC32-F73B26DBD473`**
   (appendix item 4b) — same follow-up-pass outcome as item 4a: WebFetch shell-only,
   browser navigation succeeded, content-reading blocked by the identical per-action
   approval error.
4. **`https://developers.thomsonreuters.com/pages/api-catalog/5A0B2E6E-DE81-42E6-9431-D78B8B4F0D35`**
   (appendix item 4c) — same follow-up-pass outcome as item 4a/4b.
5. **`https://www.lexisnexis.com/webserviceskit/v2_0beta/text/WSK-Welcome.htm`**
   (appendix item 8) — HTTP 404. Verbatim body: "page-not-found... Unfortunately we
   can't find the page you're looking for." This documentation resource has been
   retired. (Not a tooling gap — genuinely gone; not re-attempted in the follow-up
   pass, since a 404 does not change with better tooling.)
6. **`https://www.lexisnexis.com/communities/academic/w/wiki/111.url-api-specifications.aspx`**
   (appendix item 9) — no error, but the URL silently redirects to an unrelated page
   (`https://www.lexisnexis.com/en-us/products/nexis-uni.page`, a Nexis Uni marketing
   page with HTTP 200). The original wiki content is gone; nothing about a URL API
   specification was found at the redirected destination. (Not a tooling gap — the
   content is genuinely retired/redirected; not re-attempted in the follow-up pass.)

**Resolved in the follow-up pass (no longer caveats):**
- **`https://dev.lexisnexis.com/gettingStarted`** (appendix item 6) — was SPA-blocked
  for the sub-agent; a real browser rendered it fully. See appendix item 6 for the
  complete retrieved content.
- **`https://www.ned.uscourts.gov/internetDocs/cmecf/AttorneyGuide-Hyperlinking.pdf`**
  (appendix item 11) — was downloaded successfully by the sub-agent (HTTP 200, valid
  2,249,655-byte PDF) but not text-extractable there (`pdftoppm is not installed`, no
  `python3` fallback). The follow-up pass found `pdftotext` already present on the same
  machine (a different poppler-utils binary than the one the `Read` tool's PDF pipeline
  requires) and fully extracted the text. See appendix item 11 for the findings.

**On the "Try it" console instruction:** even with WebFetch and real browser tools
available in the follow-up pass, this instruction still could not be executed for any
URL — but now for a more precise reason than a blanket "tools unavailable." None of the
14 successfully-read pages (Drupal-rendered TR documentation, the now-read LexisNexis
getting-started catalog, static marketing pages, static library guides, the extracted
PDF) exposed a server-rendered or client-rendered "Try it"/Swagger-style console — they
are all prose documentation or catalog/use-case pages, not API reference pages with
embedded consoles. The pages that would most plausibly host such a console — the TR API
catalog detail pages (items 4a/4b/4c) — are exactly the ones blocked by the per-action
approval gate above, so whether a Try-it console exists on them specifically remains
genuinely unknown. This is recorded as an open item for a future session (with the
per-origin approval granted) to close, not as a deliberate skip of the instruction.

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

**Task 1 note on item 4 (a/b/c):** the plan asked to "enumerate every legal/Westlaw-named API you can find in the catalog listing, by exact name" from these three pages. This could **not** be done — none of the three URLs returned readable catalog text in either the sub-agent's HTTP-fetch pass or the orchestrator's follow-up browser pass (see the tooling note at the top of this file and Caveats items 2–4: the browser did render the page's JS — the title updates correctly — but a per-origin approval gate blocked every content-reading call). This is recorded as STILL UNRESOLVED / portal-gated (by this session's tooling access, not by TR's own access controls) rather than guessed.

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

**Fetch method:** WebFetch (returned only the Angular shell, confirming the sub-agent's
original finding), then Browser tools (`mcp__Claude_Browser__navigate` +
`get_page_text`) — **follow-up pass, orchestrator-level.**
**Result:** Retrieved in full via the browser tool's real Chromium rendering. The
original sub-agent run's "Blocked — client-rendered SPA shell" outcome is superseded
below; this was a genuine tooling gap in the sub-agent's environment, now closed.
**Verbatim technical detail:**
- Intro: "The LexisNexis® Developer Portal is designed to provide easy access and
  familiarization with our API solutions. Our APIs offer retrieval of data in bulk,
  real-time coverage of media and social commentary, filtered search responses,
  real-time news streams, archival search for historical content and more."
- Named APIs, quoted verbatim: **Metabase Filters** ("Provides access to news datasets
  via a single normalized data stream... filter and serve targeted ongoing news and
  social media"), **Metabase Firehose** ("near real-time coverage of media and social
  commentary"), **Metabase Search** ("archival Search API... search the last 100 days
  of publicly available news data or 10 years of print content... Boolean Syntax"),
  **Lex Machina API** ("access to Lex Machina's industry leading Litigation
  Analytics... case data including resolutions, damages, remedies, and findings"),
  **MLex API** ("★Coming Soon" — regulatory-risk news; "Access to the REST API is
  currently administered via MLex Salesforce outside of the Developer API Portal"),
  **Law360 API** ("★Coming Soon" — litigation/policy/deals news; "Access to this
  content is administered via the Metabase API"), **State Net API** ("legislation,
  regulations, agency documents, local ordinances, executive orders, and ballot
  measures via a REST API").
- On access/auth, quoted verbatim: "While this site provides basic information about
  our APIs, registering for a LexisNexis® Developer Portal account gives you access to
  **detailed information and documentation on all our APIs, data delivery options,
  schemas, and sample code**... Registering is free... You will have speedy access to
  trial." — i.e. this page is a catalog/use-case landing page, not the technical auth
  reference; the exact token host/path/grant-type detail this session's plan hoped to
  confirm sits one registration step further in, not on this page itself. No hostnames
  matching `auth-api.lexisnexis.com` or `services-api.lexisnexis.com` appear anywhere
  in the rendered page text.
- No case-law-by-citation retrieval API or Shepard's API is named among the seven APIs
  listed on this page.
**Relevant open question(s):** Q4 (auth host/path/grant-type: now STILL UNRESOLVED for
a different, more precise reason — registration-gated, not rendering-gated. Case-law
API existence: REFUTED, corroborating appendix item 7's independent catalog).

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

**Fetch method:** HTTP download (`curl`), then `pdftotext -layout` (from poppler, present on this machine at `/mingw64/bin/pdftotext` even though `pdftoppm` — which the `Read` tool's own PDF pipeline requires — is not installed) — **follow-up pass, orchestrator-level.**
**Result:** Retrieved and fully text-extracted (890 lines of layout-preserved text from the same 2,249,655-byte PDF the sub-agent run downloaded). This supersedes the sub-agent run's "retrieved but not readable" outcome — same tooling class of gap (missing PDF-rendering dependency), closed by finding an already-installed alternative (`pdftotext`) rather than needing `pdftoppm` or `python3`.
**Verbatim technical detail:**
- Document title/date: "Attorney Guide to Hyperlinking in the Federal Courts... Revised on May 8, 2013" (D. Neb. CM/ECF attorney guide) — **13 years old relative to this research session**, older than every other source in this appendix; flagged here because its age is directly relevant to Open Question 5 (an older document is *more*, not less, likely to reflect a legacy query-string format if one ever existed).
- Section "Manually Creating Links to Online Research Resources," quoted verbatim: "The process for manually adding links to Westlaw, Lexis, Google Scholar, or any other online research resource... is essentially the same," with the documented steps being: "Sign into the legal research website and open the cited document. Select the url address for the document. Right-click, and Copy the address," then paste that copied URL into a standard Word/WordPerfect hyperlink dialog. **No `cite=`, `findType=`, or any other composable query-string parameter appears anywhere in this workflow.**
- Section "Access to Linking Software" documents two commercial Word-plugin tools as the *only* automated alternative to the manual copy-paste process: **Westlaw InsertLinks** ("a Westlaw computer software program which scans Microsoft Word... and inserts hyperlinks to the Westlaw internet address (url) for those citations," ~$100–500/month subscription) and **Shepard's Links 2008 / Lexis for Microsoft Office** (a discontinued 2008-era tool; the guide notes verbatim "Lexis is currently not selling a software subscription which will insert links to documents that will remain active upon conversion to PDF... Lexis is investigating the issue"). Both are described as *automating the same UI copy-paste behavior*, not as calling or documenting a composable URL formula.
- A full scan of every `http(s)://` URL string in the extracted text found exactly three, all static tool-vendor/product pages (`legalsolutions.thomsonreuters.com/law-products/...`, `support.lexisnexis.com/lndownload/...`, `lexisnexis.com/en-us/products/lexis-for-microsoft-office.page`) — **none contains a citation-derived query parameter of any kind.**
**Relevant open question(s):** Q5 (now **REFUTED**, not merely unresolved — the single source most likely to contain a legacy `cite=`-style template, dated 13 years before this session, documents only the same manual-copy/licensed-plugin pattern as the two 2026 sources). Q6 (further corroborates: this 13-year-old source's only two linking mechanisms both require an authenticated session or a paid, licensed plugin — no anonymous/programmatic path, consistent with every other source in this appendix).

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
