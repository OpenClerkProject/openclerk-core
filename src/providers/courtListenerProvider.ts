import {
  CitationMatch,
  OpinionExcerptResult,
  OpinionTextCapableProvider,
  ParsedCitation,
  ProviderCredentialField,
  RateLimitAwareProvider,
} from "./types";
import { AdapterAuthContext, ApiVersionAdapter, VersionedRequest } from "./apiVersionAdapter";
import { extractPageExcerpt, stripHtmlTags } from "./opinionTextExtractor";
import { getHttpClient, HttpResponse } from "../http";
import { caseNamesMatch } from "./citationParser";

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
 * Result of parsing a citation-lookup response down to the cluster ID needed for the opinions
 * endpoint. `ambiguousMatch` mirrors CitationMatch.ambiguousMatch: set when the locator resolved
 * to multiple candidate cases and case-name matching couldn't narrow it to exactly one.
 */
interface ClusterIdResolution {
  clusterId: string | null;
  ambiguousMatch?: { candidateCount: number };
}

/**
 * CourtListener's version adapter contract. Extends the base ApiVersionAdapter with the
 * opinion-text build/parse methods this provider needs because it is OpinionTextCapable -- the
 * opinions endpoint's URL and response schema are just as version-specific as citation lookup.
 * HTTP status handling (429, network failure, non-ok) is NOT here: that stays in the provider
 * shell, per apiVersionAdapter.ts.
 */
interface CourtListenerVersionAdapter extends ApiVersionAdapter {
  /**
   * Parses a citation-lookup response down to the cluster ID for the opinions endpoint,
   * applying the same case-name disambiguation gate as parseLookupResponse (CR-01: an ambiguous
   * locator must surface ambiguousMatch, never a best-guess cluster ID -- attaching the wrong
   * case's opinion text is a stronger "false verified" failure than a wrong hyperlink).
   */
  parseClusterId(raw: unknown, caseName?: string): ClusterIdResolution;
  buildOpinionsRequest(clusterId: string, auth: AdapterAuthContext): VersionedRequest;
  /**
   * Extracts the candidate opinion-text sources (plain text preferred, else tag-stripped HTML)
   * from this version's opinions-endpoint response, in response order. Page-excerpt extraction
   * itself is version-agnostic and stays in the provider.
   */
  parseOpinionTexts(raw: unknown): string[];
}

/**
 * Speaks CourtListener's REST API v4 -- the current stable version, and the provider's default.
 * Everything v4-specific lives here: the /api/rest/v4 path segment, the form-encoded
 * citation-lookup POST, and the response schemas (`clusters`, `absolute_url`, `case_name`,
 * `plain_text`, ...). The day CourtListener ships a v5, a CourtListenerV5Adapter goes beside this
 * class and nothing else in this file -- and nothing in any consumer -- changes.
 *
 * Golden-fixture coverage: tests/courtListenerAdapter.test.ts asserts this adapter still parses
 * a captured v4 payload (tests/fixtures/courtlistener/) into the expected CitationMatch. That
 * fixture test is what catches silent schema drift -- a renamed upstream field parsing as
 * undefined -- before it ships; keep it in step with any change here.
 */
export class CourtListenerV4Adapter implements CourtListenerVersionAdapter {
  readonly version = "v4";

  private readonly apiBase = "https://www.courtlistener.com/api/rest/v4";

  buildLookupRequest(citation: ParsedCitation, auth: AdapterAuthContext): VersionedRequest {
    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
    };
    if (auth.token) {
      headers["Authorization"] = `Token ${auth.token}`;
    }

    return {
      url: `${this.apiBase}/citation-lookup/`,
      method: "POST",
      headers,
      body: new URLSearchParams({ text: citation.raw.trim() }),
    };
  }

  parseLookupResponse(raw: unknown, citation: ParsedCitation): CitationMatch | null {
    if (!Array.isArray(raw)) {
      return null;
    }
    const results = raw as CourtListenerCitationResult[];

    for (const result of results) {
      if (result.status !== 200 || !Array.isArray(result.clusters) || result.clusters.length === 0) {
        continue;
      }

      // Finding 4 (02-RESEARCH.md): a locator can genuinely resolve to more than one real case
      // (e.g. duplicate/parallel citation records). Silently taking clusters[0] here would be the
      // exact "false verified" outcome this project's Core Value forbids. Try to disambiguate by
      // case name first (reusing the same caseNamesMatch the hallucination check itself trusts);
      // only flag ambiguousMatch when that can't narrow it to exactly one candidate. This gate
      // lives inside the adapter's parse step on purpose: it compares against v4's `case_name`
      // field, and a future version's adapter must re-apply it against its own field names.
      if (result.clusters.length > 1) {
        const named = citation.caseName
          ? result.clusters.filter((c) => c.case_name && caseNamesMatch(citation.caseName!, c.case_name))
          : [];
        const disambiguated = named.length === 1 ? named[0] : undefined;
        // WR-02 (02-REVIEW.md): when named.length > 1 (multiple clusters' case names match the
        // citing document's own case name), prefer a name-matched candidate over an unfiltered
        // fallback -- whichever cluster happens to be first in the raw response may not even be
        // one of the `named` candidates, a strictly worse guess than picking from `named` itself.
        const bestGuess = disambiguated ?? named.find((c) => c.absolute_url) ?? result.clusters.find((c) => c.absolute_url);
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
   * CR-01 (02-REVIEW.md): applies the same disambiguation as parseLookupResponse's
   * clusters.length > 1 branch -- a locator can genuinely resolve to more than one real case
   * (e.g. duplicate/parallel citation records). Silently taking clusters[0] here would let
   * fetchOpinionExcerpt attach the wrong case's opinion text into the document, a stronger
   * "false verified" failure than a wrong hyperlink. Try to disambiguate by case name first;
   * only report ambiguousMatch when that can't narrow it to exactly one candidate.
   */
  parseClusterId(raw: unknown, caseName?: string): ClusterIdResolution {
    if (!Array.isArray(raw)) {
      return { clusterId: null };
    }
    const results = raw as CourtListenerCitationResult[];

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

  buildOpinionsRequest(clusterId: string, auth: AdapterAuthContext): VersionedRequest {
    return {
      url: `${this.apiBase}/opinions/?cluster=${encodeURIComponent(clusterId)}`,
      headers: { Authorization: `Token ${auth.token}` },
    };
  }

  parseOpinionTexts(raw: unknown): string[] {
    const data = (raw ?? {}) as CourtListenerOpinionsResponse;
    const opinions = Array.isArray(data.results) ? data.results : [];

    const sources: string[] = [];
    for (const opinion of opinions) {
      const source =
        opinion.plain_text ||
        stripHtmlTags(opinion.html_with_citations || opinion.html || opinion.html_lawbox || opinion.html_columbia || "");
      if (source) {
        sources.push(source);
      }
    }
    return sources;
  }
}

/**
 * The API versions this provider can speak, keyed by version string. Adding a future version is
 * one new adapter class plus one entry (and its select option below) -- nothing in the provider
 * shell or in any consumer changes.
 */
const API_VERSION_ADAPTERS: ReadonlyMap<string, CourtListenerVersionAdapter> = new Map<string, CourtListenerVersionAdapter>([
  ["v4", new CourtListenerV4Adapter()],
]);

/**
 * The current stable version. Defaulting here (rather than requiring the field) is what
 * preserves existing behavior on upgrade: a host that never sends apiVersion keeps getting v4.
 */
const DEFAULT_API_VERSION = "v4";

/**
 * Free Law Project's CourtListener (courtlistener.com) citation-lookup API.
 * Free to use, but requires an API token -- as of 2026, CourtListener's v4 API returns 401 for
 * an unauthenticated citation-lookup request (confirmed live; there is no anonymous tier for
 * this endpoint, despite what some documentation examples might suggest). See:
 * https://www.courtlistener.com/help/api/rest/v4/citation-lookup/
 *
 * Version-specific details (URL path segment, request shaping, response-schema parsing) live in
 * the per-version adapters above (see apiVersionAdapter.ts for the seam's rationale); this class
 * is the version-agnostic shell: credential lifecycle, HTTP status handling (429/ok), and the
 * never-throw lookup contract. The active version is selected via the optional "apiVersion"
 * credential field at authenticate() time; explicit config wins, otherwise the stable default.
 * Auto-detection is deliberately not attempted -- a probe request against an API with a 5 req/min
 * default throttle is a real cost, not a convenience.
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
    // Axis-A version selection surfaced through the existing credential-field rendering path --
    // an ordinary optional field, zero new UI plumbing in the hosts. A config enum, not a secret,
    // hence "select" rather than a free-text box. Leaving it blank means DEFAULT_API_VERSION.
    {
      key: "apiVersion",
      label: "API version",
      type: "select",
      options: [{ value: "v4", label: "v4 (current)" }],
      required: false,
    },
  ];

  private apiToken: string | null = null;
  private adapter: CourtListenerVersionAdapter = API_VERSION_ADAPTERS.get(DEFAULT_API_VERSION)!;
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

    // Version selection is setup-time validation, so an unsupported value throws a descriptive
    // Error here (per this module's error-handling convention) instead of silently degrading to
    // the default -- a firm that explicitly pinned a version should hear that it isn't supported,
    // not get quietly different behavior.
    const requestedVersion = (credentials.apiVersion || "").trim() || DEFAULT_API_VERSION;
    const adapter = API_VERSION_ADAPTERS.get(requestedVersion);
    if (!adapter) {
      const supported = Array.from(API_VERSION_ADAPTERS.keys()).join(", ");
      throw new Error(`Unsupported CourtListener API version "${requestedVersion}". Supported: ${supported}.`);
    }

    // WR-03 (02-REVIEW.md): wrap the verification request so a network failure surfaces the
    // module's documented descriptive Error at setup time (per CLAUDE.md's error-handling
    // convention) rather than whatever raw error the fetch implementation throws. The probe uses
    // the *requested* adapter so the token is verified against the version it will actually be
    // used with.
    let response: HttpResponse;
    try {
      response = await this.send(adapter.buildLookupRequest({ raw: "1 U.S. 1" }, { token }));
    } catch {
      throw new Error("Could not reach CourtListener to verify the API token.");
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error("CourtListener rejected the supplied API token.");
    }
    // WR-03: any other non-ok response (500, 429, malformed response, etc.) means the token was
    // never actually confirmed valid -- do not silently store (and later use) an unverified token.
    if (!response.ok) {
      throw new Error("Could not verify the API token; CourtListener returned an unexpected response.");
    }

    this.apiToken = token;
    this.adapter = adapter;
  }

  signOut(): void {
    this.apiToken = null;
    // The version choice arrived with the credentials, so it leaves with them.
    this.adapter = API_VERSION_ADAPTERS.get(DEFAULT_API_VERSION)!;
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
      response = await this.send(this.adapter.buildLookupRequest(citation, { token: this.apiToken }));
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

    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      return null;
    }

    return this.adapter.parseLookupResponse(raw, citation);
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

    const clusterResult = await this.resolveClusterId(citation);
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

    let sources: string[];
    try {
      const response = await this.send(this.adapter.buildOpinionsRequest(clusterResult.clusterId, { token: this.apiToken }));
      if (response.status === 429) {
        return { excerpt: null, rateLimited: true };
      }
      if (!response.ok) {
        return { excerpt: null };
      }
      sources = this.adapter.parseOpinionTexts(await response.json());
    } catch {
      return { excerpt: null };
    }

    for (const source of sources) {
      const excerpt = extractPageExcerpt(source, targetPages);
      if (excerpt) {
        return { excerpt };
      }
    }

    return { excerpt: null };
  }

  /**
   * Resolves a citation to its CourtListener cluster ID via the citation-lookup endpoint.
   * CourtListener's documented default throttle is a modest 5 requests/minute, 50/hour, 125/day
   * (https://www.courtlistener.com/help/api/rest/) -- fetchOpinionExcerpt makes two requests per
   * citation, so a 429 here is expected to happen in normal use on a document with several
   * pincite citations, not just as a rare edge case. Status handling lives here; the
   * schema-specific parsing (including the CR-01 ambiguity gate) is the adapter's parseClusterId.
   */
  private async resolveClusterId(
    citation: ParsedCitation
  ): Promise<ClusterIdResolution & { rateLimited?: boolean }> {
    let response: HttpResponse;
    try {
      response = await this.send(this.adapter.buildLookupRequest(citation, { token: this.apiToken }));
    } catch {
      return { clusterId: null };
    }

    if (response.status === 429) {
      return { clusterId: null, rateLimited: true };
    }
    if (!response.ok) {
      return { clusterId: null };
    }

    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      return { clusterId: null };
    }

    return this.adapter.parseClusterId(raw, citation.caseName);
  }

  /**
   * Hands an adapter-shaped request to whichever transport the host installed. The adapter
   * decided the dialect; the HttpClient decides the transport -- keep those orthogonal (never
   * let an adapter fetch for itself).
   */
  private send(request: VersionedRequest): Promise<HttpResponse> {
    const { url, ...init } = request;
    return getHttpClient().fetch(url, init);
  }
}
