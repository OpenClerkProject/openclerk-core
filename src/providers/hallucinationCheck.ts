import { CitationProvider } from "./types";
import { parseCaseCitation } from "./citationParser";
import { supportsRateLimitAwareness } from "./types";

export interface HallucinationCheckResult {
  raw: string;
  /** Name of the provider that verified this citation, or null if none of them could. */
  verifiedVia: string | null;
  /** Providers skipped because they require auth and weren't connected. */
  skippedProviders: string[];
  /** Providers that returned null specifically because of a rate limit, not a genuine miss. */
  rateLimitedProviders: string[];
}

/**
 * Checks each candidate citation string against a list of providers, in order, stopping at the
 * first one that resolves it. A citation that no provider can verify is reported with
 * `verifiedVia: null` -- the caller decides what "possible hallucination" means from there (e.g.
 * whether to still count it as flagged if every provider that tried was rate-limited).
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
    const skippedProviders: string[] = [];
    const rateLimitedProviders: string[] = [];

    for (const provider of providers) {
      if (provider.requiresAuth && !provider.isAuthenticated()) {
        skippedProviders.push(provider.name);
        continue;
      }
      const match = await provider.lookupCitation(parsed);
      if (match) {
        verifiedVia = provider.name;
        break;
      }
      if (supportsRateLimitAwareness(provider) && provider.wasLastRequestRateLimited()) {
        rateLimitedProviders.push(provider.name);
      }
    }

    results.push({ raw, verifiedVia, skippedProviders, rateLimitedProviders });
  }

  return results;
}
