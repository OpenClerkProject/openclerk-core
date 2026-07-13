"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyManualCaseNameOverrides = applyManualCaseNameOverrides;
exports.checkFullCaseNameAbbreviations = checkFullCaseNameAbbreviations;
exports.checkCaseNameAbbreviations = checkCaseNameAbbreviations;
const utils_1 = require("../utils");
const caseNameAbbreviations_1 = require("./caseNameAbbreviations");
const caseNameAbbreviations_generated_1 = require("./generated/caseNameAbbreviations.generated");
const manualCorrections_1 = require("./manualCorrections");
/**
 * Layers community-contributed overrides (manualCorrections.ts) on top of the vendored
 * reporters-db case-name abbreviation table. Exported and kept pure so it's unit-testable with
 * fixture data, independent of the real (normally empty) manual-corrections file.
 */
function applyManualCaseNameOverrides(generated, manualAbbreviations) {
    const table = { ...generated };
    for (const entry of manualAbbreviations) {
        table[entry.word.toLowerCase()] = entry.abbreviation;
    }
    return table;
}
const fullAbbreviationTable = applyManualCaseNameOverrides(caseNameAbbreviations_generated_1.CASE_NAME_ABBREVIATIONS, manualCorrections_1.MANUAL_CASE_NAME_ABBREVIATIONS);
/**
 * Flags full words in a case name that Table T6 abbreviates, using Free Law Project's
 * reporters-db case-name abbreviation table (vendored at dev time, see
 * generated/caseNameAbbreviations.generated.ts) -- edition-independent, since the bulk of Table
 * T6 predates and is unaffected by the 21st-edition T6/T13.2 merger (the merger-specific words
 * are excluded from this table at generation time; see checkCaseNameAbbreviations below for
 * those). Run this for every edition.
 */
function checkFullCaseNameAbbreviations(citation) {
    const caseName = citation.caseName || "";
    if (!caseName) {
        return [];
    }
    const issues = [];
    const words = caseName.match(/[A-Za-z']+/g) || [];
    const seen = new Set();
    for (const word of words) {
        const key = word.toLowerCase();
        if (seen.has(key)) {
            continue;
        }
        const abbreviation = fullAbbreviationTable[key];
        if (abbreviation) {
            seen.add(key);
            issues.push({
                ruleId: "case-name-abbreviation",
                message: `"${word}" should be abbreviated as "${abbreviation}" in a case name (Table T6).`,
                severity: "warning",
            });
        }
    }
    return issues;
}
/**
 * Flags full words in a case name that the 21st-edition merger of Tables T6
 * and T13.2 requires to be abbreviated (see caseNameAbbreviations.ts for why
 * this is edition-gated). Only call this for rule-sets whose edition
 * actually applies the merged table (21st edition and later).
 */
function checkCaseNameAbbreviations(citation) {
    const caseName = citation.caseName || "";
    const issues = [];
    for (const entry of caseNameAbbreviations_1.T6_T13_MERGER_ABBREVIATIONS) {
        const wordRegex = new RegExp(`\\b${(0, utils_1.escapeRegExp)(entry.word)}\\b`, "i");
        if (wordRegex.test(caseName)) {
            issues.push({
                ruleId: "t6-t13-merger-abbreviation",
                message: `"${entry.word}" should be abbreviated as "${entry.abbreviation}" in a case name (Table T6).`,
                severity: "warning",
            });
        }
    }
    return issues;
}
