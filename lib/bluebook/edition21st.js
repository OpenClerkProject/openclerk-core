"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Bluebook21stEdition = void 0;
const commonRules_1 = require("./commonRules");
const checkCaseNameAbbreviations_1 = require("./checkCaseNameAbbreviations");
/**
 * The Bluebook, 21st ed. (2020, incl. 2021+ printings). Merged Table T6
 * with the former Table T13.2, so the shared abbreviation list now applies
 * to case names too.
 */
class Bluebook21stEdition {
    constructor() {
        this.id = "bluebook-21st";
        this.name = "21st Edition (2020)";
        this.description = "Tables T6 and T13.2 were merged; more words are abbreviated in case names.";
    }
    checkCitation(citation) {
        return [...(0, commonRules_1.checkCommonCaseCitationRules)(citation), ...(0, checkCaseNameAbbreviations_1.checkCaseNameAbbreviations)(citation)];
    }
}
exports.Bluebook21stEdition = Bluebook21stEdition;
