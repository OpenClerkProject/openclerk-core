import fc from 'fast-check';
import { toBase64 } from '../src/providers/base';

// Property-based coverage for the hand-rolled, dependency-free base64 encoder that builds the HTTP
// Basic Authorization header for LexisNexis-style OAuth2 token endpoints. The encoder exists only
// because this library must run in hosts without Buffer/btoa (e.g. Google Apps Script); property-
// testing it against Node's reference encoder for arbitrary inputs is what makes rolling our own
// trustworthy -- and specifically guards the 1/2/3/4-byte UTF-8 boundaries a hand-rolled encoder is
// most likely to get wrong. Node's Buffer is available in the Jest (node) test environment and is
// the oracle here; it is never referenced by the library itself.

// Valid Unicode strings only: code points across the full range but excluding the surrogate block
// (0xD800-0xDFFF), so String.fromCodePoint always yields a well-formed string and Node's UTF-8
// encoder does not substitute U+FFFD -- which keeps the encoder and the oracle comparable.
const unicodeString = fc
  .array(fc.integer({ min: 0, max: 0x10ffff }).filter((cp) => cp < 0xd800 || cp > 0xdfff), { maxLength: 64 })
  .map((codePoints) => String.fromCodePoint(...codePoints));

describe('toBase64 (property-based)', () => {
  test('matches Node Buffer base64 for arbitrary well-formed Unicode strings', () => {
    fc.assert(
      fc.property(unicodeString, (s) => {
        expect(toBase64(s)).toBe(Buffer.from(s, 'utf8').toString('base64'));
      }),
      { numRuns: 1000 }
    );
  });

  test('matches Node Buffer base64 for arbitrary client_id:client_secret pairs (the real use)', () => {
    fc.assert(
      fc.property(unicodeString, unicodeString, (id, secret) => {
        const joined = `${id}:${secret}`;
        expect(toBase64(joined)).toBe(Buffer.from(joined, 'utf8').toString('base64'));
      })
    );
  });
});
