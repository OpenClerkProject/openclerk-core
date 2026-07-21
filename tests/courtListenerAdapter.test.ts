/**
 * Golden-fixture and version-selection tests for the CourtListener ApiVersionAdapter seam
 * (src/providers/apiVersionAdapter.ts, src/providers/courtListenerProvider.ts).
 *
 * The fixtures under tests/fixtures/courtlistener/ mirror CourtListener's real v4 payload shape
 * (one per supported endpoint per supported version), and the tests here assert the v4 adapter
 * still parses them into the expected results. This is the CI gate that catches silent schema
 * drift: if an upstream field the adapter depends on is renamed (or the adapter is edited to
 * read a wrong field), parsing a real-shaped payload as undefined would recreate the
 * false-"verified" failure mode -- these tests fail instead. The adapter refactor without these
 * fixtures would be theater; keep one fixture per supported version as new versions are added.
 */

import * as fs from 'fs';
import * as path from 'path';
import { CourtListenerProvider, CourtListenerV4Adapter } from '../src/providers/courtListenerProvider';

function loadFixture(name: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'courtlistener', name), 'utf8'));
}

const V4_LOOKUP_FIXTURE = loadFixture('v4-citation-lookup.json');
const V4_OPINIONS_FIXTURE = loadFixture('v4-opinions.json');

const EXAMPLE_CITATION = 'Norfolk & Western Railway Co. v. Liepelt, 444 U.S. 490 (1980)';

describe('CourtListenerV4Adapter golden fixtures', () => {
  const adapter = new CourtListenerV4Adapter();

  test('parseLookupResponse parses the captured v4 citation-lookup payload into the expected match', () => {
    const match = adapter.parseLookupResponse(V4_LOOKUP_FIXTURE, { raw: EXAMPLE_CITATION });

    expect(match).toEqual({
      url: 'https://www.courtlistener.com/opinion/108713/norfolk-western-railway-co-v-liepelt/',
      caseName: 'Norfolk & Western Railway Co. v. Liepelt',
      citation: '444 U.S. 490',
    });
  });

  test('parseClusterId extracts the cluster ID from the captured v4 payload', () => {
    expect(adapter.parseClusterId(V4_LOOKUP_FIXTURE)).toEqual({ clusterId: '108713' });
  });

  test('parseOpinionTexts extracts the plain text from the captured v4 opinions payload', () => {
    const sources = adapter.parseOpinionTexts(V4_OPINIONS_FIXTURE);

    expect(sources).toHaveLength(1);
    expect(sources[0]).toContain('Mr. Justice Stevens delivered the opinion of the Court.');
  });

  test('parseLookupResponse returns null (never throws) for payloads that are not v4-shaped', () => {
    expect(adapter.parseLookupResponse({ detail: 'Invalid token.' }, { raw: EXAMPLE_CITATION })).toBeNull();
    expect(adapter.parseLookupResponse(null, { raw: EXAMPLE_CITATION })).toBeNull();
    expect(adapter.parseLookupResponse('not json we expected', { raw: EXAMPLE_CITATION })).toBeNull();
  });

  test('buildLookupRequest shapes the v4 form-encoded POST with the token header', () => {
    const request = adapter.buildLookupRequest({ raw: `  ${EXAMPLE_CITATION}  ` }, { token: 'secret-token' });

    expect(request.url).toBe('https://www.courtlistener.com/api/rest/v4/citation-lookup/');
    expect(request.method).toBe('POST');
    expect(request.headers).toEqual({
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Token secret-token',
    });
    expect(String(request.body)).toBe(new URLSearchParams({ text: EXAMPLE_CITATION }).toString());
  });

  test('buildOpinionsRequest shapes the v4 opinions URL from a cluster ID', () => {
    const request = adapter.buildOpinionsRequest('108713', { token: 'secret-token' });

    expect(request.url).toBe('https://www.courtlistener.com/api/rest/v4/opinions/?cluster=108713');
    expect(request.headers).toEqual({ Authorization: 'Token secret-token' });
  });
});

describe('CourtListenerProvider end-to-end against the v4 fixtures', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  async function authenticatedProvider(mockFetch: jest.Mock): Promise<CourtListenerProvider> {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] });
    const provider = new CourtListenerProvider();
    await provider.authenticate({ apiToken: 'secret-token' });
    return provider;
  }

  test('lookupCitation resolves the fixture payload through the default v4 adapter', async () => {
    const mockFetch = jest.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
    const provider = await authenticatedProvider(mockFetch);

    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => V4_LOOKUP_FIXTURE });

    await expect(provider.lookupCitation({ raw: EXAMPLE_CITATION })).resolves.toEqual({
      url: 'https://www.courtlistener.com/opinion/108713/norfolk-western-railway-co-v-liepelt/',
      caseName: 'Norfolk & Western Railway Co. v. Liepelt',
      citation: '444 U.S. 490',
    });
  });

  test('fetchOpinionExcerpt resolves the fixture payloads to the requested star-paginated page', async () => {
    const mockFetch = jest.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
    const provider = await authenticatedProvider(mockFetch);

    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => V4_LOOKUP_FIXTURE });
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => V4_OPINIONS_FIXTURE });

    const result = await provider.fetchOpinionExcerpt({ raw: EXAMPLE_CITATION }, [492]);

    expect(result.excerpt).toContain('after-tax income');
    expect(mockFetch).toHaveBeenLastCalledWith(
      'https://www.courtlistener.com/api/rest/v4/opinions/?cluster=108713',
      expect.objectContaining({ headers: { Authorization: 'Token secret-token' } })
    );
  });
});

describe('CourtListenerProvider API version selection', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('exposes the version choice as an optional select credential field', () => {
    const field = new CourtListenerProvider().credentialFields.find((f) => f.key === 'apiVersion');

    expect(field).toBeDefined();
    expect(field!.type).toBe('select');
    expect(field!.required).toBe(false);
    expect(field!.options).toEqual([{ value: 'v4', label: 'v4 (current)' }]);
  });

  test('accepts an explicitly selected supported version', async () => {
    const mockFetch = jest.fn().mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] });
    global.fetch = mockFetch as unknown as typeof fetch;
    const provider = new CourtListenerProvider();

    await provider.authenticate({ apiToken: 'secret-token', apiVersion: 'v4' });

    expect(provider.isAuthenticated()).toBe(true);
    expect(mockFetch).toHaveBeenLastCalledWith(
      'https://www.courtlistener.com/api/rest/v4/citation-lookup/',
      expect.objectContaining({ method: 'POST' })
    );
  });

  test('a blank apiVersion falls back to the stable default rather than failing', async () => {
    const mockFetch = jest.fn().mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] });
    global.fetch = mockFetch as unknown as typeof fetch;
    const provider = new CourtListenerProvider();

    await provider.authenticate({ apiToken: 'secret-token', apiVersion: '  ' });

    expect(provider.isAuthenticated()).toBe(true);
  });

  test('rejects an unsupported version with a descriptive setup-time error, before any network call', async () => {
    // A firm that explicitly pinned a version must hear that it isn't supported -- silently
    // degrading to the default would mean quietly different behavior than what they configured.
    const mockFetch = jest.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
    const provider = new CourtListenerProvider();

    await expect(provider.authenticate({ apiToken: 'secret-token', apiVersion: 'v99' })).rejects.toThrow(
      /Unsupported CourtListener API version "v99"\. Supported: v4\./
    );
    expect(provider.isAuthenticated()).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
