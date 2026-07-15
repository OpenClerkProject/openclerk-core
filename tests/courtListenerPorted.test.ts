import { parseCaseCitation, extractCaseCitations } from '../src/providers/citationParser';

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
});
