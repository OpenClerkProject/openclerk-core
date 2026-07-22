import {
  extractCaseCitations,
  extractCitationTokens,
  parseCaseCitation,
} from '../src/providers/citationParser';

const MILLER_CITATION =
  'Miller v. United Airlines. Inc., 174 F.3d 366, 371-72 (2d Cir. 1999)';

const AIR_CRASH_CITATION =
  'In re Air Crash Disaster Near New Orleans. La., 821 F.2d 1147, 1165 (5th Cir. 1987)';

const KAISER_CITATION =
  'Kaiser Steel Corp. v. W.S. Ranch Co., 391 U.S. 593, 88 S.Ct. 1753, 20 L.Ed.2d 835 (1968)';

const MILLER_AND_AIR_CRASH_PASSAGE =
  'addressing the tolling of that limitations period. In the absence of such a provision, ' +
  'we have held that the automatic stay provision of the Bankruptcy Code may toll the statute ' +
  'of limitations under the Warsaw Convention. Miller v. United Airlines. Inc., 174 F.3d 366, ' +
  '371-72 (2d Cir. 1999); In re Air Crash Disaster Near New Orleans. La., 821 F.2d 1147, 1165 ' +
  '(5th Cir. 1987). In the instant case, defendant AVIANCA filed a petition for bankruptcy on ' +
  'May 10, 2020 thus creating an automatic stay under the Bankruptcy Code. As detailed by the ' +
  'relevant case law noted above,';

const KAISER_PASSAGE =
  'tolling effect of the automatic stay on a statute of limitations is generally a matter of ' +
  'federal law. Kaiser Steel Corp. v. W.S. Ranch Co., 391 U.S. 593, 88 S.Ct. 1753, ' +
  '20 L.Ed.2d 835 (1968). Korean Air filed for bankruptcy on December 23, 1998, and appellants ' +
  'filed their initial complaint on December 17, 2001, within three years of the accident but ' +
  'after the';

describe('citation extraction regressions', () => {
  test('does not include the preceding sentence in the Miller citation', () => {
    const text =
      'held that the automatic stay provision of the Bankruptcy Code may toll the statute of ' +
      'limitations under the Warsaw Convention. Miller v. United Airlines. Inc., 174 F.3d 366, ' +
      '371-72 (2d Cir. 1999);';

    expect(extractCaseCitations(text)).toEqual([MILLER_CITATION]);
  });

  test('extracts the v. and In re citations as two separate complete citations', () => {
    expect(extractCaseCitations(MILLER_AND_AIR_CRASH_PASSAGE)).toEqual([
      MILLER_CITATION,
      AIR_CRASH_CITATION,
    ]);
  });

  test('tokenizes both citations as independent full-citation tokens', () => {
    const fullTokens = extractCitationTokens(MILLER_AND_AIR_CRASH_PASSAGE)
      .filter((token) => token.type === 'full')
      .map((token) => token.raw);

    expect(fullTokens).toEqual([MILLER_CITATION, AIR_CRASH_CITATION]);
  });

  test('keeps all parallel reporters in the Kaiser citation', () => {
    expect(extractCaseCitations(KAISER_PASSAGE)).toEqual([KAISER_CITATION]);
  });

  test('parses the primary Kaiser locator instead of backtracking to a parallel reporter', () => {
    expect(parseCaseCitation(KAISER_CITATION)).toMatchObject({
      caseName: 'Kaiser Steel Corp. v. W.S. Ranch Co.',
      volume: '391',
      reporter: 'U.S.',
      reporterRaw: 'U.S.',
      page: '593',
      year: '1968',
    });
    expect(parseCaseCitation(KAISER_CITATION)?.pincite).toBeUndefined();
  });

  test('does not begin a left party at a standalone corporate-suffix token', () => {
    // The start-token guard refuses to open a case name at a bare designator, so this
    // (non-citation) shape yields nothing rather than "Inc. v. Jones ...".
    const text = 'Its parent was Inc. v. Jones, 100 F.3d 200, 205 (9th Cir. 1996).';

    expect(extractCaseCitations(text)).toEqual([]);
  });

  test('does not bridge a sentence ending in a bare corporate designator', () => {
    // Same failure class as the Miller regression, but the sentence before the citation ends
    // in "Inc." (abbreviation-shaped) instead of an ordinary proper noun.
    const text =
      'The debtor reorganized as Widget Inc. Smith v. Jones, 100 F.3d 200, 205 (9th Cir. 1996).';

    expect(extractCaseCitations(text)).toEqual([
      'Smith v. Jones, 100 F.3d 200, 205 (9th Cir. 1996)',
    ]);
  });

  test('does not bridge a sentence ending in a comma-attached corporate suffix', () => {
    const text =
      'The complaint named Widget, Inc. Smith v. Jones, 100 F.3d 200, 205 (9th Cir. 1996).';

    expect(extractCaseCitations(text)).toEqual([
      'Smith v. Jones, 100 F.3d 200, 205 (9th Cir. 1996)',
    ]);
  });

  test.each([
    // Initials, short abbreviations (Ry., Co.), and "&" on the left of "v.".
    [
      'The railroad appealed the damages instruction. ',
      'Norfolk & W. Ry. Co. v. Liepelt, 444 U.S. 490, 495 (1980)',
    ],
    // Multi-period right-hand party (R.R. Co.) with prose before the left party.
    [
      'The foreseeability rule traces to a railroad platform. ',
      'Palsgraf v. Long Island R.R. Co., 248 N.Y. 339, 162 N.E. 99 (1928)',
    ],
    // Terminal "Inc." immediately before "v." must survive the designator guard.
    [
      'Agency deference took its modern form later. ',
      'Chevron U.S.A. Inc. v. Natural Resources Defense Council, Inc., 467 U.S. 837, 842-43 (1984)',
    ],
    ['The collective-action question came first. ', 'Hoffmann-La Roche Inc. v. Sperling, 493 U.S. 165, 169 (1989)'],
    // Comma-attached LLC before "v." (NAME_SUFFIX path, not the continuation loop).
    ['Standing to cancel a trademark narrowed. ', 'Already, LLC v. Nike, Inc., 568 U.S. 85, 90 (2013)'],
    // Allowlisted legal abbreviation (Nat'l) starting the left party after a sentence.
    [
      'The union prevailed on remand. ',
      "Nat'l Labor Relations Bd. v. Jones & Laughlin Steel Corp., 301 U.S. 1, 30 (1937)",
    ],
    // Lowercase connectors (of, the) and allowlisted Educ. inside the left party.
    ['The delegation question returned years later. ', 'Bd. of Educ. of the Village v. Grumet, 512 U.S. 687, 690 (1994)'],
    // "ex rel." connector plus "State of ..." caption opening.
    [
      'The parens patriae theory failed below. ',
      'State of New York ex rel. Abrams v. Seneci, 817 F.2d 1015, 1017 (2d Cir. 1987)',
    ],
    // Mid-name "Co." NOT immediately before "v." -- must stay outside the designator guard.
    ['Coverage disputes framed the appeal. ', 'Ins. Co. of North America v. Circle K Corp., 995 F.2d 190, 192 (9th Cir. 1993)'],
    // Bluebook-table abbreviations too long for the generic shapes ([A-Z][a-z]{0,2}\. caps at
    // three letters): "Mass." (T10 state), "Pharm."/"Consol." (T6 case-name words). These only
    // match because NAME_ABBREVIATION_TOKEN is built from the vendored tables.
    ['Rational-basis review controlled. ', 'Mass. Bd. of Retirement v. Murgia, 427 U.S. 307, 310 (1976)'],
    ['Design-defect preemption followed. ', 'Mut. Pharm. Co. v. Bartlett, 570 U.S. 472, 476 (2013)'],
    ['The FELA emotional-injury test was set out. ', 'Consol. Rail Corp. v. Gottshall, 512 U.S. 532, 535 (1994)'],
  ])('still extracts the citation after prose: %s%s', (prose, citation) => {
    expect(extractCaseCitations(`${prose}${citation}.`)).toEqual([citation]);
  });

  test.each([
    ['soft hyphen', '\u00ad'],
    ['Unicode hyphen', '\u2010'],
    ['non-breaking hyphen', '\u2011'],
    ['figure dash', '\u2012'],
    ['en dash', '\u2013'],
    ['em dash', '\u2014'],
    ['horizontal bar', '\u2015'],
    ['minus sign', '\u2212'],
  ])('does not truncate a pincite using a %s', (_name, dash) => {
    const citation =
      `Miller v. United Airlines. Inc., 174 F.3d 366, 371${dash}72 (2d Cir. 1999)`;

    expect(extractCaseCitations(citation)).toEqual([citation]);
    expect(parseCaseCitation(citation)).toMatchObject({
      caseName: 'Miller v. United Airlines. Inc.',
      volume: '174',
      reporter: 'F.3d',
      page: '366',
      pincite: `371${dash}72`,
      court: '2d Cir.',
      year: '1999',
    });
  });
});

// Permanent adversarial-input benchmark for LEFT_CASE_NAME, added per CLAUDE.md's regex-safety
// constraint: the sentence-boundary fix introduced a new left-party pattern (LEFT_NAME_TOKEN is
// an alternation between a plain capitalized word and an abbreviation-shaped token, wrapped in
// negative lookaheads), and any new pattern scanning full document text must be benchmarked
// against adversarial input before merge. Mirrors the SHORT_FORM_REGEX benchmark in
// courtListenerPorted.test.ts, including its rationale for the generous wall-clock ceiling
// (CI jitter tolerance; a real quadratic regression at these input sizes would blow far past it).
describe('LEFT_CASE_NAME permanent ReDoS benchmark (adversarial input)', () => {
  const WALL_CLOCK_CEILING_MS = 20000;

  test('long runs of capitalized tokens with no citation complete fast', () => {
    // Every token can open a LEFT_CASE_NAME attempt; none ever reaches a " v. ".
    const text = 'Warsaw Convention Treaty Article Provision Council Committee Session '.repeat(21000); // ~1.4M chars
    const start = Date.now();
    extractCaseCitations(text);
    expect(Date.now() - start).toBeLessThan(WALL_CLOCK_CEILING_MS);
  });

  test('long runs of abbreviation-shaped tokens with no citation complete fast', () => {
    // Abbreviation-shaped tokens are the ambiguous case for LEFT_NAME_TOKEN's alternation: "Ry."
    // can match as either branch, so this shape maximizes per-position alternation backtracking.
    // Includes long table-derived entries (Consol., Telecomm., Mass., Pharm.) so the ~195-entry
    // Bluebook-table alternation is exercised, not just the generic shapes.
    const text = "W.S. Ry. Co. R.R. Nat'l Corp. Dep't Consol. Telecomm. Mass. Pharm. Educ. Mfg. Sys. ".repeat(18000); // ~1.5M chars
    const start = Date.now();
    extractCaseCitations(text);
    expect(Date.now() - start).toBeLessThan(WALL_CLOCK_CEILING_MS);
  });

  test('repeated dangling "v." sequences with no locator complete fast', () => {
    // Each "v." forces the full left/right case-name machinery to run, then the required
    // ",\s*<locator>" tail fails and the engine must abandon the attempt.
    const text = 'Smith v. Jones and Miller v. Brooks but Davis v. Green then '.repeat(24000); // ~1.44M chars
    const start = Date.now();
    extractCaseCitations(text);
    expect(Date.now() - start).toBeLessThan(WALL_CLOCK_CEILING_MS);
  });

  test('long capitalized prose ending in a sentence period before a valid citation stays correct and fast', () => {
    // The original bug shape at document scale: heavy capitalized prose, a sentence-ending
    // period, then one real citation. Verifies both the bound and that the extraction still
    // starts at the case name rather than the preceding prose.
    const prose = 'The Warsaw Convention Montreal Protocol Hague Amendment Guatemala Text '.repeat(20000); // ~1.42M chars
    const text = `${prose}under the Warsaw Convention. ${MILLER_CITATION};`;
    const start = Date.now();
    const citations = extractCaseCitations(text);
    expect(Date.now() - start).toBeLessThan(WALL_CLOCK_CEILING_MS);
    expect(citations).toEqual([MILLER_CITATION]);
  });
});
