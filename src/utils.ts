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
export function normalizeReporterSpacing(reporter: string): string {
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
