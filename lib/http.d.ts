/**
 * Every provider in this package talks HTTP through this indirection instead of calling the
 * global fetch() directly, so a host environment without a fetch-shaped API (e.g. Google Apps
 * Script, where the only outbound-HTTP primitive is the synchronous UrlFetchApp.fetch()) can
 * supply its own HttpClient via setHttpClient() at startup. The default implementation just
 * wraps global fetch, so nothing changes for the Word add-in or for tests that already mock
 * global.fetch.
 */
export interface HttpResponse {
    ok: boolean;
    status: number;
    json(): Promise<any>;
}
export type HttpRequestBody = string | URLSearchParams;
export interface HttpRequestInit {
    method?: string;
    headers?: Record<string, string>;
    body?: HttpRequestBody;
}
export interface HttpClient {
    fetch(url: string, init?: HttpRequestInit): Promise<HttpResponse>;
}
export declare const fetchHttpClient: HttpClient;
/**
 * Overrides the HttpClient every provider uses. Call once at host startup (e.g. an Apps Script
 * project's entry point) before any provider makes a request.
 */
export declare function setHttpClient(client: HttpClient): void;
export declare function getHttpClient(): HttpClient;
/** Restores the default fetch-backed client. Mainly useful between test cases. */
export declare function resetHttpClient(): void;
