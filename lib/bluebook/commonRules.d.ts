import { ParsedCitation } from "../providers/types";
import { BluebookIssue } from "./types";
/**
 * Checks for Bluebook Rule 10 (case citation) conventions that have stayed
 * stable across at least the last three editions (20th/2015, 21st/2020,
 * 22nd/2025) -- edition-specific rule-sets all run these, then layer their
 * own edition-specific checks on top (see caseNameAbbreviations.ts). Also
 * includes the Rule 2.1(a) case-name-typeface check (checkCaseNameTypeface),
 * which is edition-independent for the same reason the others here are.
 */
export declare function checkCommonCaseCitationRules(citation: ParsedCitation): BluebookIssue[];
