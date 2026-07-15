import {
  parseCaseCitation,
  extractCaseCitations,
  extractCitationTokens,
  clusterCitationTokens,
  findOrphanedCitations,
} from '../src/providers/citationParser';
import {
  normalizeReporterSpacing,
  setReporterSpacingNormalizationEnabled,
  isReporterSpacingNormalizationEnabled,
  resetReporterSpacingNormalization,
  escapeHtml,
  stripHtmlHyperlinks,
  isSafeHyperlinkUrl,
} from '../src/utils';
import { CourtListenerProvider } from '../src/providers/courtListenerProvider';
import { checkCitationsForHallucinations } from '../src/providers/hallucinationCheck';
import { stripHtmlTags } from '../src/providers/opinionTextExtractor';

describe('CourtListener ported tests: reporter-spacing normalization', () => {
  // Source: cl/citations/tests.py, class CitationTextTest, method
  // test_make_html_from_plain_text (Issue #409) -- CourtListener asserts both "22 U.S. 33" and
  // "22 U. S. 33" are detected as citation-shaped text. This project's grammar requires a case
  // name + "v." for a long-form citation (unlike eyecite's bare-reporter detection), so the
  // CourtListener fixture is adapted into an equivalent full Bluebook citation rather than
  // ported verbatim.
  test('long-form citation: "U. S." (spaced) parses to the same reporter as "U.S." (canonical)', () => {
    const spaced = parseCaseCitation('Marbury v. Madison, 22 U. S. 33 (1803)');
    const canonical = parseCaseCitation('Marbury v. Madison, 22 U.S. 33 (1803)');
    expect(spaced).not.toBeNull();
    expect(canonical).not.toBeNull();
    // `raw` and `reporterRaw` legitimately differ (they mirror exact source text, and the spaced
    // variant is a documented reporters-db "corrections"-table entry -- see 01-REVIEW.md CR-02) --
    // compare everything else, which must be identical since `reporter` is normalized for matching.
    expect({ ...spaced, raw: undefined, reporterRaw: undefined }).toEqual({ ...canonical, raw: undefined, reporterRaw: undefined });
    expect(spaced!.reporter).toBe('U.S.');
    expect(spaced!.reporterRaw).toBe('U. S.');
    expect(canonical!.reporterRaw).toBe('U.S.');
  });

  // Source: cl/citations/tests.py, class CitationTextTest, method
  // test_make_html_from_plain_text (Issue #409) -- short-form variant ("1 U. S. at 2").
  // CORRECTION from 01-RESEARCH.md's draft: parseCaseCitation's short-form branch
  // (citationParser.ts ~line 408) requires a leading case name + comma, so a bare
  // '1 U. S. at 2' returns null and would fail for the wrong reason. Using the
  // case-name-prefixed 'Marbury, 22 U. S. at 33' form instead, which actually reaches the
  // short-form branch and exercises the reporter-spacing bug.
  test('short-form citation: "U. S." (spaced) parses to the same reporter as "U.S." (canonical)', () => {
    const spaced = parseCaseCitation('Marbury, 22 U. S. at 33');
    const canonical = parseCaseCitation('Marbury, 22 U.S. at 33');
    expect(spaced).not.toBeNull();
    expect(canonical).not.toBeNull();
    expect({ ...spaced, raw: undefined, reporterRaw: undefined }).toEqual({ ...canonical, raw: undefined, reporterRaw: undefined });
    expect(spaced!.reporter).toBe('U.S.');
    expect(spaced!.reporterRaw).toBe('U. S.');
    expect(canonical!.reporterRaw).toBe('U.S.');
    expect(spaced!.isShortForm).toBe(true);
  });

  // Source: cl/citations/tests.py, class CitationTextTest, method
  // test_make_html_from_plain_text (Issue #409) -- regression guard: extraction of BOTH
  // spacing variants already worked before this phase's fix (only the structured `reporter`
  // field was inconsistent). Pinning this down so a future change that narrows the extraction
  // regexes' reporter character class would be caught here.
  test('extractCaseCitations finds both spacing variants as citation-shaped text', () => {
    const text = 'See Marbury v. Madison, 22 U. S. 33 (1803) and Marbury v. Madison, 22 U.S. 33 (1803).';
    const found = extractCaseCitations(text);
    expect(found.some((c) => c.includes('22 U. S. 33'))).toBe(true);
    expect(found.some((c) => c.includes('22 U.S. 33'))).toBe(true);
  });

  // Source: cl/citations/tests.py, class CitationTextTest, method
  // test_make_html_from_plain_text (Issue #409) -- known-limitation-style guard: multi-letter
  // reporter abbreviations must NOT be collapsed by the new spacing fix -- Bluebook Rule 6.1
  // requires the internal space in these forms.
  test('multi-letter reporter abbreviations keep their Bluebook-required internal spacing', () => {
    const parsed = parseCaseCitation('Rundo v. Doe, 990 F. Supp. 3d 712 (N.D. Ill. 2021)');
    expect(parsed!.reporter).toBe('F. Supp. 3d');
  });

  // Regression test for 01-REVIEW.md CR-01: normalizeReporterSpacing's positional heuristic
  // (single-capital-letter token + period, followed by another such token or a digit run) is
  // context-free -- it can't tell "A.L.R. 2d" (a Table T1 form whose space before the series
  // digit is intentional, per reporters-db) from a genuine Rule 6.1 spacing mistake like "U. S.".
  // Verified end-to-end before this fix: parseCaseCitation('... 123 A.L.R. 2d 456 ...').reporter
  // came back "A.L.R.2d" -- a corrupted, non-existent form -- instead of the correctly-spaced
  // input the user actually wrote. This asserts every form identified in the review round-trips
  // unchanged through parseCaseCitation. (Forms containing parentheses, e.g. "Smith (N. H.)", are
  // excluded from this full-citation round-trip: the reporter capture group's character class
  // (`[A-Za-z0-9.&' ]+?`) doesn't include "(" or ")" -- a separate, pre-existing parser limitation
  // unrelated to this fix -- so those are covered by the direct normalizeReporterSpacing unit
  // test below instead.)
  test.each([
    'A.L.R. 2d',
    'A.L.R. 3d',
    'A.L.R. 4th',
    'A.L.R. 5th',
    'A.L.R. 6th',
    'Colo. J. C.A.R.',
    'Colo. N. P.',
    'Haz. U. S. Reg.',
    'Law J. Q.B.',
    'N. Y. City H. Rec.',
    'Tex. L. R.',
    'U. S. Law J.',
    'Wash. C. C.',
  ])('legitimately-spaced reporter form "%s" round-trips unchanged through parseCaseCitation', (reporterForm) => {
    const parsed = parseCaseCitation(`Smith v. Jones, 123 ${reporterForm} 456 (2010)`);
    expect(parsed).not.toBeNull();
    expect(parsed!.reporter).toBe(reporterForm);
  });

  // Same CR-01 guard as above, but exercised directly against normalizeReporterSpacing for the
  // forms this project's citation grammar can't carry through a full citation string (their
  // Table T1 spelling includes parentheses, which the reporter capture group doesn't allow).
  test.each([
    'Am. Law T. Rep. (N. S.)',
    'Amer. Law J. (N. S.)',
    'Smith (N. H.)',
    'U.S.P.Q. 2d (BNA)',
  ])('legitimately-spaced reporter form "%s" is a no-op for normalizeReporterSpacing', (reporterForm) => {
    expect(normalizeReporterSpacing(reporterForm)).toBe(reporterForm);
  });

  // Follow-up regression test for 01-REVIEW.md CR-02, updated for the reporterRaw split (see
  // 01-REVIEW-FIX.md): reporters-db's "corrections" table records these exact strings as KNOWN
  // non-standard forms of a different valid reporter (e.g. "F. 2d" is a documented mis-spacing of
  // "F.2d"). normalizeReporterSpacing is NO LONGER required to leave these forms untouched --
  // that was a workaround for the era when `ParsedCitation.reporter` was the only reporter field
  // and checkReporterAbbreviation read from it directly. Now that parseCaseCitation populates a
  // separate `reporterRaw` field with the untouched, as-written text (which
  // checkReporterAbbreviation reads instead -- see tests/bluebook.test.ts), normalizeReporterSpacing
  // is free to collapse these for citation-matching purposes just like any other single-capital-
  // letter form; the Bluebook checker still sees the real text via reporterRaw regardless.
  test.each([
    ['F. 2d', 'F.2d'],
    ['C. C. A.', 'C.C.A.'],
    ['N. E. 2d', 'N.E.2d'],
  ])('documented non-standard form "%s" is now normalized to "%s" for matching purposes', (reporterForm, expected) => {
    expect(normalizeReporterSpacing(reporterForm)).toBe(expected);
  });

  // Confirms parseCaseCitation still preserves the as-written text in reporterRaw even though
  // `reporter` is now normalized, so the Bluebook checker can still flag the mistake (see
  // tests/bluebook.test.ts for the end-to-end checkCommonCaseCitationRules assertions).
  test.each([
    ['F. 2d', 'F.2d'],
    ['C. C. A.', 'C.C.A.'],
    ['N. E. 2d', 'N.E.2d'],
  ])('parseCaseCitation normalizes "%s" to "%s" in reporter but preserves it verbatim in reporterRaw', (reporterForm, expected) => {
    const parsed = parseCaseCitation(`Smith v. Jones, 123 ${reporterForm} 456 (2010)`);
    expect(parsed).not.toBeNull();
    expect(parsed!.reporter).toBe(expected);
    expect(parsed!.reporterRaw).toBe(reporterForm);
  });
});

describe('CourtListener ported tests: short-form citation resolution (TEST-02)', () => {
  // Source: cl/citations/tests.py, class CitationObjectTest, method test_citation_resolution
  // (DB-dependent Django ORM/do_resolve_citations parts out of scope per PROJECT.md; the portable
  // part is the *shape* of a short-form antecedent resolving to its preceding full citation).
  // This exact fixture string is drawn from this phase's own Success Criteria #1 example
  // ("515 U.S., at 240"-style comma-before-"at" short form) -- Finding 1 (02-RESEARCH.md): the
  // comma-before-"at" convention was previously invisible to the entire extraction pipeline.
  test('bare comma-before-"at" short form is extracted and clusters to its preceding full citation', () => {
    const text = 'Roe v. Wade, 410 U.S. 113 (1973) held that... As the Court noted, 410 U.S., at 165, ...';
    const tokens = extractCitationTokens(text);
    expect(tokens.some((t) => t.type === 'short' && t.raw.includes('410 U.S., at 165'))).toBe(true);
    const clusters = clusterCitationTokens(tokens);
    expect(clusters[0].tokens.length).toBe(2); // full + the short form
  });

  // Source: cl/citations/tests.py, class CitationObjectTest, method test_citation_resolution --
  // adapted to exercise parseCaseCitation directly (Finding 1). The case-name-prefixed form is
  // used (rather than a bare short form) per the same 02-RESEARCH.md/STATE.md correction Phase 1
  // made: a bare short form has no leading case name to anchor parseCaseCitation's grammar.
  test('case-name-prefixed comma-before-"at" short form parses via parseCaseCitation', () => {
    const parsed = parseCaseCitation('Roe, 410 U.S., at 165');
    expect(parsed).not.toBeNull();
    expect(parsed!.isShortForm).toBe(true);
    expect(parsed!.reporter).toBe('U.S.');
  });

  // Source: cl/citations/tests.py, class CitationObjectTest, method test_citation_resolution --
  // adapted from the "short1_or_3_tiebreaker" fixture shape (a short form whose reporter+volume
  // match more than one full citation must be resolved by its OWN locator, not by recency).
  // Finding 2 (02-RESEARCH.md): before the fix, a nameless short form always attached to the
  // most-recently-seen full citation regardless of its own volume/reporter.
  test('bare short form resolves to the full citation whose OWN reporter/volume match, not merely the most recent one', () => {
    const text =
      'Marbury v. Madison, 5 U.S. 137 (1803) established judicial review. Later, in Youngstown Sheet & Tube Co. v. Sawyer, 343 U.S. 579 (1952), the Court addressed executive power. As discussed in 5 U.S. at 140, the holding was significant.';
    const clusters = clusterCitationTokens(extractCitationTokens(text));
    const marburyCluster = clusters.find((c) => c.caseName === 'Marbury v. Madison');
    expect(marburyCluster).toBeDefined();
    expect(marburyCluster!.tokens.some((t) => t.type === 'short')).toBe(true);
  });
});

describe('CourtListener ported tests: supra citation resolution (TEST-03, regression lock)', () => {
  // Source: cl/citations/tests.py, class CitationObjectTest, method test_citation_resolution --
  // adapted "supra" fixture shape. SUPRA_REGEX already extracts this correctly (it already uses
  // the ",?\s+at\s+" shape Finding 1 ports to the short-form regexes); this is a regression lock
  // confirming supra resolution still works once caseNameMatchesToken is routed through the
  // hardened whole-word-containment helpers (Finding 3 / FIX-03).
  test('supra citation resolves to the correct preceding full citation', () => {
    const text =
      'Norfolk & W. Ry. Co. v. Liepelt, 444 U.S. 490 (1980) established the standard. Later, Liepelt, supra, at 495, the Court reaffirmed the holding.';
    const clusters = clusterCitationTokens(extractCitationTokens(text));
    expect(clusters[0].caseName).toBe('Norfolk & W. Ry. Co. v. Liepelt');
    expect(clusters[0].tokens.some((t) => t.type === 'supra')).toBe(true);
  });
});

// Source: cl/citations/tests.py, class CitationObjectTest, method test_citation_multiple_matches --
// that test's DB/ORM/Elasticsearch setup (resolve_fullcase_citation, real Opinion/cluster fixtures,
// the rendered "class=\"citation multiple-matches\"" HTML annotation) is out of scope per PROJECT.md,
// but its core assertion -- a citation-lookup response with multiple clusters must be surfaced as
// ambiguous, not silently collapsed to the first -- is directly portable here via
// CourtListenerProvider's mocked HttpClient (see tests/providers.test.ts's authenticatedProvider
// helper/mockFetch pattern, copied below). Finding 4 (02-RESEARCH.md): before this fix,
// CourtListenerProvider.lookupCitation took result.clusters[0] unconditionally, even when
// result.clusters.length > 1 -- exactly the "false verified" silent-collapse failure this
// project's Core Value forbids.
describe('CourtListener ported tests: ambiguous-match resolution (TEST-04, FIX-02)', () => {
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

  test('lookupCitation flags ambiguousMatch when the API returns multiple clusters and case name does not disambiguate', async () => {
    const mockFetch = jest.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
    const provider = await authenticatedProvider(mockFetch);

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
    const match = await provider.lookupCitation({ raw: '114 F.3d 1182', caseName: 'Unrelated Party v. Another Party' });

    expect(match).not.toBeNull();
    expect(match!.ambiguousMatch).toEqual({ candidateCount: 2 });
  });

  test('lookupCitation resolves unambiguously when case name matches exactly one of several clusters', async () => {
    const mockFetch = jest.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
    const provider = await authenticatedProvider(mockFetch);

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

    const match = await provider.lookupCitation({ raw: '114 F.3d 1182', caseName: 'Smith v. Jones' });

    expect(match).toEqual({
      url: 'https://www.courtlistener.com/opinion/222/smith-v-jones/',
      caseName: 'Smith v. Jones',
      citation: '114 F.3d 1182',
    });
    expect(match!.ambiguousMatch).toBeUndefined();
  });

  test('checkCitationsForHallucinations reports ambiguousMatch as a distinct bucket, not verifiedVia or nameMismatch', async () => {
    const mockFetch = jest.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
    const provider = await authenticatedProvider(mockFetch);

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

    const results = await checkCitationsForHallucinations(
      ['Unrelated Party v. Another Party, 114 F.3d 1182 (1997)'],
      [provider]
    );

    expect(results).toHaveLength(1);
    expect(results[0].verifiedVia).toBeNull();
    expect(results[0].nameMismatch).toBeUndefined();
    expect(results[0].ambiguousMatch).toEqual({ provider: 'CourtListener', candidateCount: 2 });
  });

  // Never-throw guard (FIX-02): an ambiguous provider result must not cause
  // checkCitationsForHallucinations to reject/throw -- it's an additive if/continue branch, not a
  // new failure path, preserving the library-wide "never throw on expected outcomes" contract.
  test('checkCitationsForHallucinations resolves (does not reject/throw) when a provider returns an ambiguous match', async () => {
    const mockFetch = jest.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
    const provider = await authenticatedProvider(mockFetch);

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

    await expect(
      checkCitationsForHallucinations(['Unrelated Party v. Another Party, 114 F.3d 1182 (1997)'], [provider])
    ).resolves.toBeDefined();
  });
});

// Not a CourtListener-ported fixture (the underlying Django/DB "MULTIPLE_MATCHES"-shaped tests
// are out of scope per PROJECT.md), but the exact bypass class SECURITY_AUDIT.md round 2 finding 5
// documented and fixed in caseNamesMatch (a raw-substring name-fragment match, e.g. "us" matching
// inside "columbus") -- reproduced here in caseNameMatchesToken, the sibling comparator
// clusterCitationTokens actually calls, which round 2's patch never touched (Finding 3 / FIX-03).
describe('caseNameMatchesToken / clusterCitationTokens: short-fragment substring bypass (FIX-03)', () => {
  test('a short-fragment name part does not falsely cluster under an unrelated case containing it as a raw substring', () => {
    const text = 'Blair v. United States, 250 U.S. 273 (1919) held X. Later, Air, 250 U.S. at 280, was discussed.';
    const orphans = findOrphanedCitations(text);
    expect(orphans.some((t) => t.raw.includes('Air'))).toBe(true);
  });

  // Single-letter party name -- mirrors the already-fixed "A v. B" vs "Acme Corp. v. Bright Co."
  // probe from SECURITY_AUDIT.md round 2 finding 5, now exercised through the short-form
  // clustering path (caseNameMatchesToken) instead of caseNamesMatch.
  test('single-letter name part does not falsely match a multi-word case name containing that letter', () => {
    const text = 'Acme Corp. v. Bright Co., 10 F.3d 20 (1990) held Y. Later, A, 10 F.3d at 25, was discussed.';
    const orphans = findOrphanedCitations(text);
    expect(orphans.some((t) => t.raw.includes('A,'))).toBe(true);
  });

  // Legitimate abbreviation match must still work after the fix (regression guard) -- confirms
  // the rewrite doesn't overcorrect into rejecting real Bluebook short-form abbreviations.
  test('legitimate corporate-suffix name part still resolves correctly', () => {
    const text = 'Norfolk & W. Ry. Co. v. Liepelt, 444 U.S. 490 (1980) held Z. Later, Liepelt, 444 U.S. at 495, ...';
    const clusters = clusterCitationTokens(extractCitationTokens(text));
    expect(clusters[0].tokens.length).toBe(2);
  });
});

// New opt-out feature (not a CourtListener-ported test): added so a host integration can disable
// normalizeReporterSpacing at runtime if a problem is found in production, without waiting on a
// library update -- see the rationale comment above setReporterSpacingNormalizationEnabled in
// src/utils.ts. Originating work item: quick task 260715-ki4 (see STATE.md's Quick Tasks
// Completed table, commit a73b37c).
describe('normalizeReporterSpacing toggle: host opt-out for production issues', () => {
  afterEach(() => {
    resetReporterSpacingNormalization();
  });

  test('defaults to enabled so existing reporter-spacing behavior is unaffected', () => {
    expect(isReporterSpacingNormalizationEnabled()).toBe(true);
  });

  test('disabling the toggle leaves "22 U. S. 33" reporter spacing unchanged', () => {
    setReporterSpacingNormalizationEnabled(false);
    const parsed = parseCaseCitation('Marbury v. Madison, 22 U. S. 33 (1803)');
    expect(parsed).not.toBeNull();
    expect(parsed!.reporter).toBe('U. S.');
  });

  test('re-enabling the toggle restores normalization to "U.S."', () => {
    setReporterSpacingNormalizationEnabled(false);
    const disabled = parseCaseCitation('Marbury v. Madison, 22 U. S. 33 (1803)');
    expect(disabled!.reporter).toBe('U. S.');

    setReporterSpacingNormalizationEnabled(true);
    const reenabled = parseCaseCitation('Marbury v. Madison, 22 U. S. 33 (1803)');
    expect(reenabled!.reporter).toBe('U.S.');
  });
});

// Not a CourtListener-ported test -- a permanent adversarial-input benchmark, added per
// CLAUDE.md's regex-safety constraint and 02-RESEARCH.md's Pitfall 1: the ",?" added before
// "\s+at\s+" in SHORT_FORM_REGEX/SHORT_FORM_CITATION_REGEX/parseCaseCitation's short-form
// fallback (FIX #1) is a "small, obviously-safe" edit to a pattern with a documented ReDoS
// history (SECURITY_AUDIT.md findings 1 and 4: the {1,40}? bound on SHORT_FORM_REGEX's reporter
// segment exists precisely because an earlier unbounded version was quadratic -- confirmed ~8s at
// ~109K chars, ~25s at ~189K chars, before that bound was added). This guards against a future
// edit to the tail of that pattern reopening backtracking. Re-verifies research's first-pass
// benchmark (four adversarial shapes at ~1.5-1.6M chars, all ≤1.3s) as a fail-fast CI artifact
// rather than a one-off manual check.
describe('SHORT_FORM_REGEX permanent ReDoS benchmark (adversarial input, not CourtListener-ported)', () => {
  // 03-REVIEW.md WR-01: a hard wall-clock ceiling on multi-million-character regex scans is
  // inherently sensitive to CI runner contention, cold V8 JIT warmup, and parallel test-worker
  // scheduling -- none of which reflect an actual regex-complexity regression. Locally all four
  // benchmarks below complete in ~1.3s or less (see research's first-pass benchmark, re-verified
  // in the comment above this describe block), so 20000ms leaves a wide (~15x) safety margin for
  // CI jitter/cold-start slowness without weakening the guard: a real quadratic-blowup regression
  // reintroducing the ReDoS this benchmark protects against (SECURITY_AUDIT.md findings 1 and 4)
  // would push runtime into many seconds-to-minutes at this input size, nowhere near this ceiling.
  const WALL_CLOCK_CEILING_MS = 20000;

  test('digit-heavy bait: a long run of bare numbers with no reporter/"at" match completes fast', () => {
    // No case name, no reporter letters, no "at" -- SHORT_FORM_REGEX's optional name-part and
    // digit-anchored NUMBER group can attempt a match at nearly every digit run in the text.
    const text = '12345 67890 24680 13579 '.repeat(60000); // ~1.44M chars
    const start = Date.now();
    extractCitationTokens(text);
    expect(Date.now() - start).toBeLessThan(WALL_CLOCK_CEILING_MS);
  });

  test('capitalized-token runs: long prose-shaped text with no case-name/"at" match completes fast', () => {
    // Capitalized tokens can anchor CASE_NAME's optional leading group repeatedly without ever
    // reaching a valid "at"-introduced pincite, exercising the lazy reporter-segment scan broadly.
    const text = 'Alpha Beta Gamma Delta Epsilon Zeta Eta Theta Iota Kappa '.repeat(30000); // ~1.7M chars
    const start = Date.now();
    extractCitationTokens(text);
    expect(Date.now() - start).toBeLessThan(WALL_CLOCK_CEILING_MS);
  });

  test('repeated comma-anchored "at" bait with no closing match completes fast', () => {
    // The exact shape FIX #1 introduces risk for: many "410 U.S., " comma-before-"at" anchors,
    // each one immediately followed by more digits (never a real pincite "at"), forcing the
    // now-optional comma to be attempted-and-abandoned at every occurrence.
    const text = '410 U.S., 410 U.S., 410 U.S., 410 U.S., '.repeat(45000); // ~1.6M chars
    const start = Date.now();
    extractCitationTokens(text);
    expect(Date.now() - start).toBeLessThan(WALL_CLOCK_CEILING_MS);
  });

  test('realistic mixed text with many real comma-before-"at" short forms completes fast', () => {
    // A realistic worst case for a correctness-preserving benchmark: thousands of genuine
    // comma-before-"at" short-form matches (the exact FIX #1 shape) embedded in prose, confirming
    // the fix doesn't just avoid worst-case blowups but stays fast on heavy legitimate matching too.
    const text = 'As the Court noted, 410 U.S., at 165, further discussion followed. '.repeat(20000); // ~1.4M chars
    const start = Date.now();
    const tokens = extractCitationTokens(text);
    expect(Date.now() - start).toBeLessThan(WALL_CLOCK_CEILING_MS);
    expect(tokens.some((t) => t.type === 'short' && t.raw.includes('410 U.S., at 165'))).toBe(true);
  });
});

// Source: cl/citations/tests.py, class CitationTextTest, method test_unsafe_case_names --
// CourtListener asserts these case names survive Django's HTML-attribute escaping and
// BeautifulSoup's attribute-decoding round trip unchanged. This library has no HTML-rendering
// pipeline of its own (per 03-CONTEXT.md's scope decision), so the portable equivalent is:
// escapeHtml produces the correct entity-escaped form, and stripHtmlHyperlinks decodes it back --
// the same "escape then decode" round trip CourtListener's test exercises via a different
// mechanism (BeautifulSoup attribute parsing vs. this library's own decode helper). NOTE
// (03-REVIEW.md WR-02): stripHtmlHyperlinks unconditionally finishes with normalizeText
// (src/utils.ts), which collapses any run of whitespace to a single space and trims leading/
// trailing whitespace -- so this round trip is character-preserving but NOT whitespace-preserving.
// The first three fixtures below happen to have no whitespace irregularities, so the round trip
// looks like raw equality for them; the fourth fixture makes the whitespace-normalization caveat
// explicit rather than leaving it implied by three fixtures that don't exercise it.
describe('CourtListener ported tests: case-name HTML-escaping safety (TEST-05)', () => {
  test.each([
    ["Farmers ' High Line Canal & Reservoir Co. v. New Hampshire Real Estate Co.", "Farmers ' High Line Canal & Reservoir Co. v. New Hampshire Real Estate Co."],
    ["Barmore v '", "Barmore v '"],
    ['Shamokin, Pa.", (Leaflet in Case) Misnamed? \',' , 'Shamokin, Pa.", (Leaflet in Case) Misnamed? \','],
    // Real party names extracted from OCR'd/PDF-sourced court documents commonly contain
    // irregular whitespace (double interior spaces, leading/trailing whitespace) -- exactly the
    // "unsafe case names" class this describe block is porting from CourtListener. This fixture
    // confirms the round trip still preserves every character, but normalizes the whitespace
    // layout per stripHtmlHyperlinks' normalizeText pass, rather than reproducing the raw input.
    ['  Smith   v.  Jones  ', 'Smith v. Jones'],
  ])('escapeHtml escapes and round-trips case name %j through stripHtmlHyperlinks (character-preserving, subject to whitespace normalization)', (caseName, expectedRoundTrip) => {
    const escaped = escapeHtml(caseName);
    expect(escaped).not.toContain('<');
    expect(stripHtmlHyperlinks(escaped)).toBe(expectedRoundTrip);
  });

  // Source: cl/citations/tests.py, class CitationTextTest, method
  // test_make_html_from_plain_text -- "Plaintext with HTML text (see Alexis Hunley v.
  // Instagram, LLC)" fixture. CourtListener's expected escaped output (Django's escape()) is
  // reproduced verbatim below; this library's escapeHtml must match it character-for-character.
  // NOTE: this library escapes ' to &#39;, NOT Django's &#x27; -- this specific fixture has no
  // lone apostrophe, so the divergence doesn't surface here, but the expected string below is
  // still adapted per this library's own encoding contract (src/utils.ts escapeHtml), not
  // blindly copied from Django's source.
  test('escapeHtml matches CourtListener\'s expected escaped output for a literal <script> tag', () => {
    const input = '<script async src="//www.instagram.com/embed.js"></script>';
    const expected =
      '&lt;script async src=&quot;//www.instagram.com/embed.js&quot;&gt;&lt;/script&gt;';
    expect(escapeHtml(input)).toBe(expected);
  });

  // Same fixture, opposite direction: confirm the two markup-stripping helpers neutralize the
  // tag entirely rather than leaking it as text.
  test('stripHtmlTags and stripHtmlHyperlinks both fully remove a literal <script> tag', () => {
    const input = '<script async src="//www.instagram.com/embed.js"></script>';
    expect(stripHtmlTags(input)).toBe('');
    expect(stripHtmlHyperlinks(input)).toBe('');
  });

  // Regression test mirroring the existing stripHtmlTags guard (tests/opinionText.test.ts:104-108)
  // -- SECURITY_AUDIT.md finding 3 fixed this exact bug in stripHtmlHyperlinks; this closes the
  // coverage gap where only the sibling function stripHtmlTags had an explicit assertion. Not a
  // CourtListener-ported fixture.
  test('stripHtmlHyperlinks does not double-unescape a literal "&amp;lt;" into "<"', () => {
    expect(stripHtmlHyperlinks('&amp;lt;')).toBe('&lt;');
  });

  // Not a CourtListener-ported fixture -- extends tests/utils.test.ts's existing scheme coverage
  // (javascript:/vbscript:/data: already tested there) with case-variation and control-character-
  // split bypass shapes, per SECURITY_AUDIT.md's scheme-allowlist threat model (T-03-02).
  test.each([
    'javascript:alert(1)',
    'JAVASCRIPT:alert(1)',
    'vbscript:msgbox(1)',
    'data:text/html,<script>alert(1)</script>',
    'java\tscript:alert(1)',
  ])('isSafeHyperlinkUrl rejects unsafe scheme shape %j', (url) => {
    expect(isSafeHyperlinkUrl(url)).toBe(false);
  });

  // Not a CourtListener-ported fixture -- a PROHIBITION guard (SECURITY_AUDIT.md finding B):
  // isSafeHyperlinkUrl's contract is scheme safety only, not a host allowlist. A protocol-relative
  // URL resolves against the function's own https://placeholder.invalid/ base to an https: scheme,
  // which is allowed by design. This is documented, intentional scope -- NOT a bug -- so this
  // assertion must stay toBe(true) and must never be "fixed" to toBe(false); host-level
  // allowlisting is a separately-tracked, explicitly-deferred concern.
  test('isSafeHyperlinkUrl returns true for a protocol-relative URL (documented scheme-only scope, not a bug)', () => {
    expect(isSafeHyperlinkUrl('//evil.example/x.js')).toBe(true);
  });
});
