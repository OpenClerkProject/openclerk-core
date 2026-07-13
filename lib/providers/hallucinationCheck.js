"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkCitationsForHallucinations = checkCitationsForHallucinations;
const citationParser_1 = require("./citationParser");
const types_1 = require("./types");
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
async function checkCitationsForHallucinations(candidates, providers) {
    const results = [];
    for (const raw of candidates) {
        const parsed = (0, citationParser_1.parseCaseCitation)(raw) || { raw };
        let verifiedVia = null;
        let nameMismatch;
        const skippedProviders = [];
        const rateLimitedProviders = [];
        for (const provider of providers) {
            if (provider.requiresAuth && !provider.isAuthenticated()) {
                skippedProviders.push(provider.name);
                continue;
            }
            const match = await provider.lookupCitation(parsed);
            if (match) {
                if (!parsed.caseName || !match.caseName || (0, citationParser_1.caseNamesMatch)(parsed.caseName, match.caseName)) {
                    verifiedVia = provider.name;
                    break;
                }
                if (!nameMismatch) {
                    nameMismatch = { provider: provider.name, foundCaseName: match.caseName };
                }
                continue;
            }
            if ((0, types_1.supportsRateLimitAwareness)(provider) && provider.wasLastRequestRateLimited()) {
                rateLimitedProviders.push(provider.name);
            }
        }
        results.push({ raw, verifiedVia, skippedProviders, rateLimitedProviders, nameMismatch });
    }
    return results;
}
