import { ParsedCitation } from "../providers/types";
import { BluebookIssue } from "./types";
import { ManualCaseNameAbbreviation } from "./manualCorrections";
/**
 * Layers community-contributed overrides (manualCorrections.ts) on top of the vendored
 * reporters-db case-name abbreviation table. Exported and kept pure so it's unit-testable with
 * fixture data, independent of the real (normally empty) manual-corrections file.
 */
export declare function applyManualCaseNameOverrides(generated: Record<string, string>, manualAbbreviations: ManualCaseNameAbbreviation[]): Record<string, string>;
/**
 * Flags full words in a case name that Table T6 abbreviates, using Free Law Project's
 * reporters-db case-name abbreviation table (vendored at dev time, see
 * generated/caseNameAbbreviations.generated.ts) -- edition-independent, since the bulk of Table
 * T6 predates and is unaffected by the 21st-edition T6/T13.2 merger (the merger-specific words
 * are excluded from this table at generation time; see checkCaseNameAbbreviations below for
 * those). Run this for every edition.
 */
export declare function checkFullCaseNameAbbreviations(citation: ParsedCitation): BluebookIssue[];
/**
 * Flags full words in a case name that the 21st-edition merger of Tables T6
 * and T13.2 requires to be abbreviated (see caseNameAbbreviations.ts for why
 * this is edition-gated). Only call this for rule-sets whose edition
 * actually applies the merged table (21st edition and later).
 */
export declare function checkCaseNameAbbreviations(citation: ParsedCitation): BluebookIssue[];
