"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsptoPatentCenterProvider = void 0;
const base_1 = require("./base");
/**
 * TODO: USPTO Patent Center lookups are not implemented yet.
 *
 * This is a placeholder registration so the provider shows up in the Online
 * Lookup provider list and the plugin wiring (registry, UI, credential
 * rendering) can be exercised end-to-end before the real integration lands.
 * USPTO Patent Center (patentcenter.uspto.gov) fronts Patent Examination
 * Data System (PEDS) / Open Data Portal APIs for filings and prosecution
 * history rather than case-law citations, so lookupCitation() intentionally
 * always resolves to null ("move on") until that's built out.
 */
class UsptoPatentCenterProvider extends base_1.EnterpriseCitationProvider {
    constructor() {
        super(...arguments);
        this.id = "uspto-patent-center";
        this.name = "USPTO Patent Center (TODO)";
        this.description = "Not yet implemented. Intended to look up patent filings/prosecution history via USPTO Patent Center for the Non-patent Literature workflow.";
        this.credentialFields = [];
    }
    async verifyCredentials() {
        throw new Error("USPTO Patent Center lookups are not implemented yet.");
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature must match CitationProvider
    async lookupCitation(citation) {
        return null;
    }
}
exports.UsptoPatentCenterProvider = UsptoPatentCenterProvider;
