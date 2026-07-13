"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Bluebook22ndEdition = exports.Bluebook21stEdition = exports.Bluebook20thEdition = exports.applyManualCaseNameOverrides = exports.applyManualReporterOverrides = exports.checkCommonCaseCitationRules = exports.BluebookRuleSetRegistry = exports.reconstructFullPageNumber = exports.stripHtmlTags = exports.extractPageExcerpt = exports.fetchClientCredentialsToken = exports.trimTrailingSlash = exports.EnterpriseCitationProvider = exports.resetHttpClient = exports.getHttpClient = exports.setHttpClient = exports.stripHtmlHyperlinks = exports.isSafeHyperlinkUrl = exports.escapeHtml = exports.extractParentheticalCitations = exports.isLikelyCaseCitation = exports.normalizeText = void 0;
var utils_1 = require("./utils");
Object.defineProperty(exports, "normalizeText", { enumerable: true, get: function () { return utils_1.normalizeText; } });
Object.defineProperty(exports, "isLikelyCaseCitation", { enumerable: true, get: function () { return utils_1.isLikelyCaseCitation; } });
Object.defineProperty(exports, "extractParentheticalCitations", { enumerable: true, get: function () { return utils_1.extractParentheticalCitations; } });
Object.defineProperty(exports, "escapeHtml", { enumerable: true, get: function () { return utils_1.escapeHtml; } });
Object.defineProperty(exports, "isSafeHyperlinkUrl", { enumerable: true, get: function () { return utils_1.isSafeHyperlinkUrl; } });
Object.defineProperty(exports, "stripHtmlHyperlinks", { enumerable: true, get: function () { return utils_1.stripHtmlHyperlinks; } });
__exportStar(require("./providers"), exports);
var http_1 = require("./http");
Object.defineProperty(exports, "setHttpClient", { enumerable: true, get: function () { return http_1.setHttpClient; } });
Object.defineProperty(exports, "getHttpClient", { enumerable: true, get: function () { return http_1.getHttpClient; } });
Object.defineProperty(exports, "resetHttpClient", { enumerable: true, get: function () { return http_1.resetHttpClient; } });
var base_1 = require("./providers/base");
Object.defineProperty(exports, "EnterpriseCitationProvider", { enumerable: true, get: function () { return base_1.EnterpriseCitationProvider; } });
Object.defineProperty(exports, "trimTrailingSlash", { enumerable: true, get: function () { return base_1.trimTrailingSlash; } });
Object.defineProperty(exports, "fetchClientCredentialsToken", { enumerable: true, get: function () { return base_1.fetchClientCredentialsToken; } });
var opinionTextExtractor_1 = require("./providers/opinionTextExtractor");
Object.defineProperty(exports, "extractPageExcerpt", { enumerable: true, get: function () { return opinionTextExtractor_1.extractPageExcerpt; } });
Object.defineProperty(exports, "stripHtmlTags", { enumerable: true, get: function () { return opinionTextExtractor_1.stripHtmlTags; } });
var pincitePages_1 = require("./providers/pincitePages");
Object.defineProperty(exports, "reconstructFullPageNumber", { enumerable: true, get: function () { return pincitePages_1.reconstructFullPageNumber; } });
__exportStar(require("./bluebook"), exports);
var registry_1 = require("./bluebook/registry");
Object.defineProperty(exports, "BluebookRuleSetRegistry", { enumerable: true, get: function () { return registry_1.BluebookRuleSetRegistry; } });
var commonRules_1 = require("./bluebook/commonRules");
Object.defineProperty(exports, "checkCommonCaseCitationRules", { enumerable: true, get: function () { return commonRules_1.checkCommonCaseCitationRules; } });
var reporterRules_1 = require("./bluebook/reporterRules");
Object.defineProperty(exports, "applyManualReporterOverrides", { enumerable: true, get: function () { return reporterRules_1.applyManualReporterOverrides; } });
var checkCaseNameAbbreviations_1 = require("./bluebook/checkCaseNameAbbreviations");
Object.defineProperty(exports, "applyManualCaseNameOverrides", { enumerable: true, get: function () { return checkCaseNameAbbreviations_1.applyManualCaseNameOverrides; } });
var edition20th_1 = require("./bluebook/edition20th");
Object.defineProperty(exports, "Bluebook20thEdition", { enumerable: true, get: function () { return edition20th_1.Bluebook20thEdition; } });
var edition21st_1 = require("./bluebook/edition21st");
Object.defineProperty(exports, "Bluebook21stEdition", { enumerable: true, get: function () { return edition21st_1.Bluebook21stEdition; } });
var edition22nd_1 = require("./bluebook/edition22nd");
Object.defineProperty(exports, "Bluebook22ndEdition", { enumerable: true, get: function () { return edition22nd_1.Bluebook22ndEdition; } });
