"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkCourtStateAbbreviation = checkCourtStateAbbreviation;
const utils_1 = require("../utils");
const stateAbbreviations_generated_1 = require("./generated/stateAbbreviations.generated");
const stateAbbreviations = stateAbbreviations_generated_1.STATE_ABBREVIATIONS;
/**
 * Flags a court/jurisdiction parenthetical that spells out a full state name instead of using
 * the Bluebook Table T10 abbreviation (e.g. "(California 1990)" instead of "(Cal. 1990)").
 * Edition-independent -- state abbreviations haven't changed across the editions this project
 * tracks. Uses Free Law Project's reporters-db state abbreviation table (vendored at dev time,
 * see generated/stateAbbreviations.generated.ts).
 */
function checkCourtStateAbbreviation(citation) {
    const court = citation.court;
    if (!court) {
        return [];
    }
    for (const [abbreviation, fullName] of Object.entries(stateAbbreviations)) {
        if (fullName === abbreviation) {
            // States whose Bluebook abbreviation is the full name itself (e.g. "Iowa", "Ohio") --
            // nothing to flag.
            continue;
        }
        if (new RegExp(`\\b${(0, utils_1.escapeRegExp)(fullName)}\\b`, "i").test(court)) {
            return [
                {
                    ruleId: "court-state-not-abbreviated",
                    message: `"${fullName}" should be abbreviated as "${abbreviation}" in the court/jurisdiction parenthetical (Table T10).`,
                    severity: "warning",
                },
            ];
        }
    }
    return [];
}
