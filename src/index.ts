export {
  normalizeText,
  isLikelyCaseCitation,
  extractParentheticalCitations,
  escapeHtml,
  isSafeHyperlinkUrl,
  stripHtmlHyperlinks,
} from "./utils";

export * from "./providers";
export {
  HttpClient,
  HttpResponse,
  HttpRequestInit,
  HttpRequestBody,
  setHttpClient,
  getHttpClient,
  resetHttpClient,
} from "./http";
export {
  setReporterSpacingNormalizationEnabled,
  isReporterSpacingNormalizationEnabled,
  resetReporterSpacingNormalization,
} from "./utils";
export {
  EnterpriseCitationProvider,
  trimTrailingSlash,
  fetchClientCredentialsToken,
} from "./providers/base";
export { extractPageExcerpt, stripHtmlTags } from "./providers/opinionTextExtractor";
export { reconstructFullPageNumber } from "./providers/pincitePages";

export * from "./bluebook";
export { BluebookRuleSetRegistry } from "./bluebook/registry";
export { checkCommonCaseCitationRules } from "./bluebook/commonRules";
export { applyManualReporterOverrides } from "./bluebook/reporterRules";
export { applyManualCaseNameOverrides } from "./bluebook/checkCaseNameAbbreviations";
export { Bluebook20thEdition } from "./bluebook/edition20th";
export { Bluebook21stEdition } from "./bluebook/edition21st";
export { Bluebook22ndEdition } from "./bluebook/edition22nd";
