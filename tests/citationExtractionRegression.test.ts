import {
  extractCaseCitations,
  extractCitationTokens,
  parseCaseCitation,
} from '../src/providers/citationParser';

const MILLER_CITATION =
  'Warsaw Convention. Miller v. United Airlines. Inc., 174 F.3d 366, 371-72 (2d Cir. 1999)';

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
  test('keeps the complete Miller pincite range and court/year parenthetical', () => {
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
