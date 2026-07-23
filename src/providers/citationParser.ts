import { normalizeText, normalizeReporterSpacing, escapeRegExp } from "../utils";
import { ParsedCitation } from "./types";
// Data-only leaves from the vendored Bluebook tables (reporters-db). Importing them here does not
// create a module cycle -- the generated files import nothing -- but it is the one place the
// providers layer reaches into bluebook/, so keep it confined to these two tables.
import { CASE_NAME_ABBREVIATIONS } from "../bluebook/generated/caseNameAbbreviations.generated";
import { STATE_ABBREVIATIONS } from "../bluebook/generated/stateAbbreviations.generated";

// A case-name "word" is either a capitalized token (Norfolk, W., Ry., Co., State, York...), the
// literal "&", or one of a small set of lowercase connectors Bluebook case names commonly contain
// (State of New York, United States ex rel. Doe, In re Foo). Requiring every token to look like part
// of a proper name -- rather than matching any run of non-punctuation text -- keeps ordinary lowercase
// prose ("the court's holding in ...") from being swallowed into the captured case name, since periods
// alone (used heavily in reporter/party abbreviations) can't be relied on as a sentence boundary.
const NAME_START_TOKEN = "[A-Z][A-Za-z.'&-]*";
const NAME_CONT_TOKEN = "(?:[A-Z][A-Za-z.'&-]*|&|of|the|and|for|a|an|ex|rel\\.?)";
// Corporate designators ("Inc.", "Co.", "Ltd.", ...) are needed in three places below: the
// trailing comma-suffix a party name can carry ("Delta Airlines, Inc."), the guard against
// starting a left party at a bare designator, and the guard against a designator bridging a
// sentence boundary. Rather than hand-maintaining the designator strings, we derive them from the
// vendored Free Law Project tables so they stay in sync with upstream: the only hand-authored
// input is a short, documented list of organizational-form *words*, looked up in
// CASE_NAME_ABBREVIATIONS to get the authoritative abbreviation ("company" -> "Co.",
// "incorporated" -> "Inc."). Entity-form initialisms (LLC, LLP, L.P., ...) are the one designator
// class reporters-db does not carry, so they are declared here as a small grammar group -- like
// the lowercase connectors in the token patterns -- rather than a hand-picked list of
// abbreviation strings.
const ORG_FORM_WORDS = ["company", "corporation", "incorporated", "limited"];
const ENTITY_FORM_INITIALISMS = ["LLC", "LLP", "PLLC", "L.L.C.", "L.L.P.", "L.P."];

function designatorsForWords(words: string[]): string[] {
  const table = CASE_NAME_ABBREVIATIONS as Record<string, string>;
  return words.map((word) => table[word]).filter((abbreviation): abbreviation is string => Boolean(abbreviation));
}
const ALL_DESIGNATORS = [...designatorsForWords(ORG_FORM_WORDS), ...ENTITY_FORM_INITIALISMS];

// Builds a regex fragment matching any designator as a complete token. A dotted form ("Inc.",
// "L.P.") requires its trailing dot: with an *optional* dot, "Inc." can also match as bare "Inc",
// and a following boundary check then misfires one character early (against the ".") and wrongly
// concludes the name continues. Bare initialisms (LLC/LLP/PLLC) take an optional dot. The trailing
// (?![A-Za-z]) stops a designator from matching a prefix of a longer word. Sorted longest-first so
// a shorter alternative can't shadow a longer one that shares its prefix.
function buildDesignatorToken(designators: string[]): string {
  const alternatives = designators
    .slice()
    .sort((a, b) => b.length - a.length)
    .map((designator) =>
      designator.endsWith(".")
        ? `${escapeRegExp(designator.slice(0, -1))}\\.`
        : `${escapeRegExp(designator)}\\.?`
    );
  return `(?:${alternatives.join("|")})(?![A-Za-z])`;
}
const ALL_DESIGNATOR_TOKEN = buildDesignatorToken(ALL_DESIGNATORS);

// A party name is sometimes followed by a comma-separated corporate designator (Bluebook Rule
// 10.2.1(f) drops most of these, but plenty of real-world citations -- including both of the
// ChatGPT-fabricated citations in the Mata v. Avianca filing this parser is tested against --
// still write them out), e.g. "Delta Airlines, Inc." or "China Southern Airlines Co., Ltd." (two
// such suffixes in a row). Without this, the bare CASE_NAME token loop below has no way to cross
// the comma before "Inc."/"Ltd." and the whole citation fails to match at all. The dot is optional
// here ("Airlines, Inc" and "Airlines, Inc." both occur).
const NAME_SUFFIX_DESIGNATOR = Array.from(
  new Set(ALL_DESIGNATORS.map((designator) => escapeRegExp(designator.replace(/\.$/, ""))))
)
  .sort((a, b) => b.length - a.length)
  .join("|");
const NAME_SUFFIX = `(?:,\\s+(?:${NAME_SUFFIX_DESIGNATOR})\\.?)*`;
// Bounding the continuation-token repeat (real Bluebook case names don't run past a handful of
// words) keeps worst-case scan time roughly linear in document length. An unbounded `*` here let
// long non-matching runs of capitalized tokens (an all-caps heading, a name-heavy appendix) drive
// the regex engine into quadratic backtracking -- confirmed ~20s on a 150K-char adversarial input
// before this bound was added.
const CASE_NAME = `${NAME_START_TOKEN}(?:\\s+${NAME_CONT_TOKEN}){0,12}${NAME_SUFFIX}`;

// The party before "v." needs a stricter period rule than the general CASE_NAME pattern. With the
// permissive token above, a citation after a sentence could begin at the preceding proper noun:
// "Warsaw Convention. Miller v. ..." was captured as one case name. Periods on the left side are
// therefore accepted only for abbreviation-shaped tokens. The right side and "In re" captions keep
// the permissive pattern because source documents sometimes contain punctuation/OCR artifacts such
// as "United Airlines. Inc." and "New Orleans. La." that still need to be extracted intact.
//
// The dotted-abbreviation alternation is built from the vendored Bluebook tables (case-name
// abbreviations, Bluebook T6, plus state abbreviations, T10), so every abbreviation those tables
// recognize ("Mass.", "Pharm.", "Consol.", "Okla.", ...) is a valid left-party token. Only dotted
// forms go into the alternation: apostrophe abbreviations ("Ass'n", "Dep't", "Nat'l") carry no
// period and are already matched by the plain capitalized branch of LEFT_NAME_TOKEN. Multi-token
// entries ("W. Va.") are split so each dotted token participates on its own. Entries are
// regex-escaped and sorted longest-first so a shorter alternative can never shadow a longer one
// that shares its prefix. Reporter abbreviations are deliberately excluded -- they name reporters,
// not parties.
const BLUEBOOK_DOTTED_ABBREVIATIONS = Array.from(
  new Set(
    [...Object.values(CASE_NAME_ABBREVIATIONS), ...Object.keys(STATE_ABBREVIATIONS)]
      .flatMap((abbreviation) => abbreviation.split(/\s+/))
      .filter((token) => token.endsWith("."))
  )
).sort((a, b) => b.length - a.length);

// Generic abbreviation shapes (initials like "W.S.", short tokens like "Ry.", all-caps runs like
// "NLRB.") are kept alongside the table-derived alternation: party initials and reporter-style
// letter runs are productive patterns no finite table enumerates.
const NAME_ABBREVIATION_TOKEN =
  "(?:(?:[A-Z]\\.)+|[A-Z][a-z]{0,2}\\.|[A-Z]{2,4}\\.|" +
  BLUEBOOK_DOTTED_ABBREVIATIONS.map(escapeRegExp).join("|") +
  ")";
const LEFT_NAME_TOKEN = `(?:[A-Z][A-Za-z'&-]*|${NAME_ABBREVIATION_TOKEN})`;
// Don't START a left party in the middle of a word, and don't start it at a bare designator. The
// leading (?<![A-Za-z.]) matters when the start guard rejects a designator that begins with a
// repeated letter or dotted initials: after refusing to open at "LLC."/"L.L.C.", the scanner would
// otherwise retry one character in and match the fragment "LC."/"L.C." as an abbreviation-shaped
// token ("...Holdings LLC. Miller v. Carter" -> "LC. Miller v. Carter"). Requiring a word boundary
// before the first token keeps the party starting at a real word ("Miller").
const LEFT_NAME_START_TOKEN =
  `(?<![A-Za-z.])(?!${ALL_DESIGNATOR_TOKEN}(?:\\s|,|\\)|;|:|$))${LEFT_NAME_TOKEN}`;
// A corporate designator ends a party name, so it may be followed only by "v.", a lowercase
// connector, a comma-suffix, another designator, or the end of the name -- never by a fresh
// capitalized proper noun. Enforcing that with a single rule (a designator may not be immediately
// followed by a capitalized token that is not itself a designator) covers both failure modes:
//   - a terminal designator bridging a sentence: "reorganized as Widget Inc. Smith v. Jones"
//     would otherwise capture "Widget Inc. Smith";
//   - a mid-name designator (Co./Corp.) bridging a sentence: "...owned by Bechtel Corp.
//     Massachusetts v. EPA" would otherwise capture "Bechtel Corp. Massachusetts".
// It leaves real captions intact because there the token after a designator is "v." ("Norfolk &
// W. Ry. Co. v. Liepelt"), a lowercase connector ("Ins. Co. of North America"), or another
// designator ("Time Warner Entm't Co. L.P."), none of which is a bare capitalized word.
const LEFT_NAME_CONT_TOKEN =
  `(?:(?!${ALL_DESIGNATOR_TOKEN}\\s+(?!${ALL_DESIGNATOR_TOKEN})[A-Z])${LEFT_NAME_TOKEN}` +
  `|&|of|the|and|for|a|an|ex|rel\\.?)`;
const LEFT_CASE_NAME =
  `${LEFT_NAME_START_TOKEN}(?:\\s+${LEFT_NAME_CONT_TOKEN}){0,12}${NAME_SUFFIX}`;

// Full case captions are not limited to adversarial "Party v. Party" names. Bankruptcy,
// probate, administrative, and consolidated-disaster matters commonly use "In re ...".
// Both alternatives reuse bounded case-name components so this additional coverage does
// not reintroduce the unbounded case-name backtracking fixed above.
const VERSUS_CASE_NAME = `${LEFT_CASE_NAME}\\s+v\\.?\\s+${CASE_NAME}`;
const IN_RE_CASE_NAME = `In\\s+re\\s+${CASE_NAME}`;
const FULL_CASE_NAME = `(?:${VERSUS_CASE_NAME}|${IN_RE_CASE_NAME})`;

// A complete number token, e.g. the "745" in "745, 753" or the "349" in "349 F. Supp. 3d". The
// trailing \b matters: without it, "\d+" happily matches just the "3" out of a reporter suffix like
// "3d" (as in "F. Supp. 3d"), and since everything after the page number is optional, the regex
// would accept that truncated parse instead of expanding the (lazy) reporter to swallow "3d" and
// finding the real page number ("745") after it.
const NUMBER = "\\d+\\b";

// Reporter text must start with a letter and is capped at 40 characters. The cap keeps every
// locator attempt bounded while covering real abbreviations such as "U.S.", "F. Supp. 3d",
// "S.Ct.", and "L.Ed.2d".
const REPORTER = "[A-Za-z][A-Za-z0-9.&' ]{0,39}?";

// A footnote pincite attached to a page, e.g. the "n.1" in "567 n.1" (Bluebook Rule 3.2(c)).
// Deliberately lowercase-only "n." -- reporter abbreviations that could otherwise collide here
// (N.E.2d, N.Y.S.2d, ...) always start uppercase, so this can't mistake one for a footnote marker.
const FOOTNOTE = "n\\.?\\s*\\d+\\b";

// A single pincite page, e.g. "496", a range like "705-06", or either with a trailing footnote
// pincite ("567 n.1"). Word, PDFs, and OCR frequently substitute a soft hyphen, Unicode hyphen,
// non-breaking hyphen, figure dash, en/em dash, horizontal bar, or minus sign for ASCII "-".
// Accept those only between digit runs.
//
// The final negative lookahead distinguishes a numeric pincite from the volume at the start of
// a parallel reporter citation: "..., 88 S.Ct. 1753" is a locator, not pincite page 88. The
// reporter portion is bounded, so this classification check remains bounded too.
const PINCITE_RANGE_SEPARATOR = "[-\\u00AD\\u2010-\\u2015\\u2212]";
const PINCITE_PAGE =
  `${NUMBER}(?:${PINCITE_RANGE_SEPARATOR}\\d+\\b)?(?:\\s+${FOOTNOTE})?` +
  `(?!\\s+${REPORTER}\\s+${NUMBER})`;
const PINCITE_LIST = `${PINCITE_PAGE}(?:,\\s*${PINCITE_PAGE})*`;
const PINCITE = `(?:,\\s*${PINCITE_LIST})?`;

// A reporter locator is a volume, a bounded reporter abbreviation, and a first page. A case
// may include one or more comma-separated parallel locators, each optionally followed by its
// own pincite list. The final guard prevents the regex from accepting a valid prefix while a
// complete parallel locator remains unconsumed.
const LOCATOR = `${NUMBER}\\s+${REPORTER}\\s+${NUMBER}`;
const PARALLEL_LOCATORS = `(?:,\\s*${LOCATOR}${PINCITE})*`;
const NO_UNCONSUMED_PARALLEL_LOCATOR = `(?!,\\s*${LOCATOR})`;

const CASE_CITATION_REGEX = new RegExp(
  `${FULL_CASE_NAME},\\s*${LOCATOR}${PINCITE}${PARALLEL_LOCATORS}` +
    `(?:\\s*\\([^)]*\\))?${NO_UNCONSUMED_PARALLEL_LOCATOR}`,
  "g"
);
// A Bluebook short-form citation (Rule 10.9), e.g. "Rundo, 990 F.3d at 712" -- referring back to
// a case already cited in full elsewhere. Structurally just one case name (no "v."), a reporter
// cite, and a pincite introduced by the literal "at" instead of a bare page number. "at" is what
// makes this reliably distinguishable from ordinary prose despite the otherwise-loose case-name
// token pattern.
// FIX #1 (02-RESEARCH.md Finding 1): the comma is optional before "at" -- mirrors SUPRA_REGEX's
// already-correct ",?\s+at\s+" shape below -- so the U.S. Reports/SCOTUS-style convention that
// puts a comma before "at" (e.g. "515 U.S., at 240") is not silently invisible to this scanner.
const SHORT_FORM_CITATION_REGEX = new RegExp(
  `${CASE_NAME},\\s*${NUMBER}\\s+${REPORTER},?\\s+at\\s+${PINCITE_LIST}`,
  "g"
);
// An "Id." citation (Rule 10.9(b)/4.1), e.g. "Id. at 715" or "Id. at 719 n.2" -- refers back to
// the single most recently cited authority, restating nothing but a new pincite. Scoped to
// requiring "at <pincite>": a bare "Id." with no pincite has nothing for this parser to check
// (no reporter, no page), so there's no reason to extract it just to report "no issues found".
const ID_CITATION_REGEX = new RegExp(`\\b[Ii]d\\.\\s+at\\s+${PINCITE_LIST}`, "g");

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
//
// The reporter segment is bounded to {1,40} rather than left as an unbounded lazy `+?`: unlike
// CASE_CITATION_REGEX (where a required literal " v " sharply limits how many positions the
// expensive part of the pattern is even attempted from), the leading case name here is optional,
// so a bare NUMBER can anchor an attempt at nearly every digit run in the text. With an unbounded
// lazy reporter segment, each of those O(n) attempts re-scans the rest of the string looking for
// a literal " at " that a document may never contain -- confirmed quadratic (~8s at ~109K chars,
// ~25s at ~189K chars) before this bound was added. No real Bluebook reporter abbreviation runs
// anywhere near 40 characters.
// FIX #1 (02-RESEARCH.md Finding 1): optional comma before "at", same shape as SUPRA_REGEX.
// The {1,40}? reporter bound above is an unrelated, already-verified ReDoS-safety fix -- kept
// exactly as-is; the reporter character class still excludes commas, so a lazy scan still stops
// at the first comma it hits, and the new ",?" only optionally consumes that one comma.
const SHORT_FORM_REGEX = new RegExp(
  `(?:(${CASE_NAME}),\\s+)?(${NUMBER})\\s+(${REPORTER}),?\\s+at\\s+(${PINCITE_PAGE})`,
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
  /**
   * For "short" tokens only: the volume/reporter this token's own regex match captured (FIX #2 /
   * 02-RESEARCH.md Finding 2) -- lets clustering resolve a nameless short form by its own locator
   * instead of blindly attaching to whichever full citation was most recently seen.
   */
  volume?: string;
  reporter?: string;
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
    // FIX #2 (02-RESEARCH.md Finding 2): capture volume/reporter (groups 2/3) instead of
    // discarding them -- clusterCitationTokens needs these to resolve a nameless short form by
    // its own locator rather than always falling back to the most-recently-seen full citation.
    const [, namePart, volume, reporter, pincite] = match;
    tokens.push({
      type: "short",
      raw: normalizeText(match[0]),
      index: match.index,
      namePart: namePart ? normalizeNamePart(namePart) : undefined,
      pincite: pincite ? normalizeText(pincite) : undefined,
      volume: volume ? volume.trim() : undefined,
      reporter: reporter ? normalizeReporterSpacing(reporter.trim()) : undefined,
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
  /**
   * The leadCitation's own volume/reporter (FIX #2 / 02-RESEARCH.md Finding 2), captured once at
   * cluster-creation time (same parseCaseCitation call that produces caseName) so a nameless
   * short-form token can be matched to the cluster whose locator it actually names, without a
   * second regex pass per token.
   */
  volume?: string;
  reporter?: string;
  tokens: CitationToken[];
}

// A short-form/supra name fragment ("Liepelt") is treated as referring to a cluster's case name
// ("Norfolk & W. Ry. Co. v. Liepelt") when it matches (in either direction, to tolerate
// abbreviation differences) one of the two party names split on " v. ".
//
// FIX #3 (02-RESEARCH.md Finding 3 / FIX-03): this used to do its own raw `.toLowerCase()` +
// `.includes()` comparison -- a second, independent case-name-comparison implementation that
// never received the whole-word-containment hardening caseNamesMatch got in SECURITY_AUDIT.md
// round 2 finding 5. That let a short fragment ("Air") falsely match as a raw substring of an
// unrelated case name ("Blair v. United States"). Rewritten to delegate to the same hardened
// normalizeCaseNameParty/partyWordsContain helpers caseNamesMatch uses, so this bypass class
// cannot recur in a third comparator.
function caseNameMatchesToken(caseName: string, namePart: string): boolean {
  const normalizedNamePart = normalizeCaseNameParty(namePart);
  if (!normalizedNamePart) return false;
  return caseName
    .split(/\s+v\.?\s+/i)
    .map(normalizeCaseNameParty)
    .some(
      (party) =>
        (party !== "" && party === normalizedNamePart) ||
        partyWordsContain(party, normalizedNamePart) ||
        partyWordsContain(normalizedNamePart, party)
    );
}

function normalizeCaseNameParty(party: string): string {
  return party
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// One normalized party name "contains" another only when the shorter appears as a contiguous run
// of whole words inside the longer (e.g. "delta airlines" inside "delta airlines inc"). A raw
// String#includes here would defeat the whole verification this feeds: every string contains ""
// (so a party that normalizes to empty -- ". v. ," parses fine -- matched anything), and short
// fragments match on accident ("us", from "U.S.", is a substring of "columbus", so
// "U.S. v. Smith" counted as verified by a lookup that actually returned "Columbus v. Smith").
function partyWordsContain(container: string, contained: string): boolean {
  const containerWords = container.split(" ").filter(Boolean);
  const containedWords = contained.split(" ").filter(Boolean);
  if (containedWords.length === 0 || containedWords.length > containerWords.length) {
    return false;
  }
  for (let start = 0; start + containedWords.length <= containerWords.length; start++) {
    let allEqual = true;
    for (let offset = 0; offset < containedWords.length; offset++) {
      if (containerWords[start + offset] !== containedWords[offset]) {
        allEqual = false;
        break;
      }
    }
    if (allEqual) {
      return true;
    }
  }
  return false;
}

/**
 * Compares two full case names for a real correspondence, tolerating abbreviation differences (in
 * either direction) the same way caseNameMatchesToken does for short forms.
 *
 * This exists to catch a specific, dangerous class of citation hallucination: a lookup provider
 * that resolves a citation by its locator (reporter/volume/page) rather than by the case name
 * attached to it -- which is exactly how CourtListener's citation-lookup API works -- will
 * happily return the real case actually published at that locator even when the case name typed
 * (or fabricated by an LLM) alongside it names a different case entirely. A non-null
 * CitationProvider#lookupCitation() result therefore does not by itself mean the citation is
 * real; it means *a* case exists at that locator. Callers that treat "found a locator" as
 * "verified" without also checking this can be fooled by exactly the kind of fabricated citation
 * (a real reporter/volume/page attached to an invented party name) at the center of the Mata v.
 * Avianca ChatGPT-hallucinated-citations incident -- see tests/hallucinationCheck.test.ts.
 */
export function caseNamesMatch(a: string, b: string): boolean {
  const partiesA = a.split(/\s+v\.?\s+/i).map(normalizeCaseNameParty);
  const partiesB = b.split(/\s+v\.?\s+/i).map(normalizeCaseNameParty);

  if (partiesA.length !== 2 || partiesB.length !== 2) {
    const wholeA = normalizeCaseNameParty(a);
    const wholeB = normalizeCaseNameParty(b);
    // Two names that both normalize to nothing share no evidence of naming the same case.
    return wholeA !== "" && wholeA === wholeB;
  }

  const partyMatches = (p1: string, p2: string) =>
    (p1 !== "" && p1 === p2) || partyWordsContain(p1, p2) || partyWordsContain(p2, p1);
  return partyMatches(partiesA[0], partiesB[0]) && partyMatches(partiesA[1], partiesB[1]);
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
      const cluster: CitationCluster = {
        leadCitation: token.raw,
        caseName: parsed?.caseName,
        volume: parsed?.volume,
        reporter: parsed?.reporter,
        tokens: [token],
      };
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
    } else if (token.volume && token.reporter) {
      // FIX #2 (02-RESEARCH.md Finding 2): a nameless short form must resolve by its OWN
      // volume+reporter locator before falling back to whichever full citation was most recently
      // seen -- otherwise a bare short form always misattaches to the most recent citation even
      // when an earlier cluster's own reporter/volume is the one it actually matches.
      target =
        [...clusters].reverse().find((cluster) => cluster.volume === token.volume && cluster.reporter === token.reporter) ??
        lastCluster ??
        undefined;
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
  for (const cluster of clusters) {
    for (const token of cluster.tokens) {
      clustered.add(token);
    }
  }
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
  const matches = [
    ...(text.match(CASE_CITATION_REGEX) || []),
    ...(text.match(SHORT_FORM_CITATION_REGEX) || []),
    ...(text.match(ID_CITATION_REGEX) || []),
  ];
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

  // The negative lookbehind before the required page number blocks the lazy reporter capture
  // from absorbing a literal "at" (e.g. in "990 F.3d at 712") on its way to the first digit it
  // can reach -- without it, the reporter group would happily swallow "F.3d at" whole and treat
  // "712" as a normal long-form page, silently misparsing what's actually a Rule 10.9 short-form
  // citation (see the short-form fallback below) instead of leaving it for that pattern to match.
  const match = raw.match(
    new RegExp(
      `^(.+?),\\s*(${NUMBER})\\s+(${REPORTER})\\s+(?<!\\bat\\s)(${NUMBER})` +
        `(?:,\\s*(${PINCITE_LIST}))?${PARALLEL_LOCATORS}\\s*(?:\\(([^)]*)\\))?\\s*$`
    )
  );

  if (match) {
    const [, caseName, volume, reporter, page, pincite, parenthetical] = match;
    const reporterTrimmed = reporter.trim();
    const parsed: ParsedCitation = {
      raw,
      caseName: caseName?.trim(),
      volume: volume?.trim(),
      reporter: normalizeReporterSpacing(reporterTrimmed),
      reporterRaw: reporterTrimmed,
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

  // Fall back to the short-form pattern (Rule 10.9), e.g. "Rundo, 990 F.3d at 712" -- no
  // court/year parenthetical, since a short form refers back to a case cited in full elsewhere.
  // FIX #1 (02-RESEARCH.md Finding 1): comma before "at" is optional, matching SUPRA_REGEX's
  // existing ",?\s+at\s+" shape, so a U.S. Reports/SCOTUS-style short form like "Roe, 410 U.S.,
  // at 165" parses instead of silently returning null.
  const shortMatch = raw.match(
    new RegExp(`^(${CASE_NAME}),\\s*(${NUMBER})\\s+(${REPORTER}),?\\s+at\\s+(${PINCITE_LIST})\\s*$`)
  );

  if (shortMatch) {
    const [, caseName, volume, reporter, pincite] = shortMatch;
    const reporterTrimmed = reporter.trim();
    return {
      raw,
      caseName: caseName?.trim(),
      volume: volume?.trim(),
      reporter: normalizeReporterSpacing(reporterTrimmed),
      reporterRaw: reporterTrimmed,
      pincite: pincite?.trim(),
      isShortForm: true,
    };
  }

  // Fall back further to an "Id." citation (Rule 4.1/10.9(b)), e.g. "Id. at 715 n.2" -- no case
  // name, volume, or reporter of its own; it refers back to whatever was cited immediately before.
  const idMatch = raw.match(new RegExp(`^[Ii]d\\.\\s+at\\s+(${PINCITE_LIST})$`));

  if (idMatch) {
    const [, pincite] = idMatch;
    return {
      raw,
      pincite: pincite.trim(),
      isShortForm: true,
      isIdCitation: true,
    };
  }

  return null;
}
