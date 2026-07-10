import {
  extractCitationTokens,
  clusterCitationTokens,
  findOrphanedCitations,
} from "../src/providers/citationParser";

describe("extractCitationTokens", () => {
  test("finds a full citation", () => {
    const tokens = extractCitationTokens("Norfolk & W. Ry. Co. v. Liepelt, 444 U.S. 490 (U.S.Ill., 1980).");
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ type: "full", raw: "Norfolk & W. Ry. Co. v. Liepelt, 444 U.S. 490 (U.S.Ill., 1980)" });
  });

  test("finds a named short-form citation ('Liepelt, 444 U.S. at 495')", () => {
    const tokens = extractCitationTokens("As discussed in Liepelt, 444 U.S. at 495, the rule is settled.");
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ type: "short", namePart: "Liepelt", pincite: "495" });
  });

  test("finds a bare short-form citation with no name ('444 U.S. at 495')", () => {
    const tokens = extractCitationTokens("The Court later held, 444 U.S. at 495, that damages were limited.");
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ type: "short", pincite: "495" });
    expect(tokens[0].namePart).toBeUndefined();
  });

  test("finds an 'Id.' citation with a pincite", () => {
    const tokens = extractCitationTokens("Id. at 495");
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ type: "id", pincite: "495" });
  });

  test("finds a bare 'Id.' with no pincite", () => {
    const tokens = extractCitationTokens("Id.");
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ type: "id" });
    expect(tokens[0].pincite).toBeUndefined();
  });

  test("does not match 'Id.' inside a longer word like 'Idaho'", () => {
    const tokens = extractCitationTokens("The dispute arose in Idaho.");
    expect(tokens).toHaveLength(0);
  });

  test("finds a supra citation with a note number", () => {
    const tokens = extractCitationTokens("See Liepelt, supra note 12.");
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ type: "supra", namePart: "Liepelt" });
  });

  test("a short-form match inside a full citation's own parenthetical is not double-counted", () => {
    // "490" here is the full citation's page, not a short-form pincite -- there is no literal
    // " at " anywhere in this string, so SHORT_FORM_REGEX has nothing to match in the first place,
    // but this guards against a future change accidentally re-matching within the full span.
    const tokens = extractCitationTokens("Norfolk & W. Ry. Co. v. Liepelt, 444 U.S. 490 (U.S.Ill., 1980).");
    expect(tokens.filter((t) => t.type !== "full")).toHaveLength(0);
  });
});

describe("clusterCitationTokens", () => {
  test("attaches a named short-form citation to its full citation's cluster", () => {
    const text =
      "Norfolk & W. Ry. Co. v. Liepelt, 444 U.S. 490 (1980). Later, the Court in Liepelt, 444 U.S. at 495, explained further.";
    const clusters = clusterCitationTokens(extractCitationTokens(text));

    expect(clusters).toHaveLength(1);
    expect(clusters[0].tokens).toHaveLength(2);
    expect(clusters[0].tokens[1]).toMatchObject({ type: "short", pincite: "495" });
  });

  test("attaches 'Id.' to whichever citation was most recently referenced", () => {
    const text = "Foo v. Bar, 123 U.S. 456 (1990). Id. at 460.";
    const clusters = clusterCitationTokens(extractCitationTokens(text));

    expect(clusters).toHaveLength(1);
    expect(clusters[0].caseName).toBe("Foo v. Bar");
    expect(clusters[0].tokens).toHaveLength(2);
    expect(clusters[0].tokens[1]).toMatchObject({ type: "id", pincite: "460" });
  });

  test("a chain of citations updates which cluster 'Id.' points to", () => {
    const text = "Foo v. Bar, 123 U.S. 456 (1990). Baz v. Qux, 789 F.2d 100 (2d Cir. 1985). Id. at 105.";
    const clusters = clusterCitationTokens(extractCitationTokens(text));

    expect(clusters).toHaveLength(2);
    // The "Id." should attach to Baz v. Qux (the immediately preceding citation), not Foo v. Bar.
    expect(clusters[0].tokens).toHaveLength(1);
    expect(clusters[1].tokens).toHaveLength(2);
    expect(clusters[1].caseName).toBe("Baz v. Qux");
  });

  test("a named supra citation reattaches 'Id.' to an earlier, re-referenced cluster", () => {
    const text =
      "Foo v. Bar, 123 U.S. 456 (1990). Baz v. Qux, 789 F.2d 100 (2d Cir. 1985). " +
      "As Bar, supra, at 460, makes clear, the rule applies. Id. at 461.";
    const clusters = clusterCitationTokens(extractCitationTokens(text));

    const fooCluster = clusters.find((c) => c.caseName === "Foo v. Bar");
    expect(fooCluster?.tokens).toHaveLength(3); // full + supra + id.
    expect(fooCluster?.tokens[2]).toMatchObject({ type: "id", pincite: "461" });
  });
});

describe("findOrphanedCitations", () => {
  test("a leading 'Id.' with no preceding citation is orphaned", () => {
    const orphans = findOrphanedCitations("Id. at 5. The rest of the paragraph continues.");
    expect(orphans).toHaveLength(1);
    expect(orphans[0].type).toBe("id");
  });

  test("a named short-form citation with no matching full citation is orphaned", () => {
    const orphans = findOrphanedCitations("As discussed in Liepelt, 444 U.S. at 495, the rule is settled.");
    expect(orphans).toHaveLength(1);
    expect(orphans[0]).toMatchObject({ type: "short", namePart: "Liepelt" });
  });

  test("a fully resolved document has no orphans", () => {
    const orphans = findOrphanedCitations("Foo v. Bar, 123 U.S. 456 (1990). Id. at 460.");
    expect(orphans).toHaveLength(0);
  });
});
