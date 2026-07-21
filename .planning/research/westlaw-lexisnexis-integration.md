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
