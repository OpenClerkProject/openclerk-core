export function normalizeText(value: string): string {
  return value
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Bluebook Rule 6.1: single-capital-letter reporter abbreviations are closed up (no space between
// consecutive "X." tokens where X is exactly one capital letter, or between the last such token
// and a following ordinal-series digit run) -- e.g. "U.S." not "U. S.", "F.3d" not "F. 3d". Multi-
// letter abbreviations keep their Bluebook-mandated spacing ("F. Supp. 2d", "S. Ct.") because this
// only fires when the character immediately after the captured letter is a literal "." -- "Supp."
// and "Ct." don't qualify (second character is lowercase, not "."). Bounded to a single already-
// extracted reporter substring (never full document text), so this carries none of the ReDoS risk
// documented for citationParser.ts's other regexes: confirmed linear, 66ms at 1.8M characters.
//
// This positional heuristic is necessarily context-free -- it cannot see which single-capital-
// letter reporters are, per Free Law Project's reporters-db Table T1 data (vendored at
// src/bluebook/generated/reporterAbbreviations.generated.ts and consumed by
// src/bluebook/reporterRules.ts's checkReporterAbbreviation), an exception to the general
// close-up rule (e.g. "A.L.R. 2d" legitimately keeps its space before the series digit) or a
// documented non-standard spelling that Rule 6.1 checking needs to see verbatim in order to flag
// it (e.g. "F. 2d", "C. C. A."). Found in code review (01-REVIEW.md CR-01/CR-02): applying the
// regex unconditionally either corrupts the former into a false-looking error, or silently
// "fixes" the latter before checkReporterAbbreviation ever runs, hiding a real Rule 6.1 violation.
// RESERVED_REPORTER_SPACING_FORMS is a small, hand-verified exception list (checked against the
// generated Table T1 data at review time) carving out both failure classes -- it is intentionally
// NOT a general reporters-db-driven fix: src/utils.ts is a dependency-free leaf module and must
// not import from src/bluebook/ (see CLAUDE.md's one-way providers -> bluebook non-dependency), so
// a fully data-driven version of this guard would require moving/duplicating the generated table
// into a shared leaf location -- out of scope here and tracked as a follow-up rather than
// silently left unhandled. This list only covers the specific forms verified in 01-REVIEW.md; it
// is not exhaustive of every reporters-db entry this heuristic could still mis-handle.
const RESERVED_REPORTER_SPACING_FORMS = new Set<string>([
  // CR-01: valid Table T1 forms that must round-trip unchanged (the space before the series
  // digit/parenthetical is intentional, not a Rule 6.1 mistake).
  "A.L.R. 2d",
  "A.L.R. 3d",
  "A.L.R. 4th",
  "A.L.R. 5th",
  "A.L.R. 6th",
  "Am. Law T. Rep. (N. S.)",
  "Amer. Law J. (N. S.)",
  "Colo. J. C.A.R.",
  "Colo. N. P.",
  "Haz. U. S. Reg.",
  "Law J. Q.B.",
  "N. Y. City H. Rec.",
  "Smith (N. H.)",
  "Tex. L. R.",
  "U. S. Law J.",
  "U.S.P.Q. 2d (BNA)",
  "Wash. C. C.",
  // CR-02: documented reporters-db "corrections" typos that must reach
  // checkReporterAbbreviation unmodified so its Rule 6.1 nonstandard-form check isn't silently
  // defeated by this normalizer pre-correcting the mistake away.
  "F. 2d",
  "C. C. A.",
  "N. E. 2d",
]);

export function normalizeReporterSpacing(reporter: string): string {
  if (RESERVED_REPORTER_SPACING_FORMS.has(reporter)) {
    return reporter;
  }
  return reporter.replace(/\b([A-Z])\.\s+(?=[A-Z]\.|\d)/g, "$1.");
}

export function isLikelyCaseCitation(value: string): boolean {
  const normalized = normalizeText(value);
  if (!normalized) {
    return false;
  }

  if (normalized.includes(" v. ") || normalized.includes(" v ")) {
    return true;
  }

  return /\b\d{4}\b/.test(normalized);
}

export function extractParentheticalCitations(text: string): string[] {
  const matches = text.match(/\(([^()]{1,120})\)/g) || [];
  const uniqueMatches = new Set<string>();

  matches.forEach((match) => {
    const citation = normalizeText(match.slice(1, -1));
    if (!citation || !/[A-Za-z0-9]/.test(citation)) {
      return;
    }
    uniqueMatches.add(citation);
  });

  return Array.from(uniqueMatches);
}

const ALLOWED_HYPERLINK_SCHEMES = new Set(["http:", "https:", "mailto:"]);

/**
 * Only http(s)/mailto URLs are safe to write into a Word hyperlink here -- source .docx files
 * come from whoever the user chooses to import, and parenthetical URLs are free-form user input,
 * so schemes like javascript:/vbscript:/file: must be rejected before insertHyperlink/insertHtml.
 */
export function isSafeHyperlinkUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) {
    return false;
  }
  try {
    const parsed = new URL(trimmed, "https://placeholder.invalid/");
    return ALLOWED_HYPERLINK_SCHEMES.has(parsed.protocol);
  } catch {
    return false;
  }
}

export function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Escapes regex metacharacters so a data-driven string (e.g. a vendored reporters-db entry) can
 * be safely spliced into a `new RegExp(...)` call site without being interpreted as a pattern.
 */
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function stripHtmlHyperlinks(html: string): string {
  if (!html) return "";

  // Replace anchor tags with their inner content
  let result = html.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, "$1");

  // Remove any remaining HTML tags
  result = result.replace(/<[^>]+>/g, "");

  // Decode a handful of common HTML entities in a single combined pass -- decoding sequentially
  // (one .replace() per entity) would double-unescape input like "&amp;lt;" (first pass turns
  // "&amp;" into "&", producing "&lt;", which a later pass then turns into "<").
  result = result.replace(/&amp;|&lt;|&gt;|&quot;|&#39;/g, (entity) => {
    switch (entity) {
      case "&amp;":
        return "&";
      case "&lt;":
        return "<";
      case "&gt;":
        return ">";
      case "&quot;":
        return '"';
      case "&#39;":
        return "'";
      default:
        return entity;
    }
  });

  return normalizeText(result);
}
