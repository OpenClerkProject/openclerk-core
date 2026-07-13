"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractPageExcerpt = extractPageExcerpt;
exports.stripHtmlTags = stripHtmlTags;
function findPageMarkers(text) {
    const markers = [];
    const markerRegex = /\*\s?(\d+)\b/g;
    let match;
    while ((match = markerRegex.exec(text)) !== null) {
        markers.push({ index: match.index, page: parseInt(match[1], 10) });
    }
    return markers;
}
/**
 * Returns the text between each requested page's marker and the next marker (of any page),
 * joined in ascending page order -- or null if the text has no star-pagination markers, or none
 * of them match a requested page.
 */
function extractPageExcerpt(fullText, targetPages) {
    if (!fullText || targetPages.length === 0) {
        return null;
    }
    const markers = findPageMarkers(fullText);
    if (markers.length === 0) {
        return null;
    }
    const wanted = new Set(targetPages);
    const segments = [];
    for (let i = 0; i < markers.length; i++) {
        if (!wanted.has(markers[i].page)) {
            continue;
        }
        const start = markers[i].index;
        const end = i + 1 < markers.length ? markers[i + 1].index : fullText.length;
        const segment = fullText.slice(start, end).trim();
        if (segment) {
            segments.push(segment);
        }
    }
    return segments.length > 0 ? segments.join("\n\n[...]\n\n") : null;
}
const HTML_ENTITY_REPLACEMENTS = {
    "&nbsp;": " ",
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
};
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
function stripHtmlTags(html) {
    return html
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/gi, (match) => { var _a; return (_a = HTML_ENTITY_REPLACEMENTS[match.toLowerCase()]) !== null && _a !== void 0 ? _a : match; })
        .replace(/\s+/g, " ")
        .trim();
}
