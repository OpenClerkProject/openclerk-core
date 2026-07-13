"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Bluebook20thEdition = void 0;
const commonRules_1 = require("./commonRules");
/**
 * The Bluebook, 20th ed. (2015). Table T6 (case-name abbreviations) and
 * Table T13.2 (periodical/institutional-author abbreviations) were still
 * separate at this point, so several words that later editions abbreviate
 * in case names (see checkCaseNameAbbreviations.ts) were correctly spelled
 * out in full here -- this rule-set intentionally does not run that check.
 */
class Bluebook20thEdition {
    constructor() {
        this.id = "bluebook-20th";
        this.name = "20th Edition (2015)";
        this.description = "Table T6 and T13.2 were still separate; fewer case-name words are abbreviated.";
    }
    checkCitation(citation) {
        return (0, commonRules_1.checkCommonCaseCitationRules)(citation);
    }
}
exports.Bluebook20thEdition = Bluebook20thEdition;
