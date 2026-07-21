/**
 * Internal seam for upstream API versioning inside a citation provider.
 *
 * Provider upstream APIs version independently of openclerk-core: CourtListener can ship a v5 (or
 * a law firm's outbound proxy can stay pinned to an older version) without this package cutting a
 * release, and both the URL path segment *and* the response schema change when that happens.
 * Everything version-specific -- the URL, request shaping, and response->CitationMatch parsing --
 * lives behind a per-version adapter that the provider owns internally, selected at
 * authenticate() time and invisible above the provider.
 *
 * The load-bearing invariant: nothing that calls lookupCitation() (the hallucination-check loop,
 * the per-host Online Lookup handlers) may ever branch on an upstream API version. Version is an
 * internal adapter plus a config field on the provider; registry ids stay logical
 * ("courtlistener", never "courtlistener-v4").
 *
 * This seam is deliberately orthogonal to HttpClient (src/http.ts): the adapter describes *which
 * dialect* of request to send by returning a neutral VersionedRequest, and the provider hands it
 * to getHttpClient(), which decides *which transport* sends it (fetch vs. Apps Script's
 * UrlFetchApp). An adapter must never reach for a transport itself -- that orthogonality is what
 * lets every host consume any version adapter unchanged.
 *
 * This is a sibling of the optional-capability idiom in types.ts (OpinionTextCapableProvider,
 * RateLimitAwareProvider): additive, structurally typed, and NOT part of the base
 * CitationProvider contract. HTTP *status* handling (429 rate limits, network failures, non-ok
 * responses) stays in the provider shell -- it is transport-level, not schema-level, and the
 * "never throw from lookup" contract is enforced there, once, for every version.
 */

import { CitationMatch, ParsedCitation } from "./types";
import { HttpRequestInit } from "../http";

/**
 * A fully-shaped HTTP request an adapter wants sent: URL plus the neutral request init the
 * HttpClient seam already understands. Transport-agnostic by construction.
 */
export interface VersionedRequest extends HttpRequestInit {
  url: string;
}

/**
 * The credentials/tokens an adapter may need to shape a request (e.g. an Authorization header).
 * Passed per-call by the owning provider rather than stored on the adapter, so adapters stay
 * stateless and the provider remains the only place credentials live in memory.
 */
export interface AdapterAuthContext {
  /** API token / bearer token held by the owning provider, if any. */
  token?: string | null;
}

export interface ApiVersionAdapter {
  /** The upstream API version this adapter speaks, e.g. "v4". */
  readonly version: string;
  /**
   * Optional deprecation metadata for a version the upstream has scheduled for shutdown, so a
   * host UI can warn users still pinned to it before it stops working.
   */
  readonly deprecated?: { sunsetDate?: string };

  /**
   * Shapes the citation-lookup request for this API version: URL path segment, method, headers,
   * and body encoding all belong here, not in the provider shell.
   */
  buildLookupRequest(citation: ParsedCitation, auth: AdapterAuthContext): VersionedRequest;

  /**
   * Parses this version's response JSON into a CitationMatch (or null for "not found").
   *
   * This is the safety-critical method of the whole seam: schema drift is exactly how a
   * silent-wrong result reappears. A field renamed by an upstream version bump that silently
   * parses as undefined -- no case name to compare -- recreates the false-"verified" failure mode
   * this project already fixed once (see caseNamesMatch in citationParser.ts and the Mata v.
   * Avianca incident it references), just triggered by a version bump instead of a locator
   * mismatch. Each adapter must therefore apply the caseNamesMatch disambiguation gate inside its
   * own parse step, against its own version's field names -- never above the adapter, where the
   * field names are no longer visible. `citation` is passed in for exactly that comparison.
   *
   * `raw` is unknown, not a typed shape: the response is untrusted input whose schema is the very
   * thing this method exists to isolate. Must return null (never throw) for a payload that
   * doesn't match this version's expected shape.
   */
  parseLookupResponse(raw: unknown, citation: ParsedCitation): CitationMatch | null;
}
