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

  /**
   * On-prem opt-out for the SSRF host block below. When false (the default),
   * authenticate() rejects any URL-bearing credential that points at a
   * loopback, link-local, or private-network host, so a mistyped or malicious
   * endpoint can't turn OpenClerk's HTTP client into a server-side request
   * forgery (SSRF) tool against internal services. Some firms legitimately
   * self-host their enterprise citation gateway on a private/internal IP; those
   * deployments can set this true (in a subclass or host wiring) to allow such
   * endpoints. Even when true, https:// is still enforced and the cloud
   * metadata address 169.254.169.254 is still blocked unconditionally -- it is
   * never a legitimate citation endpoint and reaching it can leak instance
   * credentials.
   */
  protected allowPrivateNetworkEndpoints = false;

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

    // Validate every URL-bearing credential that was supplied. Runs before verifyCredentials() so no
    // secret ever leaves the process over an insecure connection or to an SSRF-target host.
    // apiBaseUrl and tokenUrl are validated INDEPENDENTLY: we deliberately do NOT require tokenUrl's
    // host to equal apiBaseUrl's host, because vendors legitimately split the auth host from the
    // content host (e.g. Thomson Reuters' fixed CIAM token host differs from the tenant API host).
    for (const key of this.httpsRequiredCredentialKeys) {
      const value = (credentials[key] || "").trim();
      if (!value) {
        continue;
      }
      const label = this.credentialFields.find((field) => field.key === key)?.label || key;
      this.assertSafeEndpointUrl(value, label);
    }

    await this.verifyCredentials(credentials);
    this.credentials = credentials;
  }

  /**
   * Validates one user-supplied endpoint URL (apiBaseUrl / tokenUrl) before any secret is sent to
   * it. Enforces https:// and blocks server-side request forgery (SSRF) targets -- loopback,
   * link-local, and private-network hosts -- that an enterprise "bring your own endpoint" field
   * could otherwise be pointed at to make OpenClerk's HTTP client reach internal services on the
   * operator's behalf.
   *
   * The cloud metadata address 169.254.169.254 is blocked unconditionally (even when
   * `allowPrivateNetworkEndpoints` is set): it is never a real citation endpoint, and reaching it
   * can leak instance/role credentials. Every other private/loopback/link-local host is blocked by
   * default but re-enabled by `allowPrivateNetworkEndpoints` for firms that self-host on a private IP.
   *
   * Limitation: this only inspects the literal host written in the URL. A public hostname that
   * *resolves* to a private IP via DNS is not caught here -- that would require DNS resolution, which
   * this platform-agnostic library deliberately avoids (no Node `dns`), and even a resolve-then-connect
   * check is a DNS-rebinding TOCTOU race (the name can resolve to a safe IP at check time and a
   * private IP at connect time). Non-IP hosts other than localhost/*.localhost are therefore allowed.
   */
  private assertSafeEndpointUrl(value: string, label: string): void {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error(`${label} is not a valid URL. Provide a full https:// URL, e.g. https://api.vendor.example.com.`);
    }

    if (parsed.protocol !== "https:") {
      throw new Error(`${label} must start with https:// so credentials and citations are never sent unencrypted.`);
    }

    // url.hostname keeps IPv6 literals wrapped in [ ]; strip them before classifying. The WHATWG URL
    // parser has already normalized IPv4 (including hex/octal/integer forms) to dotted-decimal and
    // compressed IPv4-mapped IPv6 to hex, so the classifiers below only see canonical shapes.
    const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();

    if (isCloudMetadataHost(hostname)) {
      throw new Error(
        `${label} points to the cloud metadata address (169.254.169.254), which is never a valid citation endpoint.`
      );
    }

    if (this.allowPrivateNetworkEndpoints) {
      return;
    }

    if (isPrivateOrLocalHost(hostname)) {
      throw new Error(
        `${label} points to a loopback, link-local, or private-network address (${parsed.hostname}). ` +
          `If your firm self-hosts its enterprise gateway on a private network, enable allowPrivateNetworkEndpoints on the provider.`
      );
    }
  }

  signOut(): void {
    this.credentials = null;
  }

  /** Subclasses perform the vendor-specific handshake (e.g. OAuth2 client-credentials) and throw on failure. */
  protected abstract verifyCredentials(credentials: Record<string, string>): Promise<void>;

  abstract lookupCitation(citation: ParsedCitation): Promise<CitationMatch | null>;
}

/**
 * Parses a dotted-decimal IPv4 literal into its four octets, or returns null if `host` is not a
 * plain IPv4 address. Only the canonical a.b.c.d shape is handled because the WHATWG URL parser has
 * already normalized any hex/octal/integer IPv4 form to dotted-decimal by the time we read
 * url.hostname (verified: `https://0x7f000001` -> hostname `127.0.0.1`).
 */
function parseIPv4(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length !== 4) {
    return null;
  }
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) {
      return null;
    }
    const n = Number(part);
    if (n > 255) {
      return null;
    }
    octets.push(n);
  }
  return octets;
}

/**
 * Expands an IPv6 literal (already stripped of its surrounding [ ]) into its eight 16-bit groups, or
 * returns null if `host` is not an IPv6 literal. Handles "::" zero-compression and a trailing
 * embedded IPv4 (e.g. ::ffff:169.254.169.254), which is how IPv4-mapped/compatible addresses smuggle
 * an IPv4 target into an IPv6 literal. WHATWG normalization usually rewrites the dotted tail to hex,
 * but both spellings are handled so the classifiers are robust either way.
 */
function parseIPv6(host: string): number[] | null {
  if (host.indexOf(":") === -1) {
    return null;
  }

  let text = host;
  let embedded: number[] | null = null;

  // Split off a trailing embedded IPv4 (the dotted a.b.c.d tail of ::ffff:a.b.c.d / ::a.b.c.d).
  if (text.indexOf(".") !== -1) {
    const lastColon = text.lastIndexOf(":");
    if (lastColon === -1) {
      return null;
    }
    const v4 = parseIPv4(text.slice(lastColon + 1));
    if (!v4) {
      return null;
    }
    embedded = [(v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]];
    text = text.slice(0, lastColon);
  }

  const parseGroups = (segment: string): number[] | null => {
    if (segment === "") {
      return [];
    }
    const groups: number[] = [];
    for (const g of segment.split(":")) {
      if (!/^[0-9a-f]{1,4}$/.test(g)) {
        return null;
      }
      groups.push(parseInt(g, 16));
    }
    return groups;
  };

  const halves = text.split("::");
  if (halves.length > 2) {
    return null;
  }

  const head = parseGroups(halves[0]);
  if (head === null) {
    return null;
  }
  let tail = halves.length === 2 ? parseGroups(halves[1]) : [];
  if (tail === null) {
    return null;
  }
  if (embedded) {
    tail = tail.concat(embedded);
  }

  if (halves.length === 2) {
    const missing = 8 - head.length - tail.length;
    if (missing < 0) {
      return null;
    }
    return head.concat(new Array(missing).fill(0)).concat(tail);
  }

  const full = head.concat(tail);
  return full.length === 8 ? full : null;
}

/**
 * Returns the IPv4 octets carried by an IPv4-mapped (::ffff:a.b.c.d) or IPv4-compatible (::a.b.c.d)
 * IPv6 literal, so such an address is classified by its embedded IPv4 rather than slipping past the
 * IPv4 checks. Returns null for any other IPv6 address.
 */
function embeddedIPv4(groups: number[]): number[] | null {
  const first5Zero = groups.slice(0, 5).every((g) => g === 0);
  if (!first5Zero) {
    return null;
  }
  const isMapped = groups[5] === 0xffff;
  const isCompat = groups[5] === 0 && (groups[6] !== 0 || groups[7] !== 0);
  if (!isMapped && !isCompat) {
    return null;
  }
  return [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff];
}

/** Resolves a hostname to IPv4 octets when it is an IPv4 literal, directly or embedded in an IPv6 literal. */
function hostAsIPv4(hostname: string): number[] | null {
  const direct = parseIPv4(hostname);
  if (direct) {
    return direct;
  }
  const ipv6 = parseIPv6(hostname);
  return ipv6 ? embeddedIPv4(ipv6) : null;
}

/** True for IPv4 addresses in a loopback, link-local, or private (RFC 1918) range that must not be reached. */
function isPrivateIPv4(o: number[]): boolean {
  // Loopback 127.0.0.0/8.
  if (o[0] === 127) {
    return true;
  }
  // Link-local 169.254.0.0/16 (also covers the cloud metadata address).
  if (o[0] === 169 && o[1] === 254) {
    return true;
  }
  // RFC 1918 private: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16.
  if (o[0] === 10) {
    return true;
  }
  if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) {
    return true;
  }
  if (o[0] === 192 && o[1] === 168) {
    return true;
  }
  // "This host on this network" 0.0.0.0/8 -- 0.0.0.0 routes to localhost on many stacks, a common
  // SSRF loopback bypass, so it is blocked alongside the ranges above.
  if (o[0] === 0) {
    return true;
  }
  return false;
}

/** True for IPv6 loopback (::1), unspecified (::), link-local (fe80::/10), or unique-local (fc00::/7) addresses. */
function isPrivateIPv6(groups: number[]): boolean {
  // Loopback ::1.
  if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) {
    return true;
  }
  // Unspecified ::.
  if (groups.every((g) => g === 0)) {
    return true;
  }
  // Link-local fe80::/10 (fe80–febf in the first hextet).
  if ((groups[0] & 0xffc0) === 0xfe80) {
    return true;
  }
  // Unique local address fc00::/7 (fc00–fdff in the first hextet).
  if ((groups[0] & 0xfe00) === 0xfc00) {
    return true;
  }
  return false;
}

/**
 * True only for the cloud metadata address 169.254.169.254 (as a plain IPv4 literal or embedded in
 * an IPv4-mapped/compatible IPv6 literal). Kept separate from the general private/link-local block
 * so it can be enforced unconditionally, even when `allowPrivateNetworkEndpoints` is set.
 */
function isCloudMetadataHost(hostname: string): boolean {
  const ipv4 = hostAsIPv4(hostname);
  return !!ipv4 && ipv4[0] === 169 && ipv4[1] === 254 && ipv4[2] === 169 && ipv4[3] === 254;
}

/** True for hostnames that must be blocked by default: named localhost, or any private/loopback/link-local IP literal. */
function isPrivateOrLocalHost(hostname: string): boolean {
  // Named loopback (localhost and any *.localhost subdomain, per RFC 6761).
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    return true;
  }
  const ipv4 = hostAsIPv4(hostname);
  if (ipv4) {
    return isPrivateIPv4(ipv4);
  }
  const ipv6 = parseIPv6(hostname);
  if (ipv6) {
    return isPrivateIPv6(ipv6);
  }
  return false;
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
