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
const CASE_NAME = `${NAME_START_TOKEN}(?:\\s+${NAME_CONT_TOKEN})*`;
// A complete number token, e.g. the "745" in "745, 753" or the "349" in "349 F. Supp. 3d". The
// trailing \b matters: without it, "\d+" happily matches just the "3" out of a reporter suffix like
// "3d" (as in "F. Supp. 3d"), and since everything after the page number is optional, the regex
// would accept that truncated parse instead of expanding the (lazy) reporter to swallow "3d" and
// finding the real page number ("745") after it.
const NUMBER = "\\d+\\b";
// A footnote pincite attached to a page, e.g. the "n.1" in "567 n.1" (Bluebook Rule 3.2(c)).
// Deliberately lowercase-only "n." -- reporter abbreviations that could otherwise collide here
// (N.E.2d, N.Y.S.2d, ...) always start uppercase, so this can't mistake one for a footnote marker.
const FOOTNOTE = "n\\.?\\s*\\d+\\b";
// A single pincite page, e.g. "496", a range like "705-06", or either with a trailing footnote
// pincite ("567 n.1"). Bluebook citations commonly cite several pincite pages at once (e.g. "393
// U.S. 503, 505, 508, 513 (1969)"), so the full pincite segment is zero or more comma-separated
// instances of this, not just one.
const PINCITE_PAGE = `${NUMBER}(?:-\\d+\\b)?(?:\\s+${FOOTNOTE})?`;
const PINCITE_LIST = `${PINCITE_PAGE}(?:,\\s*${PINCITE_PAGE})*`;
const PINCITE = `(?:,\\s*${PINCITE_LIST})?`;
const CASE_CITATION_REGEX = new RegExp(
  `${CASE_NAME}\\s+v\\.?\\s+${CASE_NAME},\\s*${NUMBER}\\s+[A-Za-z0-9.&' ]+?\\s+${NUMBER}${PINCITE}(?:\\s*\\([^)]*\\))?`,
  "g"
);
// A Bluebook short-form citation (Rule 10.9), e.g. "Rundo, 990 F.3d at 712" -- referring back to
// a case already cited in full elsewhere. Structurally just one case name (no "v."), a reporter
// cite, and a pincite introduced by the literal "at" instead of a bare page number. "at" is what
// makes this reliably distinguishable from ordinary prose despite the otherwise-loose case-name
// token pattern.
const SHORT_FORM_CITATION_REGEX = new RegExp(
  `${CASE_NAME},\\s*${NUMBER}\\s+[A-Za-z0-9.&' ]+?\\s+at\\s+${PINCITE_LIST}`,
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
const LEADING_SIGNAL_REGEX =
  /^(?:see\s*,?\s*e\.g\.,?|see\s+also|see\s+generally|but\s+see|but\s+cf\.?|cf\.?|accord|contra|compare|see)\s+/i;

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
      `^(.+?),\\s*(${NUMBER})\\s+([A-Za-z0-9.&' ]+?)\\s+(?<!\\bat\\s+)(${NUMBER})(?:,\\s*(${PINCITE_LIST}))?\\s*(?:\\(([^)]*)\\))?\\s*$`
    )
  );

  if (match) {
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

  // Fall back to the short-form pattern (Rule 10.9), e.g. "Rundo, 990 F.3d at 712" -- no
  // court/year parenthetical, since a short form refers back to a case cited in full elsewhere.
  const shortMatch = raw.match(
    new RegExp(`^(${CASE_NAME}),\\s*(${NUMBER})\\s+([A-Za-z0-9.&' ]+?)\\s+at\\s+(${PINCITE_LIST})\\s*$`)
  );

  if (shortMatch) {
    const [, caseName, volume, reporter, pincite] = shortMatch;
    return {
      raw,
      caseName: caseName?.trim(),
      volume: volume?.trim(),
      reporter: reporter?.trim(),
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
