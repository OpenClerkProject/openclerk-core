import { parseCaseCitation, extractCaseCitations } from '../src/providers/citationParser';
import { normalizeReporterSpacing } from '../src/utils';

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
    // `raw` legitimately differs (it mirrors exact source text) -- compare everything else.
    expect({ ...spaced, raw: undefined }).toEqual({ ...canonical, raw: undefined });
    expect(spaced!.reporter).toBe('U.S.');
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
    expect({ ...spaced, raw: undefined }).toEqual({ ...canonical, raw: undefined });
    expect(spaced!.reporter).toBe('U.S.');
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

  // Regression test for 01-REVIEW.md CR-02: reporters-db's "corrections" table records these
  // exact strings as KNOWN non-standard forms of a different valid reporter (e.g. "F. 2d" is a
  // documented mis-spacing of "F.2d"). Verified end-to-end before this fix: normalizing "F. 2d"
  // to "F.2d" before checkReporterAbbreviation (src/bluebook/reporterRules.ts) ever sees it made
  // the mistake invisible to Rule 6.1 checking. normalizeReporterSpacing must leave these forms
  // untouched so the Bluebook checker still gets a chance to flag them (see the corresponding
  // checkCommonCaseCitationRules regression tests in tests/bluebook.test.ts).
  test.each(['F. 2d', 'C. C. A.', 'N. E. 2d'])(
    'documented non-standard form "%s" is a no-op for normalizeReporterSpacing',
    (reporterForm) => {
      expect(normalizeReporterSpacing(reporterForm)).toBe(reporterForm);
    }
  );
});
