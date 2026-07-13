"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LexisNexisProvider = void 0;
const http_1 = require("../http");
const base_1 = require("./base");
/**
 * LexisNexis is a contract-gated enterprise API (e.g. Lexis+ / the Web
 * Services Kit): there is no single public endpoint or key OpenClerk can
 * ship, and the exact token/search paths are assigned per customer. This
 * provider implements the common OAuth2 client-credentials shape and a
 * configurable base URL; confirm the exact paths in your firm's LexisNexis
 * API documentation and adjust TOKEN_PATH/SEARCH_PATH below if they differ.
 */
const TOKEN_PATH = "/oauth/token";
const SEARCH_PATH = "/search/cases";
class LexisNexisProvider extends base_1.EnterpriseCitationProvider {
    constructor() {
        super(...arguments);
        this.id = "lexisnexis";
        this.name = "LexisNexis";
        this.description = "Looks up citations through your organization's LexisNexis API subscription. Requires the API base URL and client credentials issued under your firm's LexisNexis contract.";
        this.credentialFields = [
            { key: "apiBaseUrl", label: "API base URL (from your LexisNexis contract)", type: "text", placeholder: "https://your-tenant.api.lexisnexis.com" },
            { key: "clientId", label: "Client ID", type: "text" },
            { key: "clientSecret", label: "Client secret", type: "password" },
        ];
        this.accessToken = null;
    }
    async verifyCredentials(credentials) {
        const baseUrl = (0, base_1.trimTrailingSlash)(credentials.apiBaseUrl);
        this.accessToken = await (0, base_1.fetchClientCredentialsToken)(`${baseUrl}${TOKEN_PATH}`, credentials.clientId, credentials.clientSecret);
    }
    signOut() {
        super.signOut();
        this.accessToken = null;
    }
    async lookupCitation(citation) {
        if (!this.credentials || !this.accessToken) {
            return null;
        }
        try {
            const baseUrl = (0, base_1.trimTrailingSlash)(this.credentials.apiBaseUrl);
            const response = await (0, http_1.getHttpClient)().fetch(`${baseUrl}${SEARCH_PATH}`, {
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
        }
        catch {
            return null;
        }
    }
}
exports.LexisNexisProvider = LexisNexisProvider;
