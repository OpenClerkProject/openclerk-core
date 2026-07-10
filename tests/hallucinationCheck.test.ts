import { extractCaseCitations } from "../src/providers/citationParser";
import { checkCitationsForHallucinations } from "../src/providers/hallucinationCheck";
import { CitationProvider, CitationMatch, ParsedCitation } from "../src/providers/types";

// Real excerpt from the affirmation in opposition filed in Mata v. Avianca, Inc., No.
// 1:22-cv-01461-PKC (S.D.N.Y.), Document 21 (Mar. 1, 2023) -- the filing at the center of the
// widely reported incident in which counsel submitted ChatGPT-fabricated case citations to a
// federal court. openclerk-web persists the full PDF as a fixture for its PDF/OCR feature (the
// underlying page images have no embedded text layer of their own, so recovering this excerpt
// there is a real OCR round-trip, not just text-layer extraction); this excerpt is copied
// verbatim from that recovered text. "Peterson v. Iran Air" and "Martinez v. Delta Airlines,
// Inc." are two of the citations that do not correspond to any real case -- exactly the scenario
// extractCaseCitations/checkCitationsForHallucinations exist to help a reviewer catch.
const MATA_FILING_EXCERPT = `
Both federal and state courts alike have continually held that the Montreal Convention does
not preempt state law remedies and that plaintiffs are entitled to choose the forum in which
to bring their claim. In Shaboon v. Egyptair, 2013 IL App (1st) 111279-U (Ill. App. Ct. 2013),
the Illinois Appellate Court held that state courts have concurrent jurisdiction over claims
arising out of an international airline accident under the Montreal Convention, and that the
plaintiff was not required to bring their claim in federal court.

Similarly, in Peterson v. Iran Air, 905 F. Supp. 2d 121 (D.D.C. 2012), the District Court for
the District of Columbia held that state courts have concurrent jurisdiction over claims arising
out of an international airline accident under the Montreal Convention, and that the plaintiff
was not required to bring their claim in federal court.

In Ehrlich v. American Airlines, Inc., 360 N.J. Super. 360 (App. Div. 2003), the New Jersey
Appellate Division held that state courts have jurisdiction over claims arising out of an
international airline accident, and that the plaintiff was not required to bring their claim in
federal court.

In Martinez v. Delta Airlines, Inc., 2019 WL 4639462 (Tex. App. Sept. 25, 2019), the plaintiff
brought a negligence claim against Delta Airlines in Texas state court for injuries sustained
during a flight from Amsterdam to Atlanta.
`;

function mockProvider(name: string, knownCaseNames: string[]): CitationProvider {
  const known = new Set(knownCaseNames);
  return {
    id: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    description: "test double",
    requiresAuth: false,
    credentialFields: [],
    isAuthenticated: () => true,
    authenticate: async () => undefined,
    signOut: () => undefined,
    lookupCitation: async (citation: ParsedCitation): Promise<CitationMatch | null> => {
      if (citation.caseName && known.has(citation.caseName)) {
        return { url: `https://example.test/case/${encodeURIComponent(citation.caseName)}`, caseName: citation.caseName };
      }
      return null;
    },
  };
}

describe("citation extraction against the real Mata v. Avianca filing text", () => {
  test("extracts both ChatGPT-fabricated citations, correctly parsed", () => {
    const citations = extractCaseCitations(MATA_FILING_EXCERPT);

    expect(citations).toContain("Peterson v. Iran Air, 905 F. Supp. 2d 121 (D.D.C. 2012)");
    expect(citations).toContain("Martinez v. Delta Airlines, Inc., 2019 WL 4639462 (Tex. App. Sept. 25, 2019)");
  });

  test("also extracts a real citation from the filing alongside the fabricated ones", () => {
    // Shaboon v. Egyptair is also in this filing but cited in Illinois's "2013 IL App (1st)
    // 111279-U" electronic-citation format, which this regex-based parser doesn't parse (a
    // separate, pre-existing limitation -- see the "known limitations" note in README.md -- not
    // specific to the two fabricated citations this test file is about).
    const citations = extractCaseCitations(MATA_FILING_EXCERPT);

    expect(citations.some((c) => c.startsWith("Ehrlich v. American Airlines, Inc."))).toBe(true);
  });
});

describe("checkCitationsForHallucinations against the real Mata v. Avianca filing text", () => {
  test("flags the two fabricated citations as unverified while a real one resolves", async () => {
    // Stands in for a real case-law database that has never heard of the cases ChatGPT invented
    // for this brief, but does recognize the filing's genuine citations.
    const provider = mockProvider("TestCaseLaw", ["Ehrlich v. American Airlines, Inc."]);

    const citations = extractCaseCitations(MATA_FILING_EXCERPT);
    const results = await checkCitationsForHallucinations(citations, [provider]);

    const peterson = results.find((r) => r.raw.startsWith("Peterson v. Iran Air"));
    const martinez = results.find((r) => r.raw.startsWith("Martinez v. Delta Airlines, Inc."));
    const ehrlich = results.find((r) => r.raw.startsWith("Ehrlich v. American Airlines, Inc."));

    expect(peterson?.verifiedVia).toBeNull();
    expect(martinez?.verifiedVia).toBeNull();
    expect(ehrlich?.verifiedVia).toBe("TestCaseLaw");
  });

  test("does not flag a citation as a hallucination just because the only checked provider was rate-limited", async () => {
    const rateLimitedProvider: CitationProvider = {
      id: "rate-limited",
      name: "RateLimited",
      description: "test double",
      requiresAuth: false,
      credentialFields: [],
      isAuthenticated: () => true,
      authenticate: async () => undefined,
      signOut: () => undefined,
      lookupCitation: async () => null,
      wasLastRequestRateLimited: () => true,
    } as CitationProvider;

    const results = await checkCitationsForHallucinations(["Peterson v. Iran Air, 905 F. Supp. 2d 121 (D.D.C. 2012)"], [
      rateLimitedProvider,
    ]);

    expect(results[0].verifiedVia).toBeNull();
    expect(results[0].rateLimitedProviders).toEqual(["RateLimited"]);
  });
});
