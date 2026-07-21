import { parseCaseCitation, extractCaseCitations } from '../src/providers/citationParser';
import { CitationProviderRegistry } from '../src/providers/registry';
import { CourtListenerProvider } from '../src/providers/courtListenerProvider';
import { LexisNexisProvider } from '../src/providers/lexisNexisProvider';
import { WestlawProvider } from '../src/providers/westlawProvider';
import { UsptoPatentCenterProvider } from '../src/providers/usptoPatentCenterProvider';
import { CitationProvider } from '../src/providers/types';

const EXAMPLE_CITATION = 'Norfolk & W. Ry. Co. v. Liepelt, 444 U.S. 490 (U.S.Ill., 1980)';

describe('parseCaseCitation', () => {
  test('parses case name, volume, reporter, page, court, and year', () => {
    expect(parseCaseCitation(EXAMPLE_CITATION)).toEqual({
      raw: EXAMPLE_CITATION,
      caseName: 'Norfolk & W. Ry. Co. v. Liepelt',
      volume: '444',
      reporter: 'U.S.',
      reporterRaw: 'U.S.',
      page: '490',
      court: 'U.S.Ill.',
      year: '1980',
    });
  });

  test('returns null for text that is not citation-shaped', () => {
    expect(parseCaseCitation('Just some regular text.')).toBeNull();
    expect(parseCaseCitation('')).toBeNull();
  });
});

describe('parseCaseCitation: Bluebook format coverage', () => {
  test('U.S. Reports citation with only a year in the parenthetical', () => {
    expect(parseCaseCitation('Brown v. Board of Education, 347 U.S. 483 (1954)')).toEqual({
      raw: 'Brown v. Board of Education, 347 U.S. 483 (1954)',
      caseName: 'Brown v. Board of Education',
      volume: '347',
      reporter: 'U.S.',
      reporterRaw: 'U.S.',
      page: '483',
      year: '1954',
    });
  });

  test('single-page pincite (a page range) is captured separately from the first page', () => {
    const parsed = parseCaseCitation('United States v. Nixon, 418 U.S. 683, 705-06 (1974)');
    expect(parsed).toMatchObject({
      caseName: 'United States v. Nixon',
      volume: '418',
      reporter: 'U.S.',
      page: '683',
      pincite: '705-06',
      year: '1974',
    });
  });

  test('single-page (non-range) pincite', () => {
    const parsed = parseCaseCitation('Norfolk & W. Ry. Co. v. Liepelt, 444 U.S. 490, 496 (1980)');
    expect(parsed).toMatchObject({ page: '490', pincite: '496', year: '1980' });
  });

  test('regional reporter (N.E.) with a court-and-year parenthetical', () => {
    const parsed = parseCaseCitation('Palsgraf v. Long Island R.R. Co., 162 N.E. 99 (N.Y. 1928)');
    expect(parsed).toMatchObject({
      caseName: 'Palsgraf v. Long Island R.R. Co.',
      volume: '162',
      reporter: 'N.E.',
      page: '99',
      court: 'N.Y.',
      year: '1928',
    });
  });

  test('multi-word reporter (F. Supp.) with a multi-word court abbreviation', () => {
    const parsed = parseCaseCitation('Hall v. Baxter Healthcare Corp., 947 F. Supp. 1387 (D. Or. 1996)');
    expect(parsed).toMatchObject({
      reporter: 'F. Supp.',
      page: '1387',
      court: 'D. Or.',
      year: '1996',
    });
  });

  test('regional reporter with a space before the series digit (So. 2d)', () => {
    const parsed = parseCaseCitation('Doe v. Roe, 955 So. 2d 425 (Fla. 2007)');
    expect(parsed).toMatchObject({ reporter: 'So. 2d', page: '425', court: 'Fla.', year: '2007' });
  });

  test('reporter series abbreviation with no internal space (F.3d)', () => {
    const parsed = parseCaseCitation('Smith v. Jones, 123 F.3d 456');
    expect(parsed).toMatchObject({ reporter: 'F.3d', page: '456' });
    expect(parsed?.year).toBeUndefined();
    expect(parsed?.court).toBeUndefined();
  });

  test('known limitation: nominative reporters in a parenthetical before the page are not parsed', () => {
    // "5 U.S. (1 Cranch) 137" -- the reporter segment can't skip over the parenthetical
    // nominative-reporter aside, so this returns null (skipped) rather than a wrong match.
    expect(parseCaseCitation('Marbury v. Madison, 5 U.S. (1 Cranch) 137 (1803)')).toBeNull();
  });

  test('multiple comma-separated pincites are captured as one list, not just the first', () => {
    // Regression test: found via manual validation against a real brief. The old single-pincite
    // pattern stopped after "505", leaving ", 508, 513 (1969)" -- including the year -- unmatched.
    const parsed = parseCaseCitation('Tinker v. Des Moines Indep. Cmty. Sch. Dist., 393 U.S. 503, 505, 508, 513 (1969)');
    expect(parsed).toMatchObject({ page: '503', pincite: '505, 508, 513', year: '1969' });
  });

  test('a reporter series suffix is not mistaken for the page number (F. Supp. 3d)', () => {
    // Regression test: found via manual validation. "\d+" alone matched just the "3" out of "3d",
    // and since everything after a page number is optional, the parse silently stopped there,
    // discarding the real page/pincite/parenthetical that followed.
    const parsed = parseCaseCitation('Schoenecker v. Koopman, 349 F. Supp. 3d 745, 753 (E.D. Wis. 2018)');
    expect(parsed).toMatchObject({
      reporter: 'F. Supp. 3d',
      page: '745',
      pincite: '753',
      court: 'E.D. Wis.',
      year: '2018',
    });
  });

  test('a footnote pincite ("n.1") between the pincite and parenthetical is parsed, not dropped', () => {
    // Regression test: found via manual validation against a real brief. The old pincite pattern
    // had nothing that could consume "n.1", so it stopped right after "567" and left the whole
    // court/year parenthetical -- including the year -- outside the match entirely, which the
    // top-level regex then rejected as unparseable ("no year" error) rather than reading through.
    const parsed = parseCaseCitation('Darlingh v. Maddaleni, 142 F.4th 558, 567 n.1 (7th Cir. 2025)');
    expect(parsed).toEqual({
      raw: 'Darlingh v. Maddaleni, 142 F.4th 558, 567 n.1 (7th Cir. 2025)',
      caseName: 'Darlingh v. Maddaleni',
      volume: '142',
      reporter: 'F.4th',
      reporterRaw: 'F.4th',
      page: '558',
      pincite: '567 n.1',
      court: '7th Cir.',
      year: '2025',
    });
  });

  test('a footnote pincite works alongside a multi-page pincite list', () => {
    const parsed = parseCaseCitation('Rundo, 990 F.3d 709, 719, 722 n.4 (9th Cir. 2021)');
    expect(parsed).toMatchObject({ page: '709', pincite: '719, 722 n.4', court: '9th Cir.', year: '2021' });
  });

  test('known limitation: a parallel citation to a second reporter is misparsed, not rejected', () => {
    // parseCaseCitation's caseName capture is deliberately unconstrained (it's meant to run on an
    // already-isolated citation substring), so when given a full parallel citation directly, it
    // backtracks past the first reporter/volume/page and treats the whole first citation as part of
    // the case name, parsing only the second (N.Y.S.2d) reporter -- a wrong answer, not a null one.
    // In the real pipeline this is less likely to bite: extractCaseCitations' stricter case-name
    // token pattern stops well before "24 Misc. 2d ...", since digits aren't a valid case-name token.
    const parsed = parseCaseCitation(
      'Brookville v. Paulgene Realty Corp., 24 Misc. 2d 790, 795-96, 200 N.Y.S.2d 126, 134 (Sup. Ct. 1960)'
    );
    expect(parsed?.reporter).toBe('N.Y.S.2d');
    expect(parsed?.caseName).toContain('24 Misc. 2d 790');
  });
});

describe('parseCaseCitation: short-form citations (Rule 10.9)', () => {
  test('parses "Name, Vol Reporter at Page" with no court/year, flagged isShortForm', () => {
    expect(parseCaseCitation('Rundo, 990 F.3d at 712')).toEqual({
      raw: 'Rundo, 990 F.3d at 712',
      caseName: 'Rundo',
      volume: '990',
      reporter: 'F.3d',
      reporterRaw: 'F.3d',
      pincite: '712',
      isShortForm: true,
    });
  });

  test('a short-form footnote pincite is captured in full', () => {
    const parsed = parseCaseCitation('Rundo, 990 F.3d at 712 n.2');
    expect(parsed).toMatchObject({ pincite: '712 n.2', isShortForm: true });
  });

  test('a short-form multi-page pincite list is captured in full', () => {
    const parsed = parseCaseCitation('Rundo, 990 F.3d at 712, 715');
    expect(parsed).toMatchObject({ pincite: '712, 715', isShortForm: true });
  });

  test('a long-form citation is never misparsed as a short form', () => {
    // Sanity check that the short-form fallback only ever runs after the long-form pattern has
    // already failed -- a normal long-form citation shouldn't come back flagged isShortForm.
    expect(parseCaseCitation(EXAMPLE_CITATION)?.isShortForm).toBeUndefined();
  });
});

describe('parseCaseCitation: "Id." citations (Rule 4.1/10.9(b))', () => {
  test('parses "Id. at Page" with no case name, volume, or reporter, flagged isShortForm and isIdCitation', () => {
    expect(parseCaseCitation('Id. at 715')).toEqual({
      raw: 'Id. at 715',
      pincite: '715',
      isShortForm: true,
      isIdCitation: true,
    });
  });

  test('a lowercase "id." is accepted too', () => {
    expect(parseCaseCitation('id. at 715')?.isIdCitation).toBe(true);
  });

  test('an "Id." footnote pincite is captured in full', () => {
    const parsed = parseCaseCitation('Id. at 719 n.2');
    expect(parsed).toMatchObject({ pincite: '719 n.2', isIdCitation: true });
  });

  test('an "Id." page-range pincite is captured in full', () => {
    const parsed = parseCaseCitation('Id. at 705-06');
    expect(parsed).toMatchObject({ pincite: '705-06', isIdCitation: true });
  });

  test('a bare "Id." with no pincite is not parsed -- nothing to check', () => {
    expect(parseCaseCitation('Id.')).toBeNull();
  });
});

describe('extractCaseCitations', () => {
  test('finds a full citation embedded in surrounding prose', () => {
    const text = `The court's holding in ${EXAMPLE_CITATION} affects the collateral source rule.`;
    expect(extractCaseCitations(text)).toContain(EXAMPLE_CITATION);
  });

  test('strips a leading Bluebook introductory signal from the match', () => {
    // "Accord" is itself capitalized-word-shaped, so unlike lowercase prose it isn't rejected by the
    // case-name token pattern on its own -- exercising the explicit signal-stripping step.
    const text = `Accord ${EXAMPLE_CITATION}.`;
    const results = extractCaseCitations(text);
    expect(results).toContain(EXAMPLE_CITATION);
    expect(results.some((r) => r.startsWith('Accord'))).toBe(false);
  });

  test('returns an empty array when no citation-shaped text is present', () => {
    expect(extractCaseCitations('Nothing to see here.')).toEqual([]);
  });

  test('captures a pincite as part of the extracted citation', () => {
    const text = 'As held in United States v. Nixon, 418 U.S. 683, 705-06 (1974), executive privilege is not absolute.';
    expect(extractCaseCitations(text)).toContain('United States v. Nixon, 418 U.S. 683, 705-06 (1974)');
  });

  test('finds multiple distinct citations in one passage without merging or dropping them', () => {
    const text =
      "Brown v. Board of Education, 347 U.S. 483 (1954), overruled Plessy v. Ferguson, 163 U.S. 537 (1896).";
    const results = extractCaseCitations(text);
    expect(results).toContain('Brown v. Board of Education, 347 U.S. 483 (1954)');
    expect(results).toContain('Plessy v. Ferguson, 163 U.S. 537 (1896)');
    expect(results).toHaveLength(2);
  });

  test('a footnote pincite no longer truncates the match before the court/year parenthetical', () => {
    const text =
      "Courts often refer to this as the Heckler's Veto doctrine. Darlingh v. Maddaleni, 142 F.4th 558, 567 n.1 (7th Cir. 2025); Rundo, 990 F.3d at 712.";
    const results = extractCaseCitations(text);
    expect(results).toContain('Darlingh v. Maddaleni, 142 F.4th 558, 567 n.1 (7th Cir. 2025)');
  });

  test('finds a short-form citation ("Name, Vol Reporter at Page") alongside a full one', () => {
    const text =
      'United States v. Rundo, 990 F.3d 709, 719 (9th Cir. 2021) (finding that messages inciting riots are not protected speech). ' +
      'Rundo, 990 F.3d at 712.';
    const results = extractCaseCitations(text);
    expect(results).toContain('United States v. Rundo, 990 F.3d 709, 719 (9th Cir. 2021)');
    expect(results).toContain('Rundo, 990 F.3d at 712');
  });

  test('a short-form citation with a footnote pincite is found', () => {
    const text = 'Later the court revisited the issue. Rundo, 990 F.3d at 712 n.2.';
    expect(extractCaseCitations(text)).toContain('Rundo, 990 F.3d at 712 n.2');
  });

  test('finds an "Id." citation with a pincite', () => {
    const text = 'Id. at 715. The court went on to explain the reasoning further.';
    expect(extractCaseCitations(text)).toContain('Id. at 715');
  });

  test('finds an "Id." citation with a footnote pincite, alongside other citations', () => {
    const text =
      'United States v. Rundo, 990 F.3d 709, 719 (9th Cir. 2021). Id. at 719 n.2. Rundo, 990 F.3d at 722.';
    const results = extractCaseCitations(text);
    expect(results).toContain('United States v. Rundo, 990 F.3d 709, 719 (9th Cir. 2021)');
    expect(results).toContain('Id. at 719 n.2');
    expect(results).toContain('Rundo, 990 F.3d at 722');
  });

  test('does not match a bare "Id." with no pincite -- nothing to check', () => {
    const text = 'The court agreed. Id. That resolved the matter.';
    expect(extractCaseCitations(text).some((r) => r === 'Id.' || r.startsWith('Id.'))).toBe(false);
  });
});

describe('CitationProviderRegistry', () => {
  test('registers and retrieves providers by id', () => {
    const registry = new CitationProviderRegistry();
    const provider = new CourtListenerProvider();
    registry.register(provider);

    expect(registry.get('courtlistener')).toBe(provider);
    expect(registry.list()).toContain(provider);
  });

  test('returns undefined for an unknown id', () => {
    const registry = new CitationProviderRegistry();
    expect(registry.get('nope')).toBeUndefined();
  });

  test('unregister removes a provider', () => {
    const registry = new CitationProviderRegistry();
    const provider = new CourtListenerProvider();
    registry.register(provider);
    registry.unregister(provider.id);
    expect(registry.get(provider.id)).toBeUndefined();
  });
});

describe('CourtListenerProvider', () => {
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

  test('returns a hyperlink match when the API resolves exactly one case', async () => {
    const mockFetch = jest.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
    const provider = await authenticatedProvider(mockFetch);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [
        {
          citation: '444 U.S. 490',
          status: 200,
          clusters: [
            {
              case_name: 'Norfolk & Western Railway Co. v. Liepelt',
              absolute_url: '/opinion/108713/norfolk-western-railway-co-v-liepelt/',
            },
          ],
        },
      ],
    });

    const match = await provider.lookupCitation({ raw: EXAMPLE_CITATION });

    expect(match).toEqual({
      url: 'https://www.courtlistener.com/opinion/108713/norfolk-western-railway-co-v-liepelt/',
      caseName: 'Norfolk & Western Railway Co. v. Liepelt',
      citation: '444 U.S. 490',
    });
    expect(mockFetch).toHaveBeenLastCalledWith(
      'https://www.courtlistener.com/api/rest/v4/citation-lookup/',
      expect.objectContaining({ method: 'POST' })
    );
  });

  test('moves on (returns null) when the citation is not found', async () => {
    const mockFetch = jest.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
    const provider = await authenticatedProvider(mockFetch);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [
        { citation: '1 U.S. 200', status: 404, clusters: [], error_message: "Citation not found: '1 U.S. 200'" },
      ],
    });

    await expect(provider.lookupCitation({ raw: '1 U.S. 200' })).resolves.toBeNull();
  });

  test('moves on (returns null) instead of throwing on a network failure', async () => {
    const mockFetch = jest.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
    const provider = await authenticatedProvider(mockFetch);

    mockFetch.mockRejectedValueOnce(new Error('network down'));

    await expect(provider.lookupCitation({ raw: EXAMPLE_CITATION })).resolves.toBeNull();
  });

  test('moves on (returns null) instead of throwing on a non-OK HTTP response', async () => {
    const mockFetch = jest.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
    const provider = await authenticatedProvider(mockFetch);

    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    await expect(provider.lookupCitation({ raw: EXAMPLE_CITATION })).resolves.toBeNull();
  });

  test('sends the API token in the Authorization header once connected', async () => {
    const mockFetch = jest.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
    const provider = await authenticatedProvider(mockFetch);

    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] });
    await provider.lookupCitation({ raw: EXAMPLE_CITATION });

    const lookupCallOptions = mockFetch.mock.calls[1][1];
    expect(lookupCallOptions.headers.Authorization).toBe('Token secret-token');
  });

  test('requires an API token -- both isAuthenticated() and lookupCitation() reflect this without one', async () => {
    const mockFetch = jest.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
    const provider = new CourtListenerProvider();

    expect(provider.requiresAuth).toBe(true);
    expect(provider.isAuthenticated()).toBe(false);
    await expect(provider.lookupCitation({ raw: EXAMPLE_CITATION })).resolves.toBeNull();
    // Confirms this is a local short-circuit, not a wasted network round-trip that always 401s.
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('authenticate() rejects an empty token, since CourtListener requires one', async () => {
    const provider = new CourtListenerProvider();
    await expect(provider.authenticate({ apiToken: '' })).rejects.toThrow(/requires an API token/);
    expect(provider.isAuthenticated()).toBe(false);
  });

  // Regression test for 02-REVIEW.md WR-03 (gap 1): a network failure during the verification
  // request used to reject with whatever raw error the fetch implementation threw, not the
  // descriptive Error this module's convention (and CLAUDE.md's error-handling section) calls for
  // at setup time.
  test('authenticate() surfaces a descriptive error (not a raw one) on a network failure during verification', async () => {
    const mockFetch = jest.fn().mockRejectedValue(new Error('network down'));
    global.fetch = mockFetch as unknown as typeof fetch;
    const provider = new CourtListenerProvider();

    await expect(provider.authenticate({ apiToken: 'secret-token' })).rejects.toThrow(
      /Could not reach CourtListener to verify the API token/
    );
    expect(provider.isAuthenticated()).toBe(false);
  });

  // Regression test for 02-REVIEW.md WR-03 (gap 2): any response status other than 401/403 (a
  // 500, a 429 rate-limit, a malformed response) used to be treated as "token accepted," silently
  // storing (and later using) a token that was never actually confirmed valid.
  test('authenticate() rejects the token when verification returns a non-ok, non-401/403 response (e.g. 500)', async () => {
    const mockFetch = jest.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    global.fetch = mockFetch as unknown as typeof fetch;
    const provider = new CourtListenerProvider();

    await expect(provider.authenticate({ apiToken: 'secret-token' })).rejects.toThrow(
      /Could not verify the API token/
    );
    expect(provider.isAuthenticated()).toBe(false);
  });

  test('authenticate() rejects the token when verification is rate-limited (429), rather than accepting it unverified', async () => {
    const mockFetch = jest.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({ detail: 'Request was throttled.' }) });
    global.fetch = mockFetch as unknown as typeof fetch;
    const provider = new CourtListenerProvider();

    await expect(provider.authenticate({ apiToken: 'secret-token' })).rejects.toThrow(
      /Could not verify the API token/
    );
    expect(provider.isAuthenticated()).toBe(false);
  });

  test('is authenticated once connected with a real token', async () => {
    const mockFetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    global.fetch = mockFetch as unknown as typeof fetch;
    const provider = new CourtListenerProvider();
    await provider.authenticate({ apiToken: 'secret-token' });
    expect(provider.isAuthenticated()).toBe(true);
  });

  // Regression test for 02-REVIEW.md WR-02: when case-name matching narrows the candidate
  // clusters to MORE than one (but not exactly one), the old fallback discarded those name-matched
  // candidates entirely and fell back to whichever cluster happened to be first in the raw API
  // response -- which may not even be one of the name-matched candidates. This asserts the fix
  // prefers a name-matched candidate over the unfiltered first-in-response fallback.
  test('WR-02 regression: prefers a name-matched candidate over an unfiltered fallback when 2+ clusters match by name', async () => {
    const mockFetch = jest.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
    const provider = await authenticatedProvider(mockFetch);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [
        {
          citation: '10 F.3d 20',
          status: 200,
          clusters: [
            // First in the raw response, but does not match the citation's case name at all.
            { case_name: 'Acme Corp. v. Widget Co.', absolute_url: '/opinion/999/acme-widget/' },
            // Both of these tolerate-match "Smith v. Jones" via caseNamesMatch's abbreviation
            // handling, so named.length === 2 -- not exactly one, so `disambiguated` is undefined.
            { case_name: 'Smith v. Jones', absolute_url: '/opinion/111/smith-v-jones/' },
            { case_name: 'Smith v. Jones, Inc.', absolute_url: '/opinion/222/smith-v-jones-inc/' },
          ],
        },
      ],
    });

    const match = await provider.lookupCitation({ raw: '10 F.3d 20', caseName: 'Smith v. Jones' });

    expect(match).not.toBeNull();
    expect(match!.ambiguousMatch).toEqual({ candidateCount: 3 });
    // Must be one of the name-matched candidates, never the unrelated first-in-response cluster.
    expect(match!.caseName).not.toBe('Acme Corp. v. Widget Co.');
    expect(match!.caseName).toBe('Smith v. Jones');
    expect(match!.url).toBe('https://www.courtlistener.com/opinion/111/smith-v-jones/');
  });

  describe('rate-limit awareness (supportsRateLimitAwareness)', () => {
    test('wasLastRequestRateLimited() is false before any lookup', () => {
      expect(new CourtListenerProvider().wasLastRequestRateLimited()).toBe(false);
    });

    test('reports rateLimited (not a plain miss) when the API returns 429', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
      global.fetch = mockFetch as unknown as typeof fetch;
      const provider = new CourtListenerProvider();
      await provider.authenticate({ apiToken: 'secret-token' });

      mockFetch.mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({ detail: 'Request was throttled.' }) });

      const match = await provider.lookupCitation({ raw: EXAMPLE_CITATION });
      expect(match).toBeNull();
      expect(provider.wasLastRequestRateLimited()).toBe(true);
    });

    test('resets wasLastRequestRateLimited() on a subsequent successful lookup', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
      global.fetch = mockFetch as unknown as typeof fetch;
      const provider = new CourtListenerProvider();
      await provider.authenticate({ apiToken: 'secret-token' });

      mockFetch.mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({ detail: 'Request was throttled.' }) });
      await provider.lookupCitation({ raw: EXAMPLE_CITATION });
      expect(provider.wasLastRequestRateLimited()).toBe(true);

      mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] });
      await provider.lookupCitation({ raw: EXAMPLE_CITATION });
      expect(provider.wasLastRequestRateLimited()).toBe(false);
    });

    test('a plain 404/not-found response does not report rateLimited', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
      global.fetch = mockFetch as unknown as typeof fetch;
      const provider = new CourtListenerProvider();
      await provider.authenticate({ apiToken: 'secret-token' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [{ citation: '1 U.S. 200', status: 404, clusters: [] }],
      });

      const match = await provider.lookupCitation({ raw: '1 U.S. 200' });
      expect(match).toBeNull();
      expect(provider.wasLastRequestRateLimited()).toBe(false);
    });
  });

  describe('fetchOpinionExcerpt (Embed Cited Text)', () => {
    test('is not ready, and returns null, without an API token', async () => {
      const provider = new CourtListenerProvider();
      expect(provider.isReadyForOpinionText()).toBe(false);
      await expect(provider.fetchOpinionExcerpt({ raw: EXAMPLE_CITATION }, [705])).resolves.toEqual({ excerpt: null });
    });

    test('is ready once connected with an API token', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] }) as unknown as typeof fetch;
      const provider = new CourtListenerProvider();
      await provider.authenticate({ apiToken: 'secret-token' });
      expect(provider.isReadyForOpinionText()).toBe(true);
    });

    test('returns null for an empty target-pages list, without making a request', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
      global.fetch = mockFetch as unknown as typeof fetch;
      const provider = new CourtListenerProvider();
      await provider.authenticate({ apiToken: 'secret-token' });
      mockFetch.mockClear();

      await expect(provider.fetchOpinionExcerpt({ raw: EXAMPLE_CITATION }, [])).resolves.toEqual({ excerpt: null });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('resolves the cluster via citation-lookup, then fetches and extracts the opinion excerpt', async () => {
      const mockFetch = jest.fn();
      global.fetch = mockFetch as unknown as typeof fetch;

      const provider = new CourtListenerProvider();
      // Call 0: authenticate()'s validation request.
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] });
      await provider.authenticate({ apiToken: 'secret-token' });

      // Call 1: resolveClusterId's citation-lookup request.
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [
          {
            citation: '444 U.S. 490',
            status: 200,
            clusters: [{ absolute_url: '/opinion/108713/norfolk-western-railway-co-v-liepelt/' }],
          },
        ],
      });
      // Call 2: the opinions-by-cluster request.
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          results: [{ plain_text: '*489 Intro.\n*490 Holding starts here.\n*491 More text.' }],
        }),
      });

      const { excerpt } = await provider.fetchOpinionExcerpt({ raw: EXAMPLE_CITATION }, [490]);
      expect(excerpt).toContain('Holding starts here.');

      expect(mockFetch).toHaveBeenCalledTimes(3);
      const opinionsCallUrl = mockFetch.mock.calls[2][0];
      const opinionsCallOptions = mockFetch.mock.calls[2][1];
      expect(opinionsCallUrl).toBe('https://www.courtlistener.com/api/rest/v4/opinions/?cluster=108713');
      expect(opinionsCallOptions.headers.Authorization).toBe('Token secret-token');
    });

    test('returns null when the citation cannot be resolved to a cluster', async () => {
      const mockFetch = jest.fn();
      global.fetch = mockFetch as unknown as typeof fetch;

      const provider = new CourtListenerProvider();
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] });
      await provider.authenticate({ apiToken: 'secret-token' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [{ citation: '1 U.S. 200', status: 404, clusters: [] }],
      });

      await expect(provider.fetchOpinionExcerpt({ raw: '1 U.S. 200' }, [200])).resolves.toEqual({ excerpt: null });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test('reports rateLimited (not a plain miss) when citation-lookup returns 429', async () => {
      const mockFetch = jest.fn();
      global.fetch = mockFetch as unknown as typeof fetch;

      const provider = new CourtListenerProvider();
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] });
      await provider.authenticate({ apiToken: 'secret-token' });

      mockFetch.mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({ detail: 'Request was throttled.' }) });

      await expect(provider.fetchOpinionExcerpt({ raw: EXAMPLE_CITATION }, [490])).resolves.toEqual({
        excerpt: null,
        rateLimited: true,
      });
      // Only the citation-lookup call should fire -- no point calling the opinions endpoint too.
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test('reports rateLimited when the opinions-by-cluster request returns 429', async () => {
      const mockFetch = jest.fn();
      global.fetch = mockFetch as unknown as typeof fetch;

      const provider = new CourtListenerProvider();
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] });
      await provider.authenticate({ apiToken: 'secret-token' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [
          {
            citation: '444 U.S. 490',
            status: 200,
            clusters: [{ absolute_url: '/opinion/108713/norfolk-western-railway-co-v-liepelt/' }],
          },
        ],
      });
      mockFetch.mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({ detail: 'Request was throttled.' }) });

      await expect(provider.fetchOpinionExcerpt({ raw: EXAMPLE_CITATION }, [490])).resolves.toEqual({
        excerpt: null,
        rateLimited: true,
      });
    });

    test('returns null when the opinion text has no marker for the requested page', async () => {
      const mockFetch = jest.fn();
      global.fetch = mockFetch as unknown as typeof fetch;

      const provider = new CourtListenerProvider();
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] });
      await provider.authenticate({ apiToken: 'secret-token' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [
          {
            citation: '444 U.S. 490',
            status: 200,
            clusters: [{ absolute_url: '/opinion/108713/norfolk-western-railway-co-v-liepelt/' }],
          },
        ],
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ results: [{ plain_text: '*489 Intro.\n*490 Holding starts here.' }] }),
      });

      await expect(provider.fetchOpinionExcerpt({ raw: EXAMPLE_CITATION }, [999])).resolves.toEqual({ excerpt: null });
    });

    test('falls back to stripped HTML when plain_text is unavailable', async () => {
      const mockFetch = jest.fn();
      global.fetch = mockFetch as unknown as typeof fetch;

      const provider = new CourtListenerProvider();
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] });
      await provider.authenticate({ apiToken: 'secret-token' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [
          {
            citation: '444 U.S. 490',
            status: 200,
            clusters: [{ absolute_url: '/opinion/108713/norfolk-western-railway-co-v-liepelt/' }],
          },
        ],
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          results: [{ html_with_citations: '<p>*489 Intro.</p><p>*490 <b>Holding</b> from HTML.</p>' }],
        }),
      });

      const { excerpt } = await provider.fetchOpinionExcerpt({ raw: EXAMPLE_CITATION }, [490]);
      expect(excerpt).toContain('Holding from HTML.');
    });

    // Regression test for 02-REVIEW.md CR-01: resolveClusterId (used exclusively by
    // fetchOpinionExcerpt) used to take clusters[0] unconditionally, with no case-name
    // disambiguation and no ambiguity signal at all. A caller using "Embed Cited Text" on an
    // ambiguous citation could silently attach a different case's opinion text into the document
    // under the citation the user actually wrote.
    test('CR-01 regression: refuses to fetch/return opinion text when the locator resolves to an ambiguous match', async () => {
      const mockFetch = jest.fn();
      global.fetch = mockFetch as unknown as typeof fetch;

      const provider = new CourtListenerProvider();
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] });
      await provider.authenticate({ apiToken: 'secret-token' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [
          {
            citation: '114 F.3d 1182',
            status: 200,
            clusters: [
              { case_name: 'Doe v. Roe', absolute_url: '/opinion/111/doe-v-roe/' },
              { case_name: 'Smith v. Jones', absolute_url: '/opinion/222/smith-v-jones/' },
            ],
          },
        ],
      });

      // Neither cluster's case_name matches the citing document's own parsed case name, so
      // case-name disambiguation cannot narrow this to a single confident match.
      const result = await provider.fetchOpinionExcerpt(
        { raw: '114 F.3d 1182', caseName: 'Unrelated Party v. Another Party' },
        [1182]
      );

      expect(result).toEqual({ excerpt: null, ambiguousMatch: { candidateCount: 2 } });
      // Only the citation-lookup call fires -- the opinions-by-cluster endpoint must never be hit
      // once the locator is known to be ambiguous.
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test('CR-01 regression: still resolves and returns the opinion excerpt when case name disambiguates a multi-cluster locator', async () => {
      const mockFetch = jest.fn();
      global.fetch = mockFetch as unknown as typeof fetch;

      const provider = new CourtListenerProvider();
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] });
      await provider.authenticate({ apiToken: 'secret-token' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [
          {
            citation: '114 F.3d 1182',
            status: 200,
            clusters: [
              { case_name: 'Doe v. Roe', absolute_url: '/opinion/111/doe-v-roe/' },
              { case_name: 'Smith v. Jones', absolute_url: '/opinion/222/smith-v-jones/' },
            ],
          },
        ],
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ results: [{ plain_text: '*1182 Holding for Smith v. Jones.' }] }),
      });

      const result = await provider.fetchOpinionExcerpt({ raw: '114 F.3d 1182', caseName: 'Smith v. Jones' }, [1182]);

      expect(result.ambiguousMatch).toBeUndefined();
      expect(result.excerpt).toContain('Holding for Smith v. Jones.');
    });
  });
});

describe('EnterpriseCitationProvider (LexisNexis as representative)', () => {
  test('rejects authenticate() when required fields are missing', async () => {
    const provider = new LexisNexisProvider();
    await expect(provider.authenticate({ apiBaseUrl: '', clientId: '', clientSecret: '' })).rejects.toThrow(
      /Missing required field/
    );
  });

  test('lookupCitation returns null (move on) when not authenticated, without throwing', async () => {
    const provider: CitationProvider = new LexisNexisProvider();
    await expect(provider.lookupCitation({ raw: EXAMPLE_CITATION })).resolves.toBeNull();
  });

  test('is not authenticated until authenticate() succeeds', () => {
    expect(new LexisNexisProvider().isAuthenticated()).toBe(false);
  });

  test('rejects a non-HTTPS API base URL before ever attempting to connect', async () => {
    const provider = new LexisNexisProvider();
    await expect(
      provider.authenticate({ apiBaseUrl: 'http://insecure.example.com', clientId: 'id', clientSecret: 'secret' })
    ).rejects.toThrow(/https/i);
    expect(provider.isAuthenticated()).toBe(false);
  });
});

describe('EnterpriseCitationProvider OAuth2 token request shape (Westlaw / LexisNexis)', () => {
  // These vendors' real token shapes differ in confirmed ways (see
  // .planning/research/vendor-oauth-endpoints-code-evidence.md): Thomson Reuters uses a single
  // fixed CIAM token host with the credentials in the body plus a required `audience`; LexisNexis
  // uses a fixed auth-api host with HTTP Basic credentials and a required `scope`, no `audience`.
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function tokenOkFetch(): jest.Mock {
    return jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ access_token: 't0ken' }) });
  }

  // --- Westlaw / Thomson Reuters: body credentials + required audience, fixed CIAM token host ---

  test('Westlaw: rejects authenticate() when the required audience is missing', async () => {
    const provider = new WestlawProvider();
    await expect(
      provider.authenticate({ apiBaseUrl: 'https://tenant.api.thomsonreuters.com', clientId: 'id', clientSecret: 'secret' })
    ).rejects.toThrow(/Missing required field.*Audience/i);
  });

  test('Westlaw: posts client-credentials to the fixed Thomson Reuters token host with audience in the body', async () => {
    const mockFetch = tokenOkFetch();
    global.fetch = mockFetch as unknown as typeof fetch;
    const provider = new WestlawProvider();

    await provider.authenticate({
      apiBaseUrl: 'https://tenant.api.thomsonreuters.com',
      clientId: 'id-123',
      clientSecret: 'secret-xyz',
      audience: 'aud-guid-42',
      scope: 's1 s2',
    });
    expect(provider.isAuthenticated()).toBe(true);

    const [url, init] = mockFetch.mock.calls[0];
    // Fixed CIAM host, NOT derived by concatenating a path onto apiBaseUrl.
    expect(url).toBe('https://auth.thomsonreuters.com/oauth/token');
    const body = init.body as URLSearchParams;
    expect(body.get('grant_type')).toBe('client_credentials');
    expect(body.get('client_id')).toBe('id-123');
    expect(body.get('client_secret')).toBe('secret-xyz');
    expect(body.get('audience')).toBe('aud-guid-42');
    expect(body.get('scope')).toBe('s1 s2');
    // TR carries credentials in the body, so there must be no Basic header.
    expect(init.headers['Authorization']).toBeUndefined();
  });

  test('Westlaw: honors an explicit tokenUrl override verbatim', async () => {
    const mockFetch = tokenOkFetch();
    global.fetch = mockFetch as unknown as typeof fetch;

    await new WestlawProvider().authenticate({
      apiBaseUrl: 'https://tenant.api.thomsonreuters.com',
      clientId: 'id',
      clientSecret: 'secret',
      audience: 'aud',
      tokenUrl: 'https://auth.eu.thomsonreuters.com/oauth/token',
    });
    expect(mockFetch.mock.calls[0][0]).toBe('https://auth.eu.thomsonreuters.com/oauth/token');
  });

  test('Westlaw: rejects an http:// tokenUrl before the client secret is sent anywhere', async () => {
    const mockFetch = tokenOkFetch();
    global.fetch = mockFetch as unknown as typeof fetch;
    const provider = new WestlawProvider();

    await expect(
      provider.authenticate({
        apiBaseUrl: 'https://tenant.api.thomsonreuters.com',
        clientId: 'id',
        clientSecret: 'secret',
        audience: 'aud',
        tokenUrl: 'http://auth.insecure.example/oauth/token',
      })
    ).rejects.toThrow(/https/i);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(provider.isAuthenticated()).toBe(false);
  });

  // --- LexisNexis: HTTP Basic credentials + required scope (no audience), fixed auth-api host ---

  test('LexisNexis: posts to the fixed auth-api host using HTTP Basic credentials and the default scope', async () => {
    const mockFetch = tokenOkFetch();
    global.fetch = mockFetch as unknown as typeof fetch;
    const provider = new LexisNexisProvider();

    await provider.authenticate({
      apiBaseUrl: 'https://tenant.api.lexisnexis.com',
      clientId: 'lex-id',
      clientSecret: 'lex-secret',
    });
    expect(provider.isAuthenticated()).toBe(true);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://auth-api.lexisnexis.com/oauth/v2/token');
    const body = init.body as URLSearchParams;
    expect(body.get('grant_type')).toBe('client_credentials');
    expect(body.get('scope')).toBe('http://oauth.lexisnexis.com/all');
    // Lexis carries credentials in the Basic header, so they must NOT appear in the body,
    // and there is no audience parameter.
    expect(body.get('client_id')).toBeNull();
    expect(body.get('client_secret')).toBeNull();
    expect(body.get('audience')).toBeNull();
    const authHeader = init.headers['Authorization'] as string;
    expect(authHeader.startsWith('Basic ')).toBe(true);
    const decoded = Buffer.from(authHeader.slice('Basic '.length), 'base64').toString('utf8');
    expect(decoded).toBe('lex-id:lex-secret');
  });

  test('LexisNexis: honors explicit tokenUrl and scope overrides', async () => {
    const mockFetch = tokenOkFetch();
    global.fetch = mockFetch as unknown as typeof fetch;

    await new LexisNexisProvider().authenticate({
      apiBaseUrl: 'https://tenant.api.lexisnexis.com',
      clientId: 'id',
      clientSecret: 'secret',
      tokenUrl: 'https://auth-api.lexisnexis.com/oauth/v2/token/custom',
      scope: 'http://oauth.lexisnexis.com/limited',
    });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://auth-api.lexisnexis.com/oauth/v2/token/custom');
    expect((init.body as URLSearchParams).get('scope')).toBe('http://oauth.lexisnexis.com/limited');
  });

  test('LexisNexis: rejects an http:// tokenUrl before the client secret is sent anywhere', async () => {
    const mockFetch = tokenOkFetch();
    global.fetch = mockFetch as unknown as typeof fetch;
    const provider = new LexisNexisProvider();

    await expect(
      provider.authenticate({
        apiBaseUrl: 'https://tenant.api.lexisnexis.com',
        clientId: 'id',
        clientSecret: 'secret',
        tokenUrl: 'http://auth-api.insecure.example/oauth/v2/token',
      })
    ).rejects.toThrow(/https/i);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('surfaces a descriptive error (not a raw one) when the token endpoint rejects the credentials', async () => {
    const mockFetch = jest.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    global.fetch = mockFetch as unknown as typeof fetch;

    await expect(
      new WestlawProvider().authenticate({
        apiBaseUrl: 'https://tenant.api.thomsonreuters.com',
        clientId: 'id',
        clientSecret: 'secret',
        audience: 'aud',
      })
    ).rejects.toThrow(/Authentication failed \(HTTP 401\)/);
  });
});

describe('UsptoPatentCenterProvider (TODO placeholder)', () => {
  test('is registered but always defers (returns null)', async () => {
    const provider = new UsptoPatentCenterProvider();
    await expect(provider.lookupCitation({ raw: EXAMPLE_CITATION })).resolves.toBeNull();
  });

  test('authenticate() rejects since the integration is not implemented yet', async () => {
    await expect(new UsptoPatentCenterProvider().authenticate({})).rejects.toThrow(/not implemented/);
  });
});
