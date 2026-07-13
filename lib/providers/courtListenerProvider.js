"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CourtListenerProvider = void 0;
const opinionTextExtractor_1 = require("./opinionTextExtractor");
const http_1 = require("../http");
const API_BASE = "https://www.courtlistener.com/api/rest/v4";
const SITE_ORIGIN = "https://www.courtlistener.com";
/**
 * Free Law Project's CourtListener (courtlistener.com) citation-lookup API.
 * Free to use, but requires an API token -- as of 2026, CourtListener's v4 API returns 401 for
 * an unauthenticated citation-lookup request (confirmed live; there is no anonymous tier for
 * this endpoint, despite what some documentation examples might suggest). See:
 * https://www.courtlistener.com/help/api/rest/v4/citation-lookup/
 */
class CourtListenerProvider {
    constructor() {
        this.id = "courtlistener";
        this.name = "CourtListener";
        this.description = "Free Law Project's case-law search. Requires a free CourtListener account and API token.";
        this.requiresAuth = true;
        this.credentialFields = [
            {
                key: "apiToken",
                label: "API token",
                type: "password",
                placeholder: "Paste your CourtListener API token",
                required: true,
            },
        ];
        this.apiToken = null;
        // CourtListener's documented default rate limit is a modest 5 requests/minute (50/hour,
        // 125/day) -- https://www.courtlistener.com/help/api/rest/ -- so hitting it partway through
        // scanning a document with several dozen citations is expected in normal use, not an edge
        // case. This tracks whether the most recent lookupCitation() call's null result was actually
        // a 429, so callers can tell "rate-limited, retry later" apart from "genuinely not found".
        this.lastRequestWasRateLimited = false;
    }
    isAuthenticated() {
        return this.apiToken !== null;
    }
    wasLastRequestRateLimited() {
        return this.lastRequestWasRateLimited;
    }
    async authenticate(credentials) {
        const token = (credentials.apiToken || "").trim();
        if (!token) {
            this.apiToken = null;
            throw new Error("CourtListener requires an API token.");
        }
        const response = await this.request(token, "1 U.S. 1");
        if (response.status === 401 || response.status === 403) {
            throw new Error("CourtListener rejected the supplied API token.");
        }
        this.apiToken = token;
    }
    signOut() {
        this.apiToken = null;
    }
    async lookupCitation(citation) {
        this.lastRequestWasRateLimited = false;
        if (!this.apiToken) {
            return null;
        }
        const text = citation.raw.trim();
        if (!text) {
            return null;
        }
        let response;
        try {
            response = await this.request(this.apiToken, text);
        }
        catch {
            return null;
        }
        if (response.status === 429) {
            this.lastRequestWasRateLimited = true;
            return null;
        }
        if (!response.ok) {
            return null;
        }
        let results;
        try {
            results = await response.json();
        }
        catch {
            return null;
        }
        if (!Array.isArray(results)) {
            return null;
        }
        for (const result of results) {
            if (result.status !== 200 || !Array.isArray(result.clusters) || result.clusters.length === 0) {
                continue;
            }
            const cluster = result.clusters[0];
            if (!cluster.absolute_url) {
                continue;
            }
            return {
                url: `${SITE_ORIGIN}${cluster.absolute_url}`,
                caseName: cluster.case_name,
                citation: result.citation,
            };
        }
        return null;
    }
    /**
     * Opinion text fetching requires an API token even though basic citation lookup doesn't --
     * there's no free anonymous route to full opinion text on CourtListener's v4 API.
     */
    isReadyForOpinionText() {
        return this.apiToken !== null;
    }
    async fetchOpinionExcerpt(citation, targetPages) {
        if (!this.apiToken || targetPages.length === 0) {
            return { excerpt: null };
        }
        const text = citation.raw.trim();
        if (!text) {
            return { excerpt: null };
        }
        const clusterResult = await this.resolveClusterId(text);
        if (clusterResult.rateLimited) {
            return { excerpt: null, rateLimited: true };
        }
        if (!clusterResult.clusterId) {
            return { excerpt: null };
        }
        let opinions;
        try {
            const response = await (0, http_1.getHttpClient)().fetch(`${API_BASE}/opinions/?cluster=${encodeURIComponent(clusterResult.clusterId)}`, {
                headers: { Authorization: `Token ${this.apiToken}` },
            });
            if (response.status === 429) {
                return { excerpt: null, rateLimited: true };
            }
            if (!response.ok) {
                return { excerpt: null };
            }
            const data = await response.json();
            opinions = Array.isArray(data.results) ? data.results : [];
        }
        catch {
            return { excerpt: null };
        }
        for (const opinion of opinions) {
            const source = opinion.plain_text ||
                (0, opinionTextExtractor_1.stripHtmlTags)(opinion.html_with_citations || opinion.html || opinion.html_lawbox || opinion.html_columbia || "");
            if (!source) {
                continue;
            }
            const excerpt = (0, opinionTextExtractor_1.extractPageExcerpt)(source, targetPages);
            if (excerpt) {
                return { excerpt };
            }
        }
        return { excerpt: null };
    }
    /**
     * Resolves a citation to its CourtListener cluster ID by parsing it out of the citation-lookup
     * result's absolute_url. CourtListener's documented default throttle is a modest 5 requests/
     * minute, 50/hour, 125/day (https://www.courtlistener.com/help/api/rest/) -- fetchOpinionExcerpt
     * makes two requests per citation, so a 429 here is expected to happen in normal use on a
     * document with several pincite citations, not just as a rare edge case.
     */
    async resolveClusterId(text) {
        let response;
        try {
            response = await this.request(this.apiToken, text);
        }
        catch {
            return { clusterId: null };
        }
        if (response.status === 429) {
            return { clusterId: null, rateLimited: true };
        }
        if (!response.ok) {
            return { clusterId: null };
        }
        let results;
        try {
            results = await response.json();
        }
        catch {
            return { clusterId: null };
        }
        if (!Array.isArray(results)) {
            return { clusterId: null };
        }
        for (const result of results) {
            if (result.status !== 200 || !Array.isArray(result.clusters) || result.clusters.length === 0) {
                continue;
            }
            const absoluteUrl = result.clusters[0].absolute_url;
            const idMatch = absoluteUrl && absoluteUrl.match(/^\/opinion\/(\d+)\//);
            if (idMatch) {
                return { clusterId: idMatch[1] };
            }
        }
        return { clusterId: null };
    }
    request(token, text) {
        const headers = {
            "Content-Type": "application/x-www-form-urlencoded",
        };
        if (token) {
            headers["Authorization"] = `Token ${token}`;
        }
        return (0, http_1.getHttpClient)().fetch(`${API_BASE}/citation-lookup/`, {
            method: "POST",
            headers,
            body: new URLSearchParams({ text }),
        });
    }
}
exports.CourtListenerProvider = CourtListenerProvider;
