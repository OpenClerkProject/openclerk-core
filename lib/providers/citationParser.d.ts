import { ParsedCitation } from "./types";
export type CitationTokenType = "full" | "short" | "id" | "supra";
export interface CitationToken {
    type: CitationTokenType;
    /** The raw matched text, e.g. "Id. at 495" or "Liepelt, supra, at 495". */
    raw: string;
    /** Character offset where this token starts in the text it was extracted from. */
    index: number;
    /** For "short"/"supra": the case-name fragment preceding the citation, if present. */
    namePart?: string;
    /** Pinpoint page (or range) this token references, if any. */
    pincite?: string;
}
/**
 * Scans text for every full, short-form ("444 U.S. at 495"), "Id.", and "supra" case citation,
 * in document order. This is the tokenizing half of eyecite-style citation resolution: full
 * citations are found with the same heuristic as extractCaseCitations, and the short-form
 * variants are matched separately, then filtered so a short-form/id./supra pattern that happens
 * to fall inside an already-matched full citation's span (e.g. its parenthetical) isn't
 * double-counted as its own token.
 */
export declare function extractCitationTokens(text: string): CitationToken[];
export interface CitationCluster {
    /** The full citation that anchors this cluster -- identifies which case it refers to. */
    leadCitation: string;
    caseName?: string;
    tokens: CitationToken[];
}
/**
 * Compares two full case names for a real correspondence, tolerating abbreviation differences (in
 * either direction) the same way caseNameMatchesToken does for short forms.
 *
 * This exists to catch a specific, dangerous class of citation hallucination: a lookup provider
 * that resolves a citation by its locator (reporter/volume/page) rather than by the case name
 * attached to it -- which is exactly how CourtListener's citation-lookup API works -- will
 * happily return the real case actually published at that locator even when the case name typed
 * (or fabricated by an LLM) alongside it names a different case entirely. A non-null
 * CitationProvider#lookupCitation() result therefore does not by itself mean the citation is
 * real; it means *a* case exists at that locator. Callers that treat "found a locator" as
 * "verified" without also checking this can be fooled by exactly the kind of fabricated citation
 * (a real reporter/volume/page attached to an invented party name) at the center of the Mata v.
 * Avianca ChatGPT-hallucinated-citations incident -- see tests/hallucinationCheck.test.ts.
 */
export declare function caseNamesMatch(a: string, b: string): boolean;
/**
 * Groups citation tokens into clusters that refer to the same case -- eyecite calls this
 * "resolving" citations. Each full citation starts a new cluster; a short-form/supra token
 * attaches to the most recent cluster whose case name it names (or, lacking a name fragment of
 * its own, to whichever cluster was most recently referenced); an "Id." token always attaches to
 * whichever cluster was most recently referenced, since Rule 10.9 defines it that way regardless
 * of name. A short-form/supra token that names no matching antecedent is left out of every
 * cluster -- see findOrphanedCitations, which surfaces exactly those.
 */
export declare function clusterCitationTokens(tokens: CitationToken[]): CitationCluster[];
/**
 * Returns every short-form/id./supra token that couldn't be resolved to any preceding full
 * citation -- e.g. a stray "Id." at the very start of a document excerpt, or a short form naming
 * a case that was never fully cited. A drafting defect worth flagging on its own, separate from
 * (and not proof of) a hallucinated citation: the antecedent may simply be missing from the
 * excerpt being scanned.
 */
export declare function findOrphanedCitations(text: string): CitationToken[];
/**
 * Scans running document text for full Bluebook-style case citations, e.g.
 * "Norfolk & W. Ry. Co. v. Liepelt, 444 U.S. 490 (U.S.Ill., 1980)". This is
 * a best-effort heuristic scanner for the online-lookup workflow: a missed
 * or malformed match simply means that citation is skipped, since providers
 * are only ever asked about text this function judged citation-shaped.
 */
export declare function extractCaseCitations(text: string): string[];
/**
 * Parses a Bluebook-style case citation, e.g.:
 *   "Norfolk & W. Ry. Co. v. Liepelt, 444 U.S. 490 (U.S.Ill., 1980)"
 * into its structural parts. Returns null when the text doesn't look like a
 * "<case name>, <volume> <reporter> <page> (<court info>)" citation.
 */
export declare function parseCaseCitation(text: string): ParsedCitation | null;
