import { normalizeText } from "../utils";
import { ParsedCitation } from "./types";

// A case-name "word" is either a capitalized token (Norfolk, W., Ry., Co., State, York...), the
// literal "&", or one of a small set of lowercase connectors Bluebook case names commonly contain
// (State of New York, United States ex rel. Doe, In re Foo). Requiring every token to look like part
// of a proper name -- rather than matching any run of non-punctuation text -- keeps ordinary lowercase
// prose ("the court's holding in ...") from being swallowed into the captured case name, since periods
// alone (used heavily in reporter/party abbreviations) can't be relied on as a sentence boundary.
const NAME_START_TOKEN = "[A-Z][A-Za-z.'&-]*";
const NAME_CONT_TOKEN = "(?:[A-Z][A-Za-z.'&-]*|&|of|the|and|for|a|an|ex|rel\\.?)";
// A party name is sometimes followed by a comma-separated corporate-suffix designator (Bluebook
// Rule 10.2.1(f) drops most of these, but plenty of real-world citations -- including both of the
// ChatGPT-fabricated citations in the Mata v. Avianca filing this parser is tested against --
// still write them out), e.g. "Delta Airlines, Inc." or "China Southern Airlines Co., Ltd." (two
// such suffixes in a row). Without this, the bare CASE_NAME token loop above has no way to cross
// the comma before "Inc."/"Ltd." and the whole citation fails to match at all.
const NAME_SUFFIX = "(?:,\\s+(?:Inc|Ltd|Co|Corp|LLC|L\\.L\\.C|L\\.P|LLP)\\.?)*";
const CASE_NAME = `${NAME_START_TOKEN}(?:\\s+${NAME_CONT_TOKEN})*${NAME_SUFFIX}`;
// A complete number token, e.g. the "745" in "745, 753" or the "349" in "349 F. Supp. 3d". The
// trailing \b matters: without it, "\d+" happily matches just the "3" out of a reporter suffix like
// "3d" (as in "F. Supp. 3d"), and since everything after the page number is optional, the regex
// would accept that truncated parse instead of expanding the (lazy) reporter to swallow "3d" and
// finding the real page number ("745") after it.
const NUMBER = "\\d+\\b";
// A single pincite page, e.g. "496" or a range like "705-06". Bluebook citations commonly cite
// several pincite pages at once (e.g. "393 U.S. 503, 505, 508, 513 (1969)"), so the full pincite
// segment is zero or more comma-separated instances of this, not just one.
const PINCITE_PAGE = `${NUMBER}(?:-\\d+\\b)?`;
const PINCITE_LIST = `${PINCITE_PAGE}(?:,\\s*${PINCITE_PAGE})*`;
const PINCITE = `(?:,\\s*${PINCITE_LIST})?`;
const CASE_CITATION_REGEX = new RegExp(
  `${CASE_NAME}\\s+v\\.?\\s+${CASE_NAME},\\s*${NUMBER}\\s+[A-Za-z0-9.&' ]+?\\s+${NUMBER}${PINCITE}(?:\\s*\\([^)]*\\))?`,
  "g"
);

// Bluebook introductory signals (see Bluebook Rule 1.2) that commonly precede a citation with no
// intervening punctuation, e.g. "See generally Norfolk & W. Ry. Co. v. Liepelt, ...". Without
// stripping these, the greedy case-name capture above would swallow the signal into the "case name".
// Also strips a narrative leading "In" (e.g. "In Martinez v. Delta Airlines, Inc., ...") for the
// same reason -- but never when it's actually "In re ...", since that's part of the case name
// itself (e.g. "In re Air Crash Disaster"), not introductory prose.
const LEADING_SIGNAL_REGEX =
  /^(?:see\s*,?\s*e\.g\.,?|see\s+also|see\s+generally|but\s+see|but\s+cf\.?|cf\.?|accord|contra|compare|see|in(?!\s+re\b))\s+/i;

// Bluebook short-form case citation, e.g. "444 U.S. at 495" or, with a leading party-name
// signal, "Liepelt, 444 U.S. at 495" (Rule 10.9). The literal " at " before the pincite is what
// distinguishes a short form from a full citation's page number, which never uses "at".
const SHORT_FORM_REGEX = new RegExp(
  `(?:(${CASE_NAME}),\\s+)?(${NUMBER})\\s+([A-Za-z0-9.&' ]+?)\\s+at\\s+(${PINCITE_PAGE})`,
  "g"
);
// "Id." short-form citation (Rule 10.9), referring back to whichever citation immediately
// preceded it -- optionally with its own pincite ("Id. at 495"). The \b must come right after
// "Id" (before the optional period), not after it -- a period is itself a non-word character, so
// "\bId\.?\b" would find no boundary between the "." and a following space (both non-word) and
// fail to match "Id." at all. Placed before the optional period, it still keeps this from
// matching inside a longer word (e.g. "Idaho").
const ID_REGEX = new RegExp(`\\bId\\b\\.?(?:\\s+at\\s+(${PINCITE_PAGE}))?`, "g");
// "Supra" short-form citation (Rule 10.9), used for sources cited earlier without a reporter
// pincite of their own, e.g. "Liepelt, supra, at 495" or "Liepelt, supra note 12".
const SUPRA_REGEX = new RegExp(
  `(${CASE_NAME}),\\s+[Ss]upra(?:,?\\s+at\\s+(${PINCITE_PAGE}))?(?:,?\\s+note\\s+(\\d+))?`,
  "g"
);

export type CitationTokenType = "full" | "short" | "id" | "supra";

export interface CitationToken {
  type: CitationTokenType;
  /** The raw matched text, e.g. "Id. at 495" or "Liepelt, supra, at 495". */
  raw: string;
  /** Character offset where this token starts in the text it was extracted from. */
  index: number;
  /** For "short"/"supra": the case-name fragment preceding the citation, if present. */
  namePart?: string;
  /** Pinpoint page (or range) this token references, if any. */
  pincite?: string;
}

// text.matchAll() returns an iterator that isn't a plain array, so a `for...of` directly over it
// requires --downlevelIteration under this project's ES5 compile target. Materializing to an
// array first with Array.from (a plain function call, not special iteration syntax) sidesteps
// that without needing to change the target.
function matchAllToArray(text: string, regex: RegExp): RegExpMatchArray[] {
  return Array.from(text.matchAll(regex));
}

/**
 * Scans text for every full, short-form ("444 U.S. at 495"), "Id.", and "supra" case citation,
 * in document order. This is the tokenizing half of eyecite-style citation resolution: full
 * citations are found with the same heuristic as extractCaseCitations, and the short-form
 * variants are matched separately, then filtered so a short-form/id./supra pattern that happens
 * to fall inside an already-matched full citation's span (e.g. its parenthetical) isn't
 * double-counted as its own token.
 */
export function extractCitationTokens(text: string): CitationToken[] {
  const tokens: CitationToken[] = [];
  const fullSpans: Array<[number, number]> = [];

  for (const match of matchAllToArray(text, CASE_CITATION_REGEX)) {
    if (match.index === undefined) continue;
    const raw = normalizeText(match[0]).replace(LEADING_SIGNAL_REGEX, "");
    if (!raw) continue;
    fullSpans.push([match.index, match.index + match[0].length]);
    tokens.push({ type: "full", raw, index: match.index });
  }

  const withinFullSpan = (index: number) => fullSpans.some(([start, end]) => index >= start && index < end);
  // A short-form/supra name fragment can itself be preceded by a Bluebook introductory signal
  // (e.g. "See Liepelt, supra note 12") -- same fix as the full-citation case name above.
  const normalizeNamePart = (namePart: string) => normalizeText(namePart).replace(LEADING_SIGNAL_REGEX, "");

  for (const match of matchAllToArray(text, SHORT_FORM_REGEX)) {
    if (match.index === undefined || withinFullSpan(match.index)) continue;
    const [, namePart, , , pincite] = match;
    tokens.push({
      type: "short",
      raw: normalizeText(match[0]),
      index: match.index,
      namePart: namePart ? normalizeNamePart(namePart) : undefined,
      pincite: pincite ? normalizeText(pincite) : undefined,
    });
  }

  for (const match of matchAllToArray(text, ID_REGEX)) {
    if (match.index === undefined || withinFullSpan(match.index)) continue;
    tokens.push({
      type: "id",
      raw: normalizeText(match[0]),
      index: match.index,
      pincite: match[1] ? normalizeText(match[1]) : undefined,
    });
  }

  for (const match of matchAllToArray(text, SUPRA_REGEX)) {
    if (match.index === undefined || withinFullSpan(match.index)) continue;
    const [, namePart, pincite] = match;
    tokens.push({
      type: "supra",
      raw: normalizeText(match[0]),
      index: match.index,
      namePart: namePart ? normalizeNamePart(namePart) : undefined,
      pincite: pincite ? normalizeText(pincite) : undefined,
    });
  }

  return tokens.sort((a, b) => a.index - b.index);
}

export interface CitationCluster {
  /** The full citation that anchors this cluster -- identifies which case it refers to. */
  leadCitation: string;
  caseName?: string;
  tokens: CitationToken[];
}

// A short-form/supra name fragment ("Liepelt") is treated as referring to a cluster's case name
// ("Norfolk & W. Ry. Co. v. Liepelt") when it matches (in either direction, to tolerate
// abbreviation differences) one of the two party names split on " v. ".
function caseNameMatchesToken(caseName: string, namePart: string): boolean {
  const normalizedNamePart = namePart.toLowerCase().replace(/\.$/, "");
  return caseName
    .split(/\s+v\.?\s+/i)
    .map((party) => party.toLowerCase())
    .some((party) => party.includes(normalizedNamePart) || normalizedNamePart.includes(party));
}

/**
 * Groups citation tokens into clusters that refer to the same case -- eyecite calls this
 * "resolving" citations. Each full citation starts a new cluster; a short-form/supra token
 * attaches to the most recent cluster whose case name it names (or, lacking a name fragment of
 * its own, to whichever cluster was most recently referenced); an "Id." token always attaches to
 * whichever cluster was most recently referenced, since Rule 10.9 defines it that way regardless
 * of name. A short-form/supra token that names no matching antecedent is left out of every
 * cluster -- see findOrphanedCitations, which surfaces exactly those.
 */
export function clusterCitationTokens(tokens: CitationToken[]): CitationCluster[] {
  const clusters: CitationCluster[] = [];
  let lastCluster: CitationCluster | null = null;

  for (const token of tokens) {
    if (token.type === "full") {
      const parsed = parseCaseCitation(token.raw);
      const cluster: CitationCluster = { leadCitation: token.raw, caseName: parsed?.caseName, tokens: [token] };
      clusters.push(cluster);
      lastCluster = cluster;
      continue;
    }

    if (token.type === "id") {
      if (lastCluster) {
        lastCluster.tokens.push(token);
      }
      continue;
    }

    // short-form / supra
    let target: CitationCluster | undefined;
    if (token.namePart) {
      target = [...clusters].reverse().find((cluster) => cluster.caseName && caseNameMatchesToken(cluster.caseName, token.namePart!));
    } else {
      target = lastCluster ?? undefined;
    }

    if (target) {
      target.tokens.push(token);
      lastCluster = target;
    }
  }

  return clusters;
}

/**
 * Returns every short-form/id./supra token that couldn't be resolved to any preceding full
 * citation -- e.g. a stray "Id." at the very start of a document excerpt, or a short form naming
 * a case that was never fully cited. A drafting defect worth flagging on its own, separate from
 * (and not proof of) a hallucinated citation: the antecedent may simply be missing from the
 * excerpt being scanned.
 */
export function findOrphanedCitations(text: string): CitationToken[] {
  const tokens = extractCitationTokens(text);
  const clusters = clusterCitationTokens(tokens);
  const clustered = new Set<CitationToken>();
  clusters.forEach((cluster) => cluster.tokens.forEach((token) => clustered.add(token)));
  return tokens.filter((token) => token.type !== "full" && !clustered.has(token));
}

/**
 * Scans running document text for full Bluebook-style case citations, e.g.
 * "Norfolk & W. Ry. Co. v. Liepelt, 444 U.S. 490 (U.S.Ill., 1980)". This is
 * a best-effort heuristic scanner for the online-lookup workflow: a missed
 * or malformed match simply means that citation is skipped, since providers
 * are only ever asked about text this function judged citation-shaped.
 */
export function extractCaseCitations(text: string): string[] {
  const matches = text.match(CASE_CITATION_REGEX) || [];
  const unique = new Set<string>();

  matches.forEach((match) => {
    const citation = normalizeText(match).replace(LEADING_SIGNAL_REGEX, "");
    if (citation) {
      unique.add(citation);
    }
  });

  return Array.from(unique);
}

/**
 * Parses a Bluebook-style case citation, e.g.:
 *   "Norfolk & W. Ry. Co. v. Liepelt, 444 U.S. 490 (U.S.Ill., 1980)"
 * into its structural parts. Returns null when the text doesn't look like a
 * "<case name>, <volume> <reporter> <page> (<court info>)" citation.
 */
export function parseCaseCitation(text: string): ParsedCitation | null {
  const raw = normalizeText(text);
  if (!raw) {
    return null;
  }

  const match = raw.match(
    new RegExp(
      `^(.+?),\\s*(${NUMBER})\\s+([A-Za-z0-9.&' ]+?)\\s+(${NUMBER})(?:,\\s*(${PINCITE_LIST}))?\\s*(?:\\(([^)]*)\\))?\\s*$`
    )
  );

  if (!match) {
    return null;
  }

  const [, caseName, volume, reporter, page, pincite, parenthetical] = match;
  const parsed: ParsedCitation = {
    raw,
    caseName: caseName?.trim(),
    volume: volume?.trim(),
    reporter: reporter?.trim(),
    page: page?.trim(),
  };
  if (pincite) {
    parsed.pincite = pincite.trim();
  }

  if (parenthetical) {
    const yearMatch = parenthetical.match(/(\d{4})\s*$/);
    if (yearMatch) {
      parsed.year = yearMatch[1];
      const court = parenthetical.slice(0, yearMatch.index).replace(/,\s*$/, "").trim();
      if (court) {
        parsed.court = court;
      }
    } else {
      parsed.court = parenthetical.trim();
    }
  }

  return parsed;
}
