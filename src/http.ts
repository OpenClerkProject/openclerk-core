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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

export const fetchHttpClient: HttpClient = {
  fetch: (url, init) => fetch(url, init),
};

let currentHttpClient: HttpClient = fetchHttpClient;

/**
 * Overrides the HttpClient every provider uses. Call once at host startup (e.g. an Apps Script
 * project's entry point) before any provider makes a request.
 */
export function setHttpClient(client: HttpClient): void {
  currentHttpClient = client;
}

export function getHttpClient(): HttpClient {
  return currentHttpClient;
}

/** Restores the default fetch-backed client. Mainly useful between test cases. */
export function resetHttpClient(): void {
  currentHttpClient = fetchHttpClient;
}
