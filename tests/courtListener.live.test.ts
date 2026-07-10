/**
 * Opt-in integration test against the real CourtListener API -- not run in CI, and skipped
 * entirely unless a developer sets COURTLISTENER_API_TOKEN in their own shell. This exists to
 * let a contributor sanity-check the Embed Cited Text feature (courtListenerProvider.ts,
 * opinionTextExtractor.ts, pincitePages.ts) and the hallucination-check case-name verification
 * (hallucinationCheck.ts) against real API responses, not just mocked fixtures -- CourtListener's
 * exact field names, star-pagination markup, citation-resolution behavior, and auth requirements
 * can change upstream independent of this repo.
 *
 * How to run locally (never commit your token, and never put it in a file -- pass it as an
 * environment variable for the one command):
 *
 *   macOS/Linux/Git Bash:  COURTLISTENER_API_TOKEN=your-token npx jest courtListener.live
 *   Windows PowerShell:    $env:COURTLISTENER_API_TOKEN="your-token"; npx jest courtListener.live
 *
 * Get a free token at https://www.courtlistener.com/help/api/rest/#authentication -- opinion
 * text fetching requires one; there's no anonymous tier for it (see fetchOpinionExcerpt's
 * doc comment in courtListenerProvider.ts).
 */
import { CourtListenerProvider } from '../src/providers/courtListenerProvider';
import { checkCitationsForHallucinations } from '../src/providers/hallucinationCheck';

const LIVE_TOKEN = process.env.COURTLISTENER_API_TOKEN;
const describeIfLiveToken = LIVE_TOKEN ? describe : describe.skip;

if (!LIVE_TOKEN) {
  // eslint-disable-next-line no-console
  console.log(
    'Skipping tests/courtListener.live.test.ts -- set COURTLISTENER_API_TOKEN in your shell to run it locally.'
  );
}

describeIfLiveToken('CourtListenerProvider against the real API (opt-in, local only)', () => {
  jest.setTimeout(30000);

  test('isReadyForOpinionText() is true once authenticated with a real token', async () => {
    const provider = new CourtListenerProvider();
    await provider.authenticate({ apiToken: LIVE_TOKEN as string });
    expect(provider.isReadyForOpinionText()).toBe(true);
  });

  test('fetchOpinionExcerpt resolves a real citation and extracts the pincite page', async () => {
    const provider = new CourtListenerProvider();
    await provider.authenticate({ apiToken: LIVE_TOKEN as string });

    // Norfolk & Western Railway Co. v. Liepelt, 444 U.S. 490, 491 (1980) -- already used as the
    // fixture citation across the rest of this project's tests.
    const { excerpt, rateLimited } = await provider.fetchOpinionExcerpt(
      { raw: 'Norfolk & W. Ry. Co. v. Liepelt, 444 U.S. 490 (1980)' },
      [491]
    );

    if (rateLimited) {
      throw new Error('CourtListener rate-limited this test run -- wait a minute and re-run npm run test:live.');
    }
    expect(excerpt).not.toBeNull();
    expect(excerpt).toContain('income taxes');
  });

  test('fetchOpinionExcerpt returns null (not rate-limited) for a citation that does not exist', async () => {
    const provider = new CourtListenerProvider();
    await provider.authenticate({ apiToken: LIVE_TOKEN as string });

    const { excerpt, rateLimited } = await provider.fetchOpinionExcerpt({ raw: '999 U.S. 999' }, [999]);
    expect(excerpt).toBeNull();
    expect(rateLimited).toBeFalsy();
  });

  // Regression test for a real production bug (see hallucinationCheck.test.ts for the mocked
  // version): CourtListener's citation-lookup API resolves by locator (reporter/volume/page), not
  // by case name, so a fabricated case name attached to a real locator was being reported as
  // "verified". "Peterson v. Iran Air, 905 F. Supp. 2d 121 (D.D.C. 2012)" is one of the two
  // ChatGPT-fabricated citations from the real Mata v. Avianca filing (see
  // tests/hallucinationCheck.test.ts's MATA_FILING_EXCERPT) -- run against the live API, it must
  // not come back verified, whether that's because the locator itself doesn't resolve to anything
  // or because it resolves to a real but differently-named case.
  test('does not verify a fabricated case name against the real API', async () => {
    const provider = new CourtListenerProvider();
    await provider.authenticate({ apiToken: LIVE_TOKEN as string });

    const [result] = await checkCitationsForHallucinations(
      ['Peterson v. Iran Air, 905 F. Supp. 2d 121 (D.D.C. 2012)'],
      [provider]
    );

    if (result.rateLimitedProviders.length > 0) {
      throw new Error('CourtListener rate-limited this test run -- wait a minute and re-run npm run test:live.');
    }
    expect(result.verifiedVia).toBeNull();
  });

  test('fetchOpinionExcerpt returns null when no page marker matches the requested page', async () => {
    const provider = new CourtListenerProvider();
    await provider.authenticate({ apiToken: LIVE_TOKEN as string });

    const { excerpt, rateLimited } = await provider.fetchOpinionExcerpt(
      { raw: 'Norfolk & W. Ry. Co. v. Liepelt, 444 U.S. 490 (1980)' },
      [999999]
    );
    if (rateLimited) {
      throw new Error('CourtListener rate-limited this test run -- wait a minute and re-run npm run test:live.');
    }
    expect(excerpt).toBeNull();
  });
});
