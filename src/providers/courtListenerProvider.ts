import {
  CitationMatch,
  OpinionExcerptResult,
  OpinionTextCapableProvider,
  ParsedCitation,
  ProviderCredentialField,
  RateLimitAwareProvider,
} from "./types";
import { extractPageExcerpt, stripHtmlTags } from "./opinionTextExtractor";
import { getHttpClient, HttpResponse } from "../http";
import { caseNamesMatch } from "./citationParser";

const API_BASE = "https://www.courtlistener.com/api/rest/v4";
const SITE_ORIGIN = "https://www.courtlistener.com";

interface CourtListenerCluster {
  case_name?: string;
  absolute_url?: string;
}

interface CourtListenerCitationResult {
  citation?: string;
  status?: number;
  clusters?: CourtListenerCluster[];
}

interface CourtListenerOpinion {
  plain_text?: string;
  html_with_citations?: string;
  html?: string;
  html_lawbox?: string;
  html_columbia?: string;
}

interface CourtListenerOpinionsResponse {
  results?: CourtListenerOpinion[];
}

/**
 * Free Law Project's CourtListener (courtlistener.com) citation-lookup API.
 * Free to use, but requires an API token -- as of 2026, CourtListener's v4 API returns 401 for
 * an unauthenticated citation-lookup request (confirmed live; there is no anonymous tier for
 * this endpoint, despite what some documentation examples might suggest). See:
 * https://www.courtlistener.com/help/api/rest/v4/citation-lookup/
 */
export class CourtListenerProvider implements OpinionTextCapableProvider, RateLimitAwareProvider {
  readonly id = "courtlistener";
  readonly name = "CourtListener";
  readonly description = "Free Law Project's case-law search. Requires a free CourtListener account and API token.";
  readonly requiresAuth = true;
  readonly credentialFields: ProviderCredentialField[] = [
    {
      key: "apiToken",
      label: "API token",
      type: "password",
      placeholder: "Paste your CourtListener API token",
      required: true,
    },
  ];

  private apiToken: string | null = null;
  // CourtListener's documented default rate limit is a modest 5 requests/minute (50/hour,
  // 125/day) -- https://www.courtlistener.com/help/api/rest/ -- so hitting it partway through
  // scanning a document with several dozen citations is expected in normal use, not an edge
  // case. This tracks whether the most recent lookupCitation() call's null result was actually
  // a 429, so callers can tell "rate-limited, retry later" apart from "genuinely not found".
  private lastRequestWasRateLimited = false;

  isAuthenticated(): boolean {
    return this.apiToken !== null;
  }

  wasLastRequestRateLimited(): boolean {
    return this.lastRequestWasRateLimited;
  }

  async authenticate(credentials: Record<string, string>): Promise<void> {
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

  signOut(): void {
    this.apiToken = null;
  }

  async lookupCitation(citation: ParsedCitation): Promise<CitationMatch | null> {
    this.lastRequestWasRateLimited = false;

    if (!this.apiToken) {
      return null;
    }

    const text = citation.raw.trim();
    if (!text) {
      return null;
    }

    let response: HttpResponse;
    try {
      response = await this.request(this.apiToken, text);
    } catch {
      return null;
    }

    if (response.status === 429) {
      this.lastRequestWasRateLimited = true;
      return null;
    }

    if (!response.ok) {
      return null;
    }

    let results: CourtListenerCitationResult[];
    try {
      results = await response.json();
    } catch {
      return null;
    }

    if (!Array.isArray(results)) {
      return null;
    }

    for (const result of results) {
      if (result.status !== 200 || !Array.isArray(result.clusters) || result.clusters.length === 0) {
        continue;
      }

      // Finding 4 (02-RESEARCH.md): a locator can genuinely resolve to more than one real case
      // (e.g. duplicate/parallel citation records). Silently taking clusters[0] here would be the
      // exact "false verified" outcome this project's Core Value forbids. Try to disambiguate by
      // case name first (reusing the same caseNamesMatch the hallucination check itself trusts);
      // only flag ambiguousMatch when that can't narrow it to exactly one candidate.
      if (result.clusters.length > 1) {
        const named = citation.caseName
          ? result.clusters.filter((c) => c.case_name && caseNamesMatch(citation.caseName!, c.case_name))
          : [];
        const disambiguated = named.length === 1 ? named[0] : undefined;
        const bestGuess = disambiguated ?? result.clusters.find((c) => c.absolute_url);
        if (!bestGuess || !bestGuess.absolute_url) {
          continue;
        }
        const match: CitationMatch = {
          url: `${SITE_ORIGIN}${bestGuess.absolute_url}`,
          caseName: bestGuess.case_name,
          citation: result.citation,
        };
        if (!disambiguated) {
          match.ambiguousMatch = { candidateCount: result.clusters.length };
        }
        return match;
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
  isReadyForOpinionText(): boolean {
    return this.apiToken !== null;
  }

  async fetchOpinionExcerpt(citation: ParsedCitation, targetPages: number[]): Promise<OpinionExcerptResult> {
    if (!this.apiToken || targetPages.length === 0) {
      return { excerpt: null };
    }

    const text = citation.raw.trim();
    if (!text) {
      return { excerpt: null };
    }

    const clusterResult = await this.resolveClusterId(text, citation.caseName);
    if (clusterResult.rateLimited) {
      return { excerpt: null, rateLimited: true };
    }
    // CR-01 (02-REVIEW.md): a locator that resolved to more than one distinct candidate case,
    // with case-name matching unable to narrow it to exactly one, must not silently proceed to
    // fetch and return that best-guess candidate's opinion text -- attaching the wrong case's
    // text into the document under this citation would be a stronger, more damaging version of
    // the "false verified" problem than a wrong hyperlink (fabricated-looking supporting text,
    // not just a bad link).
    if (clusterResult.ambiguousMatch) {
      return { excerpt: null, ambiguousMatch: clusterResult.ambiguousMatch };
    }
    if (!clusterResult.clusterId) {
      return { excerpt: null };
    }

    let opinions: CourtListenerOpinion[];
    try {
      const response = await getHttpClient().fetch(`${API_BASE}/opinions/?cluster=${encodeURIComponent(clusterResult.clusterId)}`, {
        headers: { Authorization: `Token ${this.apiToken}` },
      });
      if (response.status === 429) {
        return { excerpt: null, rateLimited: true };
      }
      if (!response.ok) {
        return { excerpt: null };
      }
      const data: CourtListenerOpinionsResponse = await response.json();
      opinions = Array.isArray(data.results) ? data.results : [];
    } catch {
      return { excerpt: null };
    }

    for (const opinion of opinions) {
      const source =
        opinion.plain_text ||
        stripHtmlTags(opinion.html_with_citations || opinion.html || opinion.html_lawbox || opinion.html_columbia || "");
      if (!source) {
        continue;
      }
      const excerpt = extractPageExcerpt(source, targetPages);
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
   *
   * CR-01 (02-REVIEW.md): applies the same disambiguation as lookupCitation's clusters.length > 1
   * branch -- a locator can genuinely resolve to more than one real case (e.g. duplicate/parallel
   * citation records). Silently taking clusters[0] here would let fetchOpinionExcerpt attach the
   * wrong case's opinion text into the document, a stronger "false verified" failure than a wrong
   * hyperlink. Try to disambiguate by case name first; only report ambiguousMatch when that can't
   * narrow it to exactly one candidate.
   */
  private async resolveClusterId(
    text: string,
    caseName?: string
  ): Promise<{ clusterId: string | null; rateLimited?: boolean; ambiguousMatch?: { candidateCount: number } }> {
    let response: HttpResponse;
    try {
      response = await this.request(this.apiToken, text);
    } catch {
      return { clusterId: null };
    }

    if (response.status === 429) {
      return { clusterId: null, rateLimited: true };
    }
    if (!response.ok) {
      return { clusterId: null };
    }

    let results: CourtListenerCitationResult[];
    try {
      results = await response.json();
    } catch {
      return { clusterId: null };
    }

    if (!Array.isArray(results)) {
      return { clusterId: null };
    }

    for (const result of results) {
      if (result.status !== 200 || !Array.isArray(result.clusters) || result.clusters.length === 0) {
        continue;
      }

      if (result.clusters.length > 1) {
        const named = caseName
          ? result.clusters.filter((c) => c.case_name && caseNamesMatch(caseName, c.case_name))
          : [];
        const disambiguated = named.length === 1 ? named[0] : undefined;
        if (!disambiguated) {
          // WR-02 (02-REVIEW.md) applies here too, but there is no "bestGuess" to return for the
          // opinion-text path -- fetchOpinionExcerpt refuses to fetch at all once ambiguousMatch
          // is set, so the candidateCount is all that's surfaced.
          return { clusterId: null, ambiguousMatch: { candidateCount: result.clusters.length } };
        }
        const absoluteUrl = disambiguated.absolute_url;
        const idMatch = absoluteUrl && absoluteUrl.match(/^\/opinion\/(\d+)\//);
        if (idMatch) {
          return { clusterId: idMatch[1] };
        }
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

  private request(token: string | null, text: string): Promise<HttpResponse> {
    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
    };
    if (token) {
      headers["Authorization"] = `Token ${token}`;
    }

    return getHttpClient().fetch(`${API_BASE}/citation-lookup/`, {
      method: "POST",
      headers,
      body: new URLSearchParams({ text }),
    });
  }
}
