import { ParsedCitation } from "../providers/types";
import { BluebookIssue } from "./types";
/**
 * Flags a court/jurisdiction parenthetical that spells out a full state name instead of using
 * the Bluebook Table T10 abbreviation (e.g. "(California 1990)" instead of "(Cal. 1990)").
 * Edition-independent -- state abbreviations haven't changed across the editions this project
 * tracks. Uses Free Law Project's reporters-db state abbreviation table (vendored at dev time,
 * see generated/stateAbbreviations.generated.ts).
 */
export declare function checkCourtStateAbbreviation(citation: ParsedCitation): BluebookIssue[];
