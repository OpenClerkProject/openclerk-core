import { getHttpClient, setHttpClient, resetHttpClient, fetchHttpClient, HttpClient } from '../src/http';

describe('http client override', () => {
  afterEach(() => {
    resetHttpClient();
  });

  it('defaults to the fetch-backed client', () => {
    expect(getHttpClient()).toBe(fetchHttpClient);
  });

  it('lets a host swap in its own client', async () => {
    const custom: HttpClient = {
      fetch: jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ hello: 'world' }) }),
    };

    setHttpClient(custom);
    expect(getHttpClient()).toBe(custom);

    const response = await getHttpClient().fetch('https://example.com');
    expect(custom.fetch).toHaveBeenCalledWith('https://example.com');
    expect(await response.json()).toEqual({ hello: 'world' });
  });

  it('resetHttpClient restores the default', () => {
    setHttpClient({ fetch: jest.fn() });
    resetHttpClient();
    expect(getHttpClient()).toBe(fetchHttpClient);
  });
});
