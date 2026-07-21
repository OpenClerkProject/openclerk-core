import { CitationMatch, ParsedCitation, ProviderCredentialField } from "./types";
import { getHttpClient } from "../http";
import { EnterpriseCitationProvider, fetchClientCredentialsToken, trimTrailingSlash } from "./base";

/**
 * LexisNexis is a contract-gated enterprise API (Lexis+ / the Web Services Kit): there is no single
 * public content endpoint or key OpenClerk can ship. Its OAuth2 shape is confirmed from real
 * integrations (see .planning/research/vendor-oauth-endpoints-code-evidence.md) and differs from
 * Thomson Reuters': the token endpoint is a fixed auth-api host, the client credentials are sent as
 * an HTTP Basic header (not in the body), a `scope` of http://oauth.lexisnexis.com/all is required,
 * and there is no `audience`. This provider defaults to that token host and scope and lets a firm
 * override both. SEARCH_PATH remains a placeholder to confirm against your firm's LexisNexis API
 * documentation -- this provider is a configurable shell for lookups until a design partner's real
 * content endpoint is validated.
 */
const DEFAULT_TOKEN_URL = "https://auth-api.lexisnexis.com/oauth/v2/token";
const DEFAULT_SCOPE = "http://oauth.lexisnexis.com/all";
const SEARCH_PATH = "/search/cases";

export class LexisNexisProvider extends EnterpriseCitationProvider {
  readonly id = "lexisnexis";
  readonly name = "LexisNexis";
  readonly description =
    "Looks up citations through your organization's LexisNexis API subscription. Requires the API base URL and client credentials issued under your firm's LexisNexis contract.";
  readonly credentialFields: ProviderCredentialField[] = [
    { key: "apiBaseUrl", label: "API base URL (from your LexisNexis contract)", type: "text", placeholder: "https://your-tenant.api.lexisnexis.com" },
    { key: "clientId", label: "Client ID", type: "text" },
    { key: "clientSecret", label: "Client secret", type: "password" },
    // Optional: LexisNexis uses one fixed auth-api token host and a standard scope, so these default
    // to DEFAULT_TOKEN_URL / DEFAULT_SCOPE. Override only if your contract directs otherwise.
    { key: "tokenUrl", label: "OAuth token URL (optional)", type: "text", placeholder: DEFAULT_TOKEN_URL, required: false },
    { key: "scope", label: "Scope (optional)", type: "text", placeholder: DEFAULT_SCOPE, required: false },
  ];

  private accessToken: string | null = null;

  protected async verifyCredentials(credentials: Record<string, string>): Promise<void> {
    const tokenUrl = (credentials.tokenUrl || "").trim() || DEFAULT_TOKEN_URL;
    this.accessToken = await fetchClientCredentialsToken(tokenUrl, credentials.clientId, credentials.clientSecret, {
      credentialsIn: "basic",
      scope: (credentials.scope || "").trim() || DEFAULT_SCOPE,
    });
  }

  signOut(): void {
    super.signOut();
    this.accessToken = null;
  }

  async lookupCitation(citation: ParsedCitation): Promise<CitationMatch | null> {
    if (!this.credentials || !this.accessToken) {
      return null;
    }

    try {
      const baseUrl = trimTrailingSlash(this.credentials.apiBaseUrl);
      const response = await getHttpClient().fetch(`${baseUrl}${SEARCH_PATH}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.accessToken}`,
        },
        body: JSON.stringify({ citation: citation.raw }),
      });

      if (!response.ok) {
        return null;
      }

      const payload = await response.json();
      const match = payload && Array.isArray(payload.results) ? payload.results[0] : null;
      if (!match || !match.url) {
        return null;
      }

      return { url: match.url, caseName: match.caseName || match.title, citation: citation.raw };
    } catch {
      return null;
    }
  }
}
