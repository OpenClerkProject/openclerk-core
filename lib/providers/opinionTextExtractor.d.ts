/**
 * Extracts the portion(s) of a court opinion's full text corresponding to specific print-reporter
 * page numbers, using "star pagination" markers (e.g. "*705") -- the standard convention used by
 * Westlaw and most public-domain legal text corpora (including the sources CourtListener
 * aggregates) to mark where each page of the original print reporter begins.
 *
 * This is a best-effort heuristic, not a guarantee: an opinion's text isn't required to include
 * star-pagination markers at all (it depends on the opinion's original source), and if none are
 * found -- or none match a requested page -- this returns null rather than guessing.
 */
/**
 * Returns the text between each requested page's marker and the next marker (of any page),
 * joined in ascending page order -- or null if the text has no star-pagination markers, or none
 * of them match a requested page.
 */
export declare function extractPageExcerpt(fullText: string, targetPages: number[]): string | null;
/**
 * Strips HTML tags for opinions that only have an HTML text field (no plain_text). Blunt but
 * adequate here: the output only needs to be readable inside a Word comment, never re-rendered
 * as HTML, so there's no injection risk in being lossy about markup.
 *
 * Entities are decoded in a single combined-regex pass (not sequential .replace() calls) so an
 * earlier substitution can never create a new match for a later one -- e.g. decoding "&amp;"
 * before "&lt;" would turn a literal "&amp;lt;" into "&lt;" and then wrongly decode that into
 * "<", double-unescaping content that was never meant to become a tag-like character.
 */
export declare function stripHtmlTags(html: string): string;
