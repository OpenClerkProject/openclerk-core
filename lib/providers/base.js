"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnterpriseCitationProvider = void 0;
exports.trimTrailingSlash = trimTrailingSlash;
exports.fetchClientCredentialsToken = fetchClientCredentialsToken;
const http_1 = require("../http");
/**
 * Base class for providers backed by a paid/contract-gated research API
 * (LexisNexis, Westlaw, Bloomberg Law, or a firm's own internal API).
 *
 * OpenClerk never ships a fixed endpoint or a bundled key for these
 * platforms: each vendor provisions API access per customer contract, so the
 * base URL and credentials are always supplied by the user at runtime and
 * held in memory only for the current session. Nothing is written to disk,
 * localStorage, or any OpenClerk-controlled server.
 */
class EnterpriseCitationProvider {
    constructor() {
        this.requiresAuth = true;
        this.credentials = null;
    }
    isAuthenticated() {
        return this.credentials !== null;
    }
    async authenticate(credentials) {
        const missing = this.credentialFields.filter((field) => field.required !== false && !(credentials[field.key] || "").trim());
        if (missing.length > 0) {
            throw new Error(`Missing required field(s): ${missing.map((field) => field.label).join(", ")}`);
        }
        const apiBaseUrl = credentials.apiBaseUrl;
        if (apiBaseUrl && !/^https:\/\//i.test(apiBaseUrl.trim())) {
            throw new Error("The API base URL must start with https:// so credentials and citations are never sent unencrypted.");
        }
        await this.verifyCredentials(credentials);
        this.credentials = credentials;
    }
    signOut() {
        this.credentials = null;
    }
}
exports.EnterpriseCitationProvider = EnterpriseCitationProvider;
function trimTrailingSlash(value) {
    return value.replace(/\/+$/, "");
}
/**
 * Performs an OAuth2 client-credentials handshake, the pattern most
 * enterprise legal research APIs use for machine-to-machine access. Returns
 * the bearer token on success; throws on any non-2xx response or missing
 * access_token so callers can surface a clear "authentication failed" error.
 */
async function fetchClientCredentialsToken(tokenUrl, clientId, clientSecret) {
    const response = await (0, http_1.getHttpClient)().fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "client_credentials",
            client_id: clientId,
            client_secret: clientSecret,
        }),
    });
    if (!response.ok) {
        throw new Error(`Authentication failed (HTTP ${response.status}). Verify the API base URL and credentials.`);
    }
    const payload = await response.json();
    const accessToken = payload && payload.access_token;
    if (!accessToken || typeof accessToken !== "string") {
        throw new Error("Authentication succeeded but no access token was returned.");
    }
    return accessToken;
}
