import { checkCitationsForHallucinations } from '../src/providers/hallucinationCheck';
import { CitationProvider, CitationMatch, ParsedCitation, isLinkOnlyProvider } from '../src/providers/types';
import { CourtListenerProvider } from '../src/providers/courtListenerProvider';
import { LexisNexisProvider } from '../src/providers/lexisNexisProvider';
import { WestlawProvider } from '../src/providers/westlawProvider';
import { BloombergLawProvider } from '../src/providers/bloombergLawProvider';

// A provider whose lookupCitation ALWAYS returns a clean, name-matching CitationMatch -- i.e. the
// strongest possible "verified" signal. The only thing that should decide whether that match is
// allowed to become a verification is the link-only marker, not the match itself. `lookupSpy` lets
// us assert a link-only provider is never even called.
function alwaysMatchesProvider(name: string, opts: { linkOnly?: boolean } = {}): CitationProvider & { lookupSpy: jest.Mock } {
  const lookupSpy = jest.fn(
    async (citation: ParsedCitation): Promise<CitationMatch | null> => ({
      url: 'https://example.test/case',
      caseName: citation.caseName,
    })
  );
  const provider: CitationProvider & { lookupSpy: jest.Mock } = {
    id: name.toLowerCase().replace(/\s+/g, '-'),
    name,
    description: 'test double',
    requiresAuth: false,
    credentialFields: [],
    isAuthenticated: () => true,
    authenticate: async () => undefined,
    signOut: () => undefined,
    lookupCitation: lookupSpy,
    lookupSpy,
  };
  if (opts.linkOnly) {
    (provider as { linkOnly?: boolean }).linkOnly = true;
  }
  return provider;
}

describe('isLinkOnlyProvider', () => {
  test('the enterprise research vendors are link-only by default', () => {
    // Fail-safe default: a contract-gated vendor is quarantined from verification unless it opts
    // out. None of these has an anonymous, programmatic citation-verification path (see
    // .planning/research/westlaw-lexisnexis-integration.md).
    expect(isLinkOnlyProvider(new LexisNexisProvider())).toBe(true);
    expect(isLinkOnlyProvider(new WestlawProvider())).toBe(true);
    expect(isLinkOnlyProvider(new BloombergLawProvider())).toBe(true);
  });

  test('CourtListener, the verification-capable provider, is NOT link-only', () => {
    expect(isLinkOnlyProvider(new CourtListenerProvider())).toBe(false);
  });

  test('a plain object without the marker is not link-only', () => {
    expect(isLinkOnlyProvider(alwaysMatchesProvider('Plain'))).toBe(false);
  });
});

describe('checkCitationsForHallucinations quarantines link-only providers', () => {
  const CITATION = 'Peterson v. Iran Air, 905 F. Supp. 2d 121 (D.D.C. 2012)';

  test('a link-only provider never sets verifiedVia, even when its lookup would return a matching case', async () => {
    // This is the load-bearing safety test: the provider WOULD hand back a clean name-matching
    // match, but because it is link-only that match must never be mistaken for a confirmed
    // citation -- the false-"verified" outcome the Core Value forbids.
    const linkOnly = alwaysMatchesProvider('Westlaw', { linkOnly: true });

    const results = await checkCitationsForHallucinations([CITATION], [linkOnly]);

    expect(results[0].verifiedVia).toBeNull();
    expect(results[0].linkOnlyProviders).toEqual(['Westlaw']);
    // It must not even be consulted for a match -- verification is not its job at all.
    expect(linkOnly.lookupSpy).not.toHaveBeenCalled();
  });

  test('an otherwise-identical provider that is NOT link-only does verify -- proving the marker is what makes the difference', async () => {
    const verifying = alwaysMatchesProvider('CourtListener');

    const results = await checkCitationsForHallucinations([CITATION], [verifying]);

    expect(results[0].verifiedVia).toBe('CourtListener');
    expect(results[0].linkOnlyProviders).toEqual([]);
    expect(verifying.lookupSpy).toHaveBeenCalledTimes(1);
  });

  test('a link-only provider is skipped for verification but a later verification-capable provider still verifies', async () => {
    const linkOnly = alwaysMatchesProvider('LexisNexis', { linkOnly: true });
    const verifying = alwaysMatchesProvider('CourtListener');

    const results = await checkCitationsForHallucinations([CITATION], [linkOnly, verifying]);

    expect(results[0].verifiedVia).toBe('CourtListener');
    expect(results[0].linkOnlyProviders).toEqual(['LexisNexis']);
    expect(linkOnly.lookupSpy).not.toHaveBeenCalled();
    expect(verifying.lookupSpy).toHaveBeenCalledTimes(1);
  });

  test('with only link-only providers, the citation is left unverified (reported, not silently verified)', async () => {
    const westlaw = alwaysMatchesProvider('Westlaw', { linkOnly: true });
    const lexis = alwaysMatchesProvider('LexisNexis', { linkOnly: true });

    const results = await checkCitationsForHallucinations([CITATION], [westlaw, lexis]);

    expect(results[0].verifiedVia).toBeNull();
    expect(results[0].linkOnlyProviders).toEqual(['Westlaw', 'LexisNexis']);
    expect(results[0].nameMismatch).toBeUndefined();
    expect(results[0].ambiguousMatch).toBeUndefined();
  });
});
