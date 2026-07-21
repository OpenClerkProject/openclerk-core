import { citationProviderRegistry } from "./registry";
import { CourtListenerProvider } from "./courtListenerProvider";
import { LexisNexisProvider } from "./lexisNexisProvider";
import { WestlawProvider } from "./westlawProvider";
import { UsptoPatentCenterProvider } from "./usptoPatentCenterProvider";

// Bloomberg Law is intentionally NOT registered for now: unlike Thomson Reuters and LexisNexis, its
// programmatic OAuth2 shape could not be confirmed from any reachable evidence (see
// .planning/research/vendor-oauth-endpoints-code-evidence.md), so offering it as a configurable
// provider would present an unverified auth flow as if it were ready. The BloombergLawProvider class
// is kept intact -- to re-enable once its API shape is validated, restore the import and the
// register() call below.
// import { BloombergLawProvider } from "./bloombergLawProvider";

citationProviderRegistry.register(new CourtListenerProvider());
citationProviderRegistry.register(new LexisNexisProvider());
citationProviderRegistry.register(new WestlawProvider());
// citationProviderRegistry.register(new BloombergLawProvider());
citationProviderRegistry.register(new UsptoPatentCenterProvider());

export { citationProviderRegistry } from "./registry";
export * from "./types";
export { parseCaseCitation, extractCaseCitations, extractCitationTokens, clusterCitationTokens, findOrphanedCitations, caseNamesMatch } from "./citationParser";
export type { CitationToken, CitationTokenType, CitationCluster } from "./citationParser";
export { expandPincitePages } from "./pincitePages";
export { checkCitationsForHallucinations } from "./hallucinationCheck";
export type { HallucinationCheckResult } from "./hallucinationCheck";
