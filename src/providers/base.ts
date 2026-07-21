import { CitationProvider, CitationMatch, ParsedCitation, ProviderCredentialField } from "./types";
import { getHttpClient } from "../http";

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
export abstract class EnterpriseCitationProvider implements CitationProvider {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly credentialFields: ProviderCredentialField[];
  readonly requiresAuth = true;

  /**
   * Credential keys that carry a URL the client secret (or a citation) is sent to, and must
   * therefore be https:// so nothing is transmitted in cleartext. Enforced generically in
   * authenticate() only when the value is present (an omitted optional field is skipped).
   * `tokenUrl` is included because the OAuth2 token request POSTs the client secret to it --
   * whether in the body (Thomson Reuters) or an HTTP Basic header (LexisNexis), an http:// token
   * endpoint would leak the secret either way. A subclass that introduces another URL-typed
   * credential must add its key here.
   */
  protected readonly httpsRequiredCredentialKeys: string[] = ["apiBaseUrl", "tokenUrl"];

  protected credentials: Record<string, string> | null = null;

  isAuthenticated(): boolean {
    return this.credentials !== null;
  }

  async authenticate(credentials: Record<string, string>): Promise<void> {
    const missing = this.credentialFields.filter(
      (field) => field.required !== false && !(credentials[field.key] || "").trim()
    );
    if (missing.length > 0) {
      throw new Error(`Missing required field(s): ${missing.map((field) => field.label).join(", ")}`);
    }

    // Enforce https:// on every URL-bearing credential that was supplied. Runs before
    // verifyCredentials() so no secret ever leaves the process over an insecure connection.
    for (const key of this.httpsRequiredCredentialKeys) {
      const value = (credentials[key] || "").trim();
      if (value && !/^https:\/\//i.test(value)) {
        const label = this.credentialFields.find((field) => field.key === key)?.label || key;
        throw new Error(`${label} must start with https:// so credentials and citations are never sent unencrypted.`);
      }
    }

    await this.verifyCredentials(credentials);
    this.credentials = credentials;
  }

  signOut(): void {
    this.credentials = null;
  }

  /** Subclasses perform the vendor-specific handshake (e.g. OAuth2 client-credentials) and throw on failure. */
  protected abstract verifyCredentials(credentials: Record<string, string>): Promise<void>;

  abstract lookupCitation(citation: ParsedCitation): Promise<CitationMatch | null>;
}

export function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

/**
 * Encodes a string to standard base64 (of its UTF-8 bytes) without depending on Buffer (Node-only)
 * or btoa (absent in some hosts, e.g. Google Apps Script) -- keeping this library platform-
 * agnostic. Used to build the HTTP Basic Authorization header for OAuth2 token endpoints that
 * expect the client credentials in the header rather than the request body (see
 * `credentialsIn: "basic"` below). Client credentials are ASCII in practice, but the full UTF-8
 * handling (including 4-byte astral code points) keeps this correct for any input and matches
 * Node's Buffer.from(s, "utf8").toString("base64"). Exported for property-based testing against
 * that reference; not re-exported from the package barrel, so it is not part of the public API.
 */
export function toBase64(input: string): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const bytes: number[] = [];
  for (const ch of input) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp < 0x80) {
      bytes.push(cp);
    } else if (cp < 0x800) {
      bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    } else if (cp < 0x10000) {
      bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    }
  }
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += chars[b0 >> 2];
    out += chars[((b0 & 0x03) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? chars[((b1 & 0x0f) << 2) | (b2 >> 6)] : "=";
    out += i + 2 < bytes.length ? chars[b2 & 0x3f] : "=";
  }
  return out;
}

/**
 * Options for the OAuth2 client-credentials handshake, capturing where vendors genuinely diverge.
 * All fields are optional and only affect the request when supplied, so the defaults reproduce the
 * plain body-credentials flow that older callers relied on. See
 * .planning/research/vendor-oauth-endpoints-code-evidence.md for the real-world evidence behind
 * these knobs.
 */
export interface ClientCredentialsTokenOptions {
  /**
   * Where the client_id/client_secret go. "body" (default) posts them as form fields -- Thomson
   * Reuters' CIAM token endpoint expects this. "basic" sends them as an HTTP Basic Authorization
   * header instead (RFC 6749's default) and keeps them out of the body -- LexisNexis's auth-api
   * requires this and rejects body credentials.
   */
  credentialsIn?: "body" | "basic";
  /**
   * OAuth2 "audience" body parameter. Required by Thomson Reuters (a product-specific GUID issued
   * per contract); has no analogue in the LexisNexis flow. Sent only when supplied and non-empty.
   */
  audience?: string;
  /**
   * OAuth2 "scope" body parameter. Required in practice by LexisNexis
   * (http://oauth.lexisnexis.com/all) and occasionally used by Thomson Reuters content APIs. Sent
   * only when supplied and non-empty.
   */
  scope?: string;
}

/**
 * Performs an OAuth2 client-credentials handshake, the pattern most enterprise legal research APIs
 * use for machine-to-machine access. Returns the bearer token on success; throws on any non-2xx
 * response or missing access_token so callers can surface a clear "authentication failed" error.
 *
 * Vendors diverge in two confirmed ways (see the research note referenced on
 * ClientCredentialsTokenOptions): credential transport (body vs. HTTP Basic) and which extra
 * parameter distinguishes the tenant (Thomson Reuters requires `audience`; LexisNexis requires a
 * `scope`). Both are handled via `options`; omitting them yields a request byte-identical to the
 * original body-only flow, so existing callers are unaffected.
 */
export async function fetchClientCredentialsToken(
  tokenUrl: string,
  clientId: string,
  clientSecret: string,
  options: ClientCredentialsTokenOptions = {}
): Promise<string> {
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  const body = new URLSearchParams({ grant_type: "client_credentials" });

  if (options.credentialsIn === "basic") {
    headers["Authorization"] = `Basic ${toBase64(`${clientId}:${clientSecret}`)}`;
  } else {
    body.set("client_id", clientId);
    body.set("client_secret", clientSecret);
  }

  const audience = options.audience?.trim();
  if (audience) {
    body.set("audience", audience);
  }
  const scope = options.scope?.trim();
  if (scope) {
    body.set("scope", scope);
  }

  const response = await getHttpClient().fetch(tokenUrl, {
    method: "POST",
    headers,
    body,
  });

  if (!response.ok) {
    throw new Error(`Authentication failed (HTTP ${response.status}). Verify the token URL and credentials.`);
  }

  const payload = await response.json();
  const accessToken = payload && payload.access_token;
  if (!accessToken || typeof accessToken !== "string") {
    throw new Error("Authentication succeeded but no access token was returned.");
  }

  return accessToken;
}
