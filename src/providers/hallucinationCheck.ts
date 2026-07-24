import { CitationProvider } from "./types";
import { parseCaseCitation, caseNamesMatch } from "./citationParser";
import { supportsRateLimitAwareness, isLinkOnlyProvider } from "./types";

export interface HallucinationCheckResult {
  raw: string;
  /** Name of the provider that verified this citation, or null if none of them could. */
  verifiedVia: string | null;
  /** Providers skipped because they require auth and weren't connected. */
  skippedProviders: string[];
  /** Providers that returned null specifically because of a rate limit, not a genuine miss. */
  rateLimitedProviders: string[];
  /**
   * Providers in the checked list that are link-only (isLinkOnlyProvider) and were therefore never
   * consulted for verification. A link-only provider (LexisNexis/Westlaw/Bloomberg Law) can offer a
   * hyperlink to the citation but cannot confirm it exists, so it can never set `verifiedVia` -- it
   * is quarantined here instead. This field lets a caller still surface "you can link this out via
   * X" without ever conflating a link with a verified match. Presence here says nothing about
   * whether the citation is genuine; only `verifiedVia` does that.
   */
  linkOnlyProviders: string[];
  /**
   * Set when a provider resolved this citation's locator (reporter/volume/page) to a real case,
   * but under a materially different name than the one attached to it here. This is a stronger
   * fabrication signal than a plain miss: the reporter/volume/page is real, just misattributed --
   * exactly the pattern of a citation like "Peterson v. Iran Air, 905 F. Supp. 2d 121 (D.D.C.
   * 2012)" from the real Mata v. Avianca ChatGPT-hallucinated-citations incident, where the
   * locator resolves to a genuine, unrelated case.
   */
  nameMismatch?: { provider: string; foundCaseName: string };
  /**
   * Set when a provider's lookup resolved this citation's locator to more than one distinct
   * candidate case that couldn't be narrowed by case name. A real locator exists, but the
   * confidence signal differs from a clean single-candidate match -- the caller decides what
   * "possible hallucination" means from an ambiguous result, exactly as documented for
   * `nameMismatch` above.
   */
  ambiguousMatch?: { provider: string; candidateCount: number };
}

/**
 * Checks each candidate citation string against a list of providers, in order, stopping at the
 * first one that resolves it to a matching case name. A citation that no provider can verify is
 * reported with `verifiedVia: null` -- the caller decides what "possible hallucination" means
 * from there (e.g. whether to still count it as flagged if every provider that tried was
 * rate-limited).
 *
 * Resolving a citation's locator is not the same as confirming the citation is real: providers
 * like CourtListener's citation-lookup API resolve purely by reporter/volume/page, so they return
 * whatever real case is actually published there regardless of what case name the citation
 * string claims. A non-null CitationProvider#lookupCitation() result is therefore only treated as
 * verification when the provider's returned case name actually corresponds (see caseNamesMatch)
 * to the citation's own parsed case name; a locator that resolves to a different case is reported
 * via `nameMismatch` instead of `verifiedVia`, and the search continues to the next provider. When
 * either name is unavailable to compare (parsing failed, or the provider didn't return one), the
 * match is accepted as before -- this only tightens the case where both names are known.
 *
 * A provider that is link-only (isLinkOnlyProvider -- LexisNexis/Westlaw/Bloomberg Law) is excluded
 * from verification entirely: it can hyperlink a citation but cannot confirm one exists, so it is
 * never called for a match and is reported under `linkOnlyProviders` instead of ever setting
 * `verifiedVia`. This keeps the "link, not verification" boundary in the type system rather than
 * relying on every caller to remember it.
 *
 * This is the pure logic behind the Word add-in's "Find Hallucinations" tab (see
 * checkForHallucinations in word.ts), pulled out so it can also be run outside a Word document --
 * e.g. against text extracted from a PDF -- without depending on Office.js.
 */
export async function checkCitationsForHallucinations(
  candidates: string[],
  providers: CitationProvider[]
): Promise<HallucinationCheckResult[]> {
  const results: HallucinationCheckResult[] = [];

  for (const raw of candidates) {
    const parsed = parseCaseCitation(raw) || { raw };
    let verifiedVia: string | null = null;
    let nameMismatch: { provider: string; foundCaseName: string } | undefined;
    let ambiguousMatch: { provider: string; candidateCount: number } | undefined;
    const skippedProviders: string[] = [];
    const rateLimitedProviders: string[] = [];
    const linkOnlyProviders: string[] = [];

    for (const provider of providers) {
      // A link-only provider (LexisNexis/Westlaw/Bloomberg Law) can produce a hyperlink but never
      // confirms a citation exists: its lookup resolves to *something* even for a fabricated cite,
      // and only behind a signed-in, licensed human (see LinkOnlyProvider in types.ts and the
      // research doc it cites). Treating that as verification would manufacture the exact
      // false-"verified" outcome the Core Value forbids. So it is NEVER a verification source --
      // checked FIRST, before auth/lookup, and recorded as available-for-linking without ever
      // being called for a match.
      if (isLinkOnlyProvider(provider)) {
        linkOnlyProviders.push(provider.name);
        continue;
      }
      if (provider.requiresAuth && !provider.isAuthenticated()) {
        skippedProviders.push(provider.name);
        continue;
      }
      const match = await provider.lookupCitation(parsed);
      if (match) {
        // Finding 4 (02-RESEARCH.md): an ambiguous provider result already means "we couldn't be
        // sure which real case this is" regardless of what match.caseName happens to say, so this
        // check runs BEFORE the case-name-mismatch check below and is a distinct third outcome --
        // never counted as verifiedVia, never as nameMismatch. Purely additive if/continue, no new
        // throw path, preserving FIX-02's never-throw contract.
        if (match.ambiguousMatch) {
          if (!ambiguousMatch) {
            ambiguousMatch = { provider: provider.name, candidateCount: match.ambiguousMatch.candidateCount };
          }
          continue;
        }
        if (!parsed.caseName || !match.caseName || caseNamesMatch(parsed.caseName, match.caseName)) {
          verifiedVia = provider.name;
          break;
        }
        if (!nameMismatch) {
          nameMismatch = { provider: provider.name, foundCaseName: match.caseName };
        }
        continue;
      }
      if (supportsRateLimitAwareness(provider) && provider.wasLastRequestRateLimited()) {
        rateLimitedProviders.push(provider.name);
      }
    }

    // WR-01 (02-REVIEW.md): nameMismatch/ambiguousMatch may have been set by an earlier provider
    // that couldn't confirm the citation, before a later provider in the loop verified it cleanly
    // (verifiedVia set via break). Clear the softer signals once verification succeeds so a caller
    // that checks ambiguousMatch/nameMismatch before verifiedVia doesn't flag a citation a later
    // provider actually confirmed.
    results.push({
      raw,
      verifiedVia,
      skippedProviders,
      rateLimitedProviders,
      linkOnlyProviders,
      nameMismatch: verifiedVia ? undefined : nameMismatch,
      ambiguousMatch: verifiedVia ? undefined : ambiguousMatch,
    });
  }

  return results;
}
