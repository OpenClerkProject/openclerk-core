"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkCommonCaseCitationRules = checkCommonCaseCitationRules;
const reporterRules_1 = require("./reporterRules");
const checkCaseNameAbbreviations_1 = require("./checkCaseNameAbbreviations");
const courtRules_1 = require("./courtRules");
const pageRangeRules_1 = require("./pageRangeRules");
const typefaceRules_1 = require("./typefaceRules");
/**
 * Checks for Bluebook Rule 10 (case citation) conventions that have stayed
 * stable across at least the last three editions (20th/2015, 21st/2020,
 * 22nd/2025) -- edition-specific rule-sets all run these, then layer their
 * own edition-specific checks on top (see caseNameAbbreviations.ts). Also
 * includes the Rule 2.1(a) case-name-typeface check (checkCaseNameTypeface),
 * which is edition-independent for the same reason the others here are.
 */
function checkCommonCaseCitationRules(citation) {
    const issues = [];
    const caseName = citation.caseName || "";
    if (/\svs\.?\s/i.test(caseName)) {
        issues.push({
            ruleId: "v-abbreviation",
            message: 'Use "v." (not "vs." or "vs") to abbreviate "versus" between party names.',
            severity: "error",
        });
    }
    else if (/\sv\s/.test(caseName) && !/\sv\.\s/.test(caseName)) {
        issues.push({
            ruleId: "v-period",
            message: '"v." should include a period.',
            severity: "error",
        });
    }
    issues.push(...(0, reporterRules_1.checkReporterAbbreviation)(citation));
    issues.push(...(0, checkCaseNameAbbreviations_1.checkFullCaseNameAbbreviations)(citation));
    issues.push(...(0, courtRules_1.checkCourtStateAbbreviation)(citation));
    issues.push(...(0, pageRangeRules_1.checkPincitePageRange)(citation));
    issues.push(...(0, typefaceRules_1.checkCaseNameTypeface)(citation));
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
        if (citation.reporter && citation.reporter !== "U.S." && !citation.court) {
            issues.push({
                ruleId: "court-abbreviation-required",
                message: 'A court abbreviation is expected in the parenthetical for this reporter (Rule 10.4) -- only U.S. Reports ("U.S.") citations can omit it.',
                severity: "warning",
            });
        }
    }
    return issues;
}
