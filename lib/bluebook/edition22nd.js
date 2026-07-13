"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Bluebook22ndEdition = void 0;
const commonRules_1 = require("./commonRules");
const checkCaseNameAbbreviations_1 = require("./checkCaseNameAbbreviations");
/**
 * The Bluebook, 22nd ed. (2025) -- the current edition as of this writing.
 * Its documented changes (typeface terminology renamed to "small capitals";
 * mandatory web-archiving for online sources; a new "contrast" signal; a
 * rewritten Rule 18 covering AI-generated content) don't affect case
 * citation (Rule 10) format, so this rule-set runs the same case-citation
 * checks as the 21st edition (the merged T6/T13.2 table carries forward
 * unchanged). See https://lib.law.uw.edu/bluebook101/22nd.
 */
class Bluebook22ndEdition {
    constructor() {
        this.id = "bluebook-22nd";
        this.name = "22nd Edition (2025)";
        this.description = "Current edition. Case-citation format is unchanged from the 21st edition.";
    }
    checkCitation(citation) {
        return [...(0, commonRules_1.checkCommonCaseCitationRules)(citation), ...(0, checkCaseNameAbbreviations_1.checkCaseNameAbbreviations)(citation)];
    }
}
exports.Bluebook22ndEdition = Bluebook22ndEdition;
