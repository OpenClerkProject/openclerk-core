import { ParsedCitation } from "../providers/types";
import { BluebookIssue } from "./types";
import { checkReporterAbbreviation } from "./reporterRules";
import { checkFullCaseNameAbbreviations } from "./checkCaseNameAbbreviations";
import { checkCourtStateAbbreviation } from "./courtRules";
import { checkPincitePageRange } from "./pageRangeRules";
import { checkCaseNameTypeface } from "./typefaceRules";

/**
 * Checks for Bluebook Rule 10 (case citation) conventions that have stayed
 * stable across at least the last three editions (20th/2015, 21st/2020,
 * 22nd/2025) -- edition-specific rule-sets all run these, then layer their
 * own edition-specific checks on top (see caseNameAbbreviations.ts). Also
 * includes the Rule 2.1(a) case-name-typeface check (checkCaseNameTypeface),
 * which is edition-independent for the same reason the others here are.
 */
export function checkCommonCaseCitationRules(citation: ParsedCitation): BluebookIssue[] {
  const issues: BluebookIssue[] = [];
  const caseName = citation.caseName || "";

  if (/\svs\.?\s/i.test(caseName)) {
    issues.push({
      ruleId: "v-abbreviation",
      message: 'Use "v." (not "vs." or "vs") to abbreviate "versus" between party names.',
      severity: "error",
    });
  } else if (/\sv\s/.test(caseName) && !/\sv\.\s/.test(caseName)) {
    issues.push({
      ruleId: "v-period",
      message: '"v." should include a period.',
      severity: "error",
    });
  }

  issues.push(...checkReporterAbbreviation(citation));
  issues.push(...checkFullCaseNameAbbreviations(citation));
  issues.push(...checkCourtStateAbbreviation(citation));
  issues.push(...checkPincitePageRange(citation));
  issues.push(...checkCaseNameTypeface(citation));

  // Short-form citations (Rule 10.9, e.g. "Rundo, 990 F.3d at 712") intentionally have no
  // court/year parenthetical at all -- that information was already given in the earlier full
  // citation this one refers back to -- so these two checks don't apply to them.
  if (!citation.isShortForm) {
    if (!citation.year) {
      issues.push({
        ruleId: "year-required",
        message: "No year found in the citation's parenthetical; Bluebook Rule 10.5 requires the decision year.",
        severity: "error",
      });
    }

    // Intentionally checks the normalized `reporter` (not `reporterRaw`) here: this is asking
    // "is this citation semantically to the U.S. Reports" for matching purposes (a spacing variant
    // like "22 U. S. 33" is still a U.S. Reports citation and must not be forced to supply a court
    // abbreviation just because of how it was spaced), not a Rule 6.1 formatting check -- that
    // formatting check lives in checkReporterAbbreviation (reporterRules.ts), which does use
    // `reporterRaw` for exactly the opposite reason.
    if (citation.reporter && citation.reporter !== "U.S." && !citation.court) {
      issues.push({
        ruleId: "court-abbreviation-required",
        message:
          'A court abbreviation is expected in the parenthetical for this reporter (Rule 10.4) -- only U.S. Reports ("U.S.") citations can omit it.',
        severity: "warning",
      });
    }
  }

  return issues;
}
