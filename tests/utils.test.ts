import {
  normalizeText,
  isLikelyCaseCitation,
  extractParentheticalCitations,
  isSafeHyperlinkUrl,
  escapeHtml,
  toSafeHyperlinkUrl,
  toSafeHtml,
} from '../src/utils';

describe('Citation helpers', () => {
  test('normalizeText removes NBSP and collapses spaces', () => {
    const input = 'This\u00A0is   a\t test';
    expect(normalizeText(input)).toBe('This is a test');
  });

  test('isLikelyCaseCitation detects v. and years', () => {
    expect(isLikelyCaseCitation('Smith v. Jones')).toBe(true);
    expect(isLikelyCaseCitation('Smith v Jones')).toBe(true);
    expect(isLikelyCaseCitation('In re Estate of Foo, 2001')).toBe(true);
    expect(isLikelyCaseCitation('Random text without case')).toBe(false);
  });

  test('extractParentheticalCitations finds parentheticals', () => {
    const text = 'See (Smith v. Jones), and also (2020). Ignore empty ().';
    const result = extractParentheticalCitations(text);
    expect(result).toContain('Smith v. Jones');
    expect(result).toContain('2020');
  });
});

describe('isSafeHyperlinkUrl', () => {
  test('allows http and https URLs', () => {
    expect(isSafeHyperlinkUrl('http://example.com')).toBe(true);
    expect(isSafeHyperlinkUrl('https://example.com/case?id=1')).toBe(true);
  });

  test('allows mailto URLs', () => {
    expect(isSafeHyperlinkUrl('mailto:someone@example.com')).toBe(true);
  });

  test('rejects javascript/vbscript/data/file schemes', () => {
    expect(isSafeHyperlinkUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeHyperlinkUrl('vbscript:msgbox(1)')).toBe(false);
    expect(isSafeHyperlinkUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeHyperlinkUrl('file:///etc/passwd')).toBe(false);
  });

  test('rejects empty or whitespace-only input', () => {
    expect(isSafeHyperlinkUrl('')).toBe(false);
    expect(isSafeHyperlinkUrl('   ')).toBe(false);
  });
});

describe('toSafeHyperlinkUrl', () => {
  test('returns the same string value for an https URL', () => {
    expect(toSafeHyperlinkUrl('https://example.com')).toBe('https://example.com');
  });

  test('returns null for a javascript: URL', () => {
    expect(toSafeHyperlinkUrl('javascript:alert(1)')).toBeNull();
  });

  test('returns null for empty input', () => {
    expect(toSafeHyperlinkUrl('')).toBeNull();
  });

  test('returns null for whitespace-only input', () => {
    expect(toSafeHyperlinkUrl('   ')).toBeNull();
  });
});

describe('toSafeHtml', () => {
  test('escapes <, >, &, ", and \' identically to escapeHtml', () => {
    const raw = `<script>alert("x" & 'y')</script>`;
    expect(toSafeHtml(raw)).toBe(escapeHtml(raw));
  });

  test('never returns null', () => {
    expect(toSafeHtml('')).not.toBeNull();
    expect(toSafeHtml('plain text')).not.toBeNull();
  });
});
