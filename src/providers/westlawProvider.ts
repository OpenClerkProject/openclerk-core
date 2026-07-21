import { CitationMatch, ParsedCitation, ProviderCredentialField } from "./types";
import { getHttpClient } from "../http";
import { EnterpriseCitationProvider, fetchClientCredentialsToken, trimTrailingSlash } from "./base";

/**
 * Westlaw (Thomson Reuters) content APIs are contract-gated: access, the content base URL, and the
 * per-product `audience` are provisioned per customer, so there is no single public endpoint
 * OpenClerk can ship. The OAuth2 shape, however, is not guesswork: across Thomson Reuters' API
 * platform the token endpoint is a single fixed CIAM host and the client-credentials request
 * carries the credentials in the body plus a required `audience` GUID (see
 * .planning/research/vendor-oauth-endpoints-code-evidence.md for the real-world evidence). This
 * provider defaults to that token host, lets a firm override it, and requires the audience.
 * SEARCH_PATH remains a placeholder to confirm against your firm's Westlaw API documentation --
 * this provider is a configurable shell for lookups until a design partner's real content endpoint
 * is validated.
 */
const DEFAULT_TOKEN_URL = "https://auth.thomsonreuters.com/oauth/token";
const SEARCH_PATH = "/content/search/v1/cases";

export class WestlawProvider extends EnterpriseCitationProvider {
  readonly id = "westlaw";
  readonly name = "Westlaw";
  readonly description =
    "Looks up citations through your organization's Westlaw / Thomson Reuters API subscription. Requires the API base URL, the audience issued under your firm's contract, and client credentials.";
  readonly credentialFields: ProviderCredentialField[] = [
    { key: "apiBaseUrl", label: "API base URL (from your Westlaw contract)", type: "text", placeholder: "https://your-tenant.api.thomsonreuters.com" },
    { key: "clientId", label: "Client ID", type: "text" },
    { key: "clientSecret", label: "Client secret", type: "password" },
    { key: "audience", label: "Audience (from your Westlaw contract)", type: "text", placeholder: "the audience value Thomson Reuters issued with your credentials" },
    // Optional: Thomson Reuters uses one fixed CIAM token host, so this defaults to DEFAULT_TOKEN_URL.
    // Supply it only if your contract directs you to a different authentication endpoint.
    { key: "tokenUrl", label: "OAuth token URL (optional)", type: "text", placeholder: DEFAULT_TOKEN_URL, required: false },
    { key: "scope", label: "Scope (optional)", type: "text", placeholder: "space-separated scopes, if your contract requires them", required: false },
  ];

  private accessToken: string | null = null;

  protected async verifyCredentials(credentials: Record<string, string>): Promise<void> {
    const tokenUrl = (credentials.tokenUrl || "").trim() || DEFAULT_TOKEN_URL;
    this.accessToken = await fetchClientCredentialsToken(tokenUrl, credentials.clientId, credentials.clientSecret, {
      credentialsIn: "body",
      audience: credentials.audience,
      scope: credentials.scope,
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
