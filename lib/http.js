"use strict";
/**
 * Every provider in this package talks HTTP through this indirection instead of calling the
 * global fetch() directly, so a host environment without a fetch-shaped API (e.g. Google Apps
 * Script, where the only outbound-HTTP primitive is the synchronous UrlFetchApp.fetch()) can
 * supply its own HttpClient via setHttpClient() at startup. The default implementation just
 * wraps global fetch, so nothing changes for the Word add-in or for tests that already mock
 * global.fetch.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchHttpClient = void 0;
exports.setHttpClient = setHttpClient;
exports.getHttpClient = getHttpClient;
exports.resetHttpClient = resetHttpClient;
exports.fetchHttpClient = {
    fetch: (url, init) => fetch(url, init),
};
let currentHttpClient = exports.fetchHttpClient;
/**
 * Overrides the HttpClient every provider uses. Call once at host startup (e.g. an Apps Script
 * project's entry point) before any provider makes a request.
 */
function setHttpClient(client) {
    currentHttpClient = client;
}
function getHttpClient() {
    return currentHttpClient;
}
/** Restores the default fetch-backed client. Mainly useful between test cases. */
function resetHttpClient() {
    currentHttpClient = exports.fetchHttpClient;
}
