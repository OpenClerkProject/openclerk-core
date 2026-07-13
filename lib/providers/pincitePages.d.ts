/**
 * Reconstructs a page-range end number that may have been written in Bluebook's "dropped
 * digits" short form (e.g. the "06" in "705-06") back to its full value, by borrowing the
 * corresponding leading digits from the range's start number -- exactly the assumption the
 * dropped notation itself relies on. If the written end is already the same length as (or
 * longer than) the start, it's returned unchanged.
 */
export declare function reconstructFullPageNumber(start: string, writtenEnd: string): string;
/**
 * Expands a citation's pincite string -- a single page ("496"), a comma-separated list
 * ("505, 508, 513"), a Bluebook-dropped-digit range ("705-06"), and/or a page with a footnote
 * pincite ("567 n.1") -- into the full, deduplicated, ascending list of individual page numbers
 * it refers to.
 */
export declare function expandPincitePages(pincite: string): number[];
