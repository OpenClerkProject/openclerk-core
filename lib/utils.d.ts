export declare function normalizeText(value: string): string;
export declare function isLikelyCaseCitation(value: string): boolean;
export declare function extractParentheticalCitations(text: string): string[];
/**
 * Only http(s)/mailto URLs are safe to write into a Word hyperlink here -- source .docx files
 * come from whoever the user chooses to import, and parenthetical URLs are free-form user input,
 * so schemes like javascript:/vbscript:/file: must be rejected before insertHyperlink/insertHtml.
 */
export declare function isSafeHyperlinkUrl(url: string): boolean;
export declare function escapeHtml(str: string): string;
/**
 * Escapes regex metacharacters so a data-driven string (e.g. a vendored reporters-db entry) can
 * be safely spliced into a `new RegExp(...)` call site without being interpreted as a pattern.
 */
export declare function escapeRegExp(str: string): string;
export declare function stripHtmlHyperlinks(html: string): string;
