import { CitationProvider } from "./types";
import { parseCaseCitation, caseNamesMatch } from "./citationParser";
import { supportsRateLimitAwareness } from "./types";

export interface HallucinationCheckResult {
  raw: string;
  /** Name of the provider that verified this citation, or null if none of them could. */
  verifiedVia: string | null;
  /** Providers skipped because they require auth and weren't connected. */
  skippedProviders: string[];
  /** Providers that returned null specifically because of a rate limit, not a genuine miss. */
  rateLimitedProviders: string[];
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
    const skippedProviders: string[] = [];
    const rateLimitedProviders: string[] = [];

    for (const provider of providers) {
      if (provider.requiresAuth && !provider.isAuthenticated()) {
        skippedProviders.push(provider.name);
        continue;
      }
      const match = await provider.lookupCitation(parsed);
      if (match) {
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

    results.push({ raw, verifiedVia, skippedProviders, rateLimitedProviders, nameMismatch });
  }

  return results;
}
