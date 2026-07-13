import { CitationMatch, OpinionExcerptResult, OpinionTextCapableProvider, ParsedCitation, ProviderCredentialField, RateLimitAwareProvider } from "./types";
/**
 * Free Law Project's CourtListener (courtlistener.com) citation-lookup API.
 * Free to use, but requires an API token -- as of 2026, CourtListener's v4 API returns 401 for
 * an unauthenticated citation-lookup request (confirmed live; there is no anonymous tier for
 * this endpoint, despite what some documentation examples might suggest). See:
 * https://www.courtlistener.com/help/api/rest/v4/citation-lookup/
 */
export declare class CourtListenerProvider implements OpinionTextCapableProvider, RateLimitAwareProvider {
    readonly id = "courtlistener";
    readonly name = "CourtListener";
    readonly description = "Free Law Project's case-law search. Requires a free CourtListener account and API token.";
    readonly requiresAuth = true;
    readonly credentialFields: ProviderCredentialField[];
    private apiToken;
    private lastRequestWasRateLimited;
    isAuthenticated(): boolean;
    wasLastRequestRateLimited(): boolean;
    authenticate(credentials: Record<string, string>): Promise<void>;
    signOut(): void;
    lookupCitation(citation: ParsedCitation): Promise<CitationMatch | null>;
    /**
     * Opinion text fetching requires an API token even though basic citation lookup doesn't --
     * there's no free anonymous route to full opinion text on CourtListener's v4 API.
     */
    isReadyForOpinionText(): boolean;
    fetchOpinionExcerpt(citation: ParsedCitation, targetPages: number[]): Promise<OpinionExcerptResult>;
    /**
     * Resolves a citation to its CourtListener cluster ID by parsing it out of the citation-lookup
     * result's absolute_url. CourtListener's documented default throttle is a modest 5 requests/
     * minute, 50/hour, 125/day (https://www.courtlistener.com/help/api/rest/) -- fetchOpinionExcerpt
     * makes two requests per citation, so a 429 here is expected to happen in normal use on a
     * document with several pincite citations, not just as a rare edge case.
     */
    private resolveClusterId;
    private request;
}
