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
