import { CitationMatch, ParsedCitation, ProviderCredentialField } from "./types";
import { getHttpClient } from "../http";
import { EnterpriseCitationProvider, fetchClientCredentialsToken, trimTrailingSlash } from "./base";

/**
 * Bloomberg Law's API is contract-gated and invite-only. Unlike Thomson Reuters and LexisNexis
 * (whose real OAuth2 shapes are now confirmed -- see
 * .planning/research/vendor-oauth-endpoints-code-evidence.md), Bloomberg Law's programmatic auth
 * could NOT be confirmed from any reachable evidence: no public integration was found, and
 * Bloomberg's Terminal APIs use a different (JWT-per-request) model. This provider therefore
 * remains a pure configurable shell that ASSUMES the common OAuth2 client-credentials shape with a
 * base-URL-derived token path -- treat both TOKEN_PATH and SEARCH_PATH as unverified placeholders
 * to confirm against your firm's Bloomberg Law API documentation before relying on this provider.
 */
const TOKEN_PATH = "/oauth/token";
const SEARCH_PATH = "/api/v1/search/cases";

export class BloombergLawProvider extends EnterpriseCitationProvider {
  readonly id = "bloomberglaw";
  readonly name = "Bloomberg Law";
  readonly description =
    "Looks up citations through your organization's Bloomberg Law API subscription. Requires the API base URL and client credentials issued under your firm's Bloomberg Law contract.";
  readonly credentialFields: ProviderCredentialField[] = [
    { key: "apiBaseUrl", label: "API base URL (from your Bloomberg Law contract)", type: "text", placeholder: "https://your-tenant.api.bloomberglaw.com" },
    { key: "clientId", label: "Client ID", type: "text" },
    { key: "clientSecret", label: "Client secret", type: "password" },
  ];

  private accessToken: string | null = null;

  protected async verifyCredentials(credentials: Record<string, string>): Promise<void> {
    const baseUrl = trimTrailingSlash(credentials.apiBaseUrl);
    this.accessToken = await fetchClientCredentialsToken(`${baseUrl}${TOKEN_PATH}`, credentials.clientId, credentials.clientSecret);
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
