import { EnterpriseCitationProvider } from '../src/providers/base';
import { CitationMatch, ParsedCitation, ProviderCredentialField } from '../src/providers/types';

/**
 * A minimal concrete EnterpriseCitationProvider used only to exercise the shared endpoint-URL
 * validation in authenticate(). verifyCredentials()/lookupCitation() are inert no-ops so the tests
 * hit no network: the SSRF/https checks run before verifyCredentials(), and the accept-path tests
 * only need it to resolve.
 */
class TestEnterpriseProvider extends EnterpriseCitationProvider {
  readonly id = 'test-enterprise';
  readonly name = 'Test Enterprise Provider';
  readonly description = 'Minimal enterprise provider for endpoint URL validation tests.';
  readonly credentialFields: ProviderCredentialField[] = [
    { key: 'apiBaseUrl', label: 'API base URL', type: 'text' },
    { key: 'tokenUrl', label: 'OAuth token URL (optional)', type: 'text', required: false },
  ];

  constructor(allowPrivateNetworkEndpoints = false) {
    super();
    this.allowPrivateNetworkEndpoints = allowPrivateNetworkEndpoints;
  }

  protected async verifyCredentials(): Promise<void> {
    return;
  }

  async lookupCitation(_citation: ParsedCitation): Promise<CitationMatch | null> {
    return null;
  }
}

describe('EnterpriseCitationProvider endpoint URL validation (SSRF hardening)', () => {
  // Blocked-by-default hosts that share the loopback/link-local/private-network error message.
  const blockedHosts: Array<[string, string]> = [
    ['loopback IPv4 (127.0.0.1)', 'https://127.0.0.1'],
    ['IPv6 loopback ([::1])', 'https://[::1]'],
    ['private 10.0.0.0/8', 'https://10.0.0.5'],
    ['private 192.168.0.0/16', 'https://192.168.1.1'],
    ['private 172.16.0.0/12', 'https://172.16.0.1'],
    ['named localhost', 'https://localhost'],
    ['localhost subdomain', 'https://api.localhost'],
    ['link-local IPv6 (fe80::/10)', 'https://[fe80::1]'],
    ['unique-local IPv6 (fc00::/7)', 'https://[fc00::1]'],
    ['IPv4-mapped private IPv6', 'https://[::ffff:192.168.1.1]'],
  ];

  test.each(blockedHosts)('rejects a %s apiBaseUrl by default', async (_label, url) => {
    const provider = new TestEnterpriseProvider();
    await expect(provider.authenticate({ apiBaseUrl: url })).rejects.toThrow(
      /loopback, link-local, or private-network/
    );
    expect(provider.isAuthenticated()).toBe(false);
  });

  test('rejects a non-https apiBaseUrl on scheme (before any host check)', async () => {
    const provider = new TestEnterpriseProvider();
    await expect(provider.authenticate({ apiBaseUrl: 'http://host.example.com' })).rejects.toThrow(/https/i);
    expect(provider.isAuthenticated()).toBe(false);
  });

  test('rejects a value that is not a valid URL at all', async () => {
    const provider = new TestEnterpriseProvider();
    await expect(provider.authenticate({ apiBaseUrl: 'not a url' })).rejects.toThrow(/not a valid URL/);
    expect(provider.isAuthenticated()).toBe(false);
  });

  test('rejects the cloud metadata address (169.254.169.254)', async () => {
    const provider = new TestEnterpriseProvider();
    await expect(provider.authenticate({ apiBaseUrl: 'https://169.254.169.254' })).rejects.toThrow(/metadata/i);
    expect(provider.isAuthenticated()).toBe(false);
  });

  test('accepts a normal public https host', async () => {
    const provider = new TestEnterpriseProvider();
    await provider.authenticate({ apiBaseUrl: 'https://api.vendor.example.com' });
    expect(provider.isAuthenticated()).toBe(true);
  });

  test('validates tokenUrl independently: public apiBaseUrl + private tokenUrl host is rejected', async () => {
    const provider = new TestEnterpriseProvider();
    await expect(
      provider.authenticate({
        apiBaseUrl: 'https://api.vendor.example.com',
        tokenUrl: 'https://127.0.0.1/oauth/token',
      })
    ).rejects.toThrow(/loopback, link-local, or private-network/);
    expect(provider.isAuthenticated()).toBe(false);
  });

  test('allows a public apiBaseUrl paired with a different public tokenUrl host (hosts need not match)', async () => {
    const provider = new TestEnterpriseProvider();
    await provider.authenticate({
      apiBaseUrl: 'https://tenant.api.vendor.example.com',
      tokenUrl: 'https://auth.vendor.example.com/oauth/token',
    });
    expect(provider.isAuthenticated()).toBe(true);
  });

  describe('allowPrivateNetworkEndpoints (on-prem opt-out)', () => {
    test('accepts a private host (10.0.0.5) when enabled', async () => {
      const provider = new TestEnterpriseProvider(true);
      await provider.authenticate({ apiBaseUrl: 'https://10.0.0.5' });
      expect(provider.isAuthenticated()).toBe(true);
    });

    test('STILL rejects the cloud metadata address even when enabled', async () => {
      const provider = new TestEnterpriseProvider(true);
      await expect(provider.authenticate({ apiBaseUrl: 'https://169.254.169.254' })).rejects.toThrow(/metadata/i);
      expect(provider.isAuthenticated()).toBe(false);
    });

    test('STILL enforces https:// even when enabled', async () => {
      const provider = new TestEnterpriseProvider(true);
      await expect(provider.authenticate({ apiBaseUrl: 'http://10.0.0.5' })).rejects.toThrow(/https/i);
      expect(provider.isAuthenticated()).toBe(false);
    });
  });
});
