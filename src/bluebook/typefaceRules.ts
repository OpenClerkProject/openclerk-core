import { ParsedCitation } from "../providers/types";
import { BluebookIssue } from "./types";

/**
 * Checks Bluebook Rule 2.1(a): a case name in a citation must be italicized or underlined.
 *
 * openclerk-core has no access to the source document's formatting -- it's platform-agnostic by
 * design (no Office.js, no Google Apps Script, no DOM APIs), so it can't itself tell whether a
 * run of text is italic. This only fires when the caller has actually inspected the live document
 * and supplied `citation.caseNameFormatting`; an unset field means "the caller didn't check",
 * which is treated as "don't flag this" rather than "definitely not italicized" -- a missed flag
 * is far less harmful than a false one. Each platform integration is responsible for populating
 * this field itself (e.g. Word's Office.js `Font.italic`/`Font.underline`, or the equivalent DOM
 * inspection in a browser-based editor) before calling checkCitation.
 */
export function checkCaseNameTypeface(citation: ParsedCitation): BluebookIssue[] {
  const formatting = citation.caseNameFormatting;
  if (!formatting) {
    return [];
  }

  if (!formatting.italic && !formatting.underlined) {
    return [
      {
        ruleId: "case-name-typeface",
        message: "Case names must be italicized or underlined (Bluebook Rule 2.1(a)).",
        severity: "error",
      },
    ];
  }

  return [];
}
