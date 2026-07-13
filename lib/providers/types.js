"use strict";
/**
 * Core contract for the citation hyperlink plugin architecture.
 *
 * Any online case-law lookup source (a free public API, or a paid research
 * platform like LexisNexis/Westlaw/Bloomberg Law) implements CitationProvider
 * and registers itself with the registry in registry.ts. Nothing else in the
 * add-in needs to know which provider is active.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.supportsOpinionText = supportsOpinionText;
exports.supportsRateLimitAwareness = supportsRateLimitAwareness;
function supportsOpinionText(provider) {
    const candidate = provider;
    return typeof candidate.fetchOpinionExcerpt === "function" && typeof candidate.isReadyForOpinionText === "function";
}
function supportsRateLimitAwareness(provider) {
    return typeof provider.wasLastRequestRateLimited === "function";
}
