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
// close-up rule (e.g. "A.L.R. 2d" legitimately keeps its space before the series digit). Found in
// code review (01-REVIEW.md CR-01): applying the regex unconditionally corrupts these forms into
// a false-looking error. RESERVED_REPORTER_SPACING_FORMS is a small, hand-verified exception list
// (checked against the generated Table T1 data at review time) carving out that failure class --
// it is intentionally NOT a general reporters-db-driven fix: src/utils.ts is a dependency-free
// leaf module and must not import from src/bluebook/ (see CLAUDE.md's one-way providers ->
// bluebook non-dependency), so a fully data-driven version of this guard would require moving/
// duplicating the generated table into a shared leaf location -- out of scope here. This list only
// covers the specific forms verified in 01-REVIEW.md; it is not exhaustive of every reporters-db
// Table T1 entry with an intentional non-close-up space.
//
// NOTE on 01-REVIEW.md CR-02 (documented reporters-db "corrections"-table typos like "F. 2d",
// "C. C. A.", "N. E. 2d", and ~135 others -- including "U. S." itself): those forms used to also
// need an entry here, because `ParsedCitation.reporter` was the *only* reporter field, and
// checkReporterAbbreviation (src/bluebook/reporterRules.ts) read straight from it -- so collapsing
// "F. 2d" to "F.2d" here made the mistake invisible to that checker. That conflicted with CR-01's
// own list, since "U. S." is structurally the same kind of entry ("U. S." -> "U.S." is exactly what
// the existing collapsing behavior is supposed to do for citation *matching*). This was resolved by
// splitting `ParsedCitation` into two reporter fields (see reporterRaw in src/providers/types.ts):
// `reporter` stays normalized here for matching/lookup, while a separate `reporterRaw` field
// (populated by src/providers/citationParser.ts alongside `reporter`) carries the untouched,
// as-written text through to checkReporterAbbreviation, which now reads `reporterRaw` instead.
// That means this normalizer no longer needs to protect corrections-table entries from itself --
// the checker sees the real text regardless of what this function does to `reporter` -- so the
// CR-02 entries that used to live in this set were removed once reporterRaw shipped. The CR-01
// entries below remain: those are a genuinely separate concern (protecting citation-MATCHING
// output from being corrupted into an invalid-looking string), not something reporterRaw
// addresses.
const RESERVED_REPORTER_SPACING_FORMS = new Set<string>([
  // CR-01: valid Table T1 forms that must round-trip unchanged (the space before the series
  // digit/parenthetical is intentional, not a Rule 6.1 mistake) -- this protects the
  // matching-oriented `reporter` field itself, which reporterRaw does not address.
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
]);

let reporterSpacingNormalizationEnabled = true;

/**
 * Lets a host integration disable Rule 6.1 reporter-spacing normalization at runtime, without
 * waiting on a library update. normalizeReporterSpacing's positional heuristic is necessarily
 * context-free (it cannot see reporters-db Table T1 data -- see the RESERVED_REPORTER_SPACING_FORMS
 * comment above) and already required a hand-verified exception list to avoid corrupting some
 * legitimately-spaced forms. If a host discovers a real-world reporter form that heuristic still
 * mis-handles, this is the immediate kill switch: call setReporterSpacingNormalizationEnabled(false)
 * to make normalizeReporterSpacing (and both parseCaseCitation call sites, which call it directly)
 * return the reporter string unchanged. Defaults to enabled so nothing changes unless a host
 * explicitly opts out.
 */
export function setReporterSpacingNormalizationEnabled(enabled: boolean): void {
  reporterSpacingNormalizationEnabled = enabled;
}

export function isReporterSpacingNormalizationEnabled(): boolean {
  return reporterSpacingNormalizationEnabled;
}

/** Restores the default (enabled) reporter-spacing normalization behavior. Mainly useful between test cases. */
export function resetReporterSpacingNormalization(): void {
  reporterSpacingNormalizationEnabled = true;
}

export function normalizeReporterSpacing(reporter: string): string {
  if (!reporterSpacingNormalizationEnabled) {
    return reporter;
  }
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
