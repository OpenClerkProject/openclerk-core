# Vendor OAuth Endpoints — Ground-Truth Code Evidence (Session 3)

This is a **follow-up research pass** prompted by the observation that the
`EnterpriseCitationProvider` redesign was resting on *extrapolated* auth shapes
(the prior report confirmed Thomson Reuters' OAuth2 shape only from a single 3E
practice-management doc, and left LexisNexis/Bloomberg unconfirmed). The vendor
documentation portals themselves are unreachable in this execution environment
(the agent proxy blocks direct egress to `developerportal.thomsonreuters.com`,
`www.lexisnexis.com`, and `apis.io` with `CONNECT tunnel failed, response 403`),
so this pass used a **different, reachable retrieval channel: GitHub code search**
(via the GitHub MCP, which bypasses the blocked proxy) to find *real production
integrations* that call these vendors' OAuth token endpoints. Verbatim code is a
stronger evidence class than vendor marketing prose for the specific question the
redesign turns on: the exact token URL, credential transport, and required params.

**Retrieval limitation (unchanged from prior sessions):** the Westlaw/Lexis
*case-law-by-citation* API reference docs remain portal/registration-gated. The
findings below are the vendors' **platform-wide OAuth2 mechanism**, corroborated
across many products; where a claim is extrapolated to the specific case-law APIs
(which could not be read directly), it is labelled as such.

---

## 1. Thomson Reuters (Westlaw's platform) — CONFIRMED, high confidence

**Token endpoint (fixed global host, NOT per-tenant):**
`https://auth.thomsonreuters.com/oauth/token` — an Auth0/CIAM tenant.

**Request shape:** `POST` with `Content-Type: application/x-www-form-urlencoded`,
credentials in the **body**, body =
`grant_type=client_credentials&client_id=<id>&client_secret=<secret>&audience=<audience-GUID>`
(+ optional `scope`). `audience` is a **product-specific GUID**, required.
Response is a JWT `access_token` (one doc notes a 24h TTL); subsequent calls use
`Authorization: Bearer <token>` against a **separate** API base host
(`api.reutersconnect.com`, `api.onvio.com.br`, etc.).

**Independent corroborating sources (all verbatim from GitHub code search):**
- `guardian/newswires` — `scripts/get-reuters-item.sh` and
  `poller-lambdas/src/pollers/reuters/auth.ts`:
  `AUTH_URL="https://auth.thomsonreuters.com/oauth/token"`, `GRANT_TYPE="client_credentials"`,
  `AUDIENCE="7a14b6a2-73b8-4ab2-a610-80fb9f40f769"` (Reuters Connect content API).
- `superdesk/superdesk-ntb` — `ntb_reuters_api.py`: default
  `"auth_url": "https://auth.thomsonreuters.com/oauth/token"`, body includes
  `"grant_type": "client_credentials"` and `"audience": ...`.
- `MiraakEren/SummaryDesk` — `ApiClients.cs`: `GetTokenAsync(clientId, clientSecret, audience)`
  posts to `https://auth.thomsonreuters.com/oauth/token` with
  `["grant_type"]="client_credentials"`, `["audience"]=audience`, `["scope"]=".../reutersconnect.contentapi.read ..."`.
- `Indie365/PowerPlatformC` — **certified Microsoft connector** `certified-connectors/3E Events/apiProperties.json`:
  `"ciamAuthority": "https://auth.thomsonreuters.com/"`, `"tokenUrlTemplate": "{ciamAuthority}oauth/token"`.
  (This is the closest to a Westlaw-family product — 3E — and confirms the same CIAM host.)
- `fabiojofre/dominio_2.0`, `WillHubner/IntegraOnvio`, `tiagoistuque/IntegracaoDominioThomsomReuters`
  (Onvio) — same `auth.thomsonreuters.com/oauth/token`, `client_credentials`, `audience` GUID.
- `p-j-morgan/PeerMonitor` — `FI_API with CIAM.postman_collection.json`: token request URL
  `https://auth.thomsonreuters.com/oauth/token`.
- `ratnakumarchukkapalli/interview-prep` describes it as TR's central CIAM:
  "`CIAM client_id + client_secret → POST auth.thomsonreuters.com/oauth/token (client_credentials grant) → 24h JWT`".

**Correction to the prior report:** the prior "Redesign Proposal" inferred (from the
3E doc's phrase "Thomson Reuters will provide ... the authentication endpoint URL")
that `tokenUrl` is a *contract-assigned per-tenant value*. The code evidence shows it
is a **single fixed known host** `https://auth.thomsonreuters.com/oauth/token` across
the entire TR API platform. It is genuinely separate from the API base URL (so a
distinct `tokenUrl` field is still correct), but it has a **known sensible default**,
not a blind per-tenant value.

**Extrapolation to Westlaw case-law APIs:** the Westlaw US Dockets / Legislation /
Litigation Analytics APIs live on the same `developerportal.thomsonreuters.com`
portal that documents this exact OAuth2 CIAM mechanism. No case-law-specific repo was
found (those APIs are contract-gated and rarely integrated in public OSS), so the
**Westlaw-specific `audience` GUID and base host are still unconfirmed**, but the
auth *mechanism* (fixed CIAM token host + `client_credentials` + required `audience`)
is now corroborated platform-wide rather than from a single product doc.

---

## 2. LexisNexis — CONFIRMED, high confidence (and materially different from TR)

**Token endpoint (fixed global host):**
`https://auth-api.lexisnexis.com/oauth/v2/token` (note the `/oauth/v2/token` path —
*not* `/oauth/token`).

**Request shape:** `POST` with `Content-Type: application/x-www-form-urlencoded`,
credentials via **HTTP Basic auth** (`Authorization: Basic base64(client_id:client_secret)`),
body = `grant_type=client_credentials&scope=http://oauth.lexisnexis.com/all`.
**No `audience` parameter.** Response `access_token` + `expires_in` (default 3600).

**Independent corroborating sources (verbatim):**
- `rwcuffney/lexisnexisapi` (a **published PyPI package** `lexisnexisapi`) —
  `src/lexisnexisapi/webservices.py`: `payload = {"grant_type": "client_credentials",
  "scope": "http://oauth.lexisnexis.com/all"}`, returns `json_data["access_token"]`.
- `ericleasemorgan/ln-toolbox` — `bin/search.py`, `bin/get-count.py`:
  `auth_url = 'https://auth-api.lexisnexis.com/oauth/v2/token'`,
  `payload = 'grant_type=client_credentials&scope=http%3a%2f%2foauth.lexisnexis.com%2fall'`,
  `requests.post(auth_url, auth=HTTPBasicAuth(client_id, secret), ...)` — **Basic auth, explicit.**
- `TimRepke/nacsos-data` — `src/nacsos_data/util/lexisnexis/webapi.py`: base64-encodes
  `f'{CLIENT_ID}:{CLIENT_SECRET}'` and posts to `https://auth-api.lexisnexis.com/oauth/v2/token`
  with `{'grant_type': 'client_credentials', 'scope': 'http://oauth.lexisnexis.com/all'}` — **Basic auth, explicit.**
- `afriedman412/sayswho-cjj`, `EandrewJones/pcwi-mediation-curation-pipeline` — same
  `https://auth-api.lexisnexis.com/oauth/v2/token`.

**Correction to the prior report / design panel:** the panel treated Lexis as a
possible-`audience` variant of the same body-credentials flow as TR. The real Lexis
WSK/developer OAuth2 flow (a) puts credentials in an **HTTP Basic header, not the
body**, (b) requires a fixed **`scope`** (`http://oauth.lexisnexis.com/all`), and
(c) uses **no `audience` at all**. A single shared `fetchClientCredentialsToken` that
only writes credentials into the body cannot represent Lexis correctly.

**Caveat:** these repos integrate the Lexis **Web Services Kit / news-content (Nexis)**
API surface, consistent with the prior report's finding that WSK focuses on news/Nexis,
not case-law/Shepard's. So this is the confirmed Lexis *developer-API auth shape*, but
still not proof of a case-law-by-citation endpoint (the prior report REFUTED such an
endpoint existing in the named catalog).

---

## 3. Bloomberg Law — STILL UNCONFIRMED (client-credentials assumption unsupported)

No credible open-source integration of a Bloomberg **Law** REST API was found:
- `ihoward40/SintraPrime-Unified` (`financial_connectors.py`) uses an **API key**
  (`BLOOMBERG_LAW_API_KEY`) against `https://api.bloomberglaw.com` — not OAuth2
  client-credentials. (Low-trust, likely AI-generated aggregator repo; the same repo
  contains a dubious `auth.lexisnexis.com/oauth/token` that contradicts the
  well-corroborated `auth-api.lexisnexis.com/oauth/v2/token`, so treat with caution.)
- Bloomberg's Terminal/`blpapi` REST services use **JWT-per-request** auth (per vendor
  docs), which is a different model again.
- Most `bloomberglaw.com` hits are news URLs or RAG domain-allowlists, not API calls.

**Conclusion:** Bloomberg Law's programmatic auth shape cannot be confirmed from
reachable evidence, and there is no public sign of a self-serve case-law API. The
current provider's OAuth2 client-credentials assumption is neither confirmed nor
clearly refuted — it should remain a pure configurable shell and must not be presented
as a validated shape.

---

## 4. Net implications for the `EnterpriseCitationProvider` redesign

1. **The shared token function must support two credential transports.** TR sends
   `client_id`/`client_secret` in the body; Lexis sends them via HTTP Basic. A correct
   shared `fetchClientCredentialsToken` needs a `credentialsIn: "body" | "basic"`
   option (RFC 6749 permits both; Basic is the spec's default). This is the single
   biggest correction versus the design panel's "uniform body flow" assumption.

2. **`tokenUrl` has a known per-vendor default, not a blind per-tenant value.**
   Westlaw → `https://auth.thomsonreuters.com/oauth/token`; Lexis →
   `https://auth-api.lexisnexis.com/oauth/v2/token`. It should remain a *separate,
   overridable* field (it is genuinely a different host than the API base URL), but the
   default is known, so it need not be a required blind entry.

3. **Distinguishing param differs per vendor, so a uniform trio is wrong.**
   Westlaw needs **`audience`** (required GUID). Lexis needs **`scope`**
   (`http://oauth.lexisnexis.com/all`, effectively required) and **no `audience`**.
   Per-subclass `credentialFields` should reflect this, not a shared
   `{tokenUrl, audience, scope}` trio applied uniformly.

4. **HTTPS-enforce `tokenUrl` generically in the base** — unchanged and still correct:
   the client secret is transmitted to that host (in the body for TR, in a Basic header
   for Lexis), so an `http://` token URL leaks it either way.

5. **Bloomberg stays a shell** — no field/shape should be asserted for it beyond what
   already exists; flag its OAuth2 assumption as unverified.

6. **None of this makes Westlaw or Lexis a *verification*-capable provider.** The prior
   report's safety conclusion stands: neither vendor exposes a way to programmatically
   confirm a citation is genuine without a signed-in human, so `hallucinationCheck.ts`
   must still never treat a Westlaw/Lexis lookup as a verification signal. This research
   only firms up the *auth mechanics*, not the verification capability.

**Confidence summary:** TR token host/shape — HIGH (10+ independent repos incl. a
certified MS connector). Lexis token host/shape — HIGH (5+ incl. a published PyPI
package). Westlaw-*case-law*-specific audience GUID/base host — UNCONFIRMED (portal-
gated). Bloomberg Law — UNCONFIRMED. That an OAuth2 client-credentials handshake is the
right *general* mechanism for TR and Lexis — CONFIRMED; that it is uniform across
vendors — REFUTED (body vs Basic; audience vs scope).
