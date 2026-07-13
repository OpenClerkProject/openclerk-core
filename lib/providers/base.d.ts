import { CitationProvider, CitationMatch, ParsedCitation, ProviderCredentialField } from "./types";
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
export declare abstract class EnterpriseCitationProvider implements CitationProvider {
    abstract readonly id: string;
    abstract readonly name: string;
    abstract readonly description: string;
    abstract readonly credentialFields: ProviderCredentialField[];
    readonly requiresAuth = true;
    protected credentials: Record<string, string> | null;
    isAuthenticated(): boolean;
    authenticate(credentials: Record<string, string>): Promise<void>;
    signOut(): void;
    /** Subclasses perform the vendor-specific handshake (e.g. OAuth2 client-credentials) and throw on failure. */
    protected abstract verifyCredentials(credentials: Record<string, string>): Promise<void>;
    abstract lookupCitation(citation: ParsedCitation): Promise<CitationMatch | null>;
}
export declare function trimTrailingSlash(value: string): string;
/**
 * Performs an OAuth2 client-credentials handshake, the pattern most
 * enterprise legal research APIs use for machine-to-machine access. Returns
 * the bearer token on success; throws on any non-2xx response or missing
 * access_token so callers can surface a clear "authentication failed" error.
 */
export declare function fetchClientCredentialsToken(tokenUrl: string, clientId: string, clientSecret: string): Promise<string>;
