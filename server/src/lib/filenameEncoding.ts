// Sprint 61.HOTFIX — UTF-8 filename recovery utility.
//
// Root cause:
//   multer 1.4.x decodes multipart field values as latin1 (binary) by default.
//   When the browser sends a Cyrillic filename like "Презентация.pdf" in
//   multipart Content-Disposition, multer hands us:
//     f.originalname = "Ð¿Ñ€ÐµÐ·ÐµÐ½Ñ‚Ð°Ñ†Ð¸Ñ.pdf"
//   — UTF-8 bytes decoded as latin1, classic mojibake.
//
// Fix at intake:
//   Convert latin1 → UTF-8 at upload time. Storage gets clean string.
//   recoverUtf8Filename(name) returns the recovered string, or the input
//   unchanged if it's already valid UTF-8 (e.g. ASCII filename, or browser
//   that DOES send UTF-8 fields correctly).
//
// Detection heuristic:
//   We look for the classic Cyrillic-UTF-8-as-latin1 signature: bytes 0xD0-0xD3
//   (Ð / Ñ / Ò / Ó in latin1) which in UTF-8 are the lead bytes for the
//   Cyrillic block (U+0400..U+04FF). If we see them and successfully roundtrip
//   the string through latin1→utf8 and the result contains Cyrillic, we
//   recovered. Otherwise return as-is.
//
// Tests:
//   See scripts/project-knowledge-smoke.ts section 10.

const CYRILLIC_RANGE = /[Ѐ-ӿ]/;

export function recoverUtf8Filename(input: string): string {
  if (!input) return input;
  // Already contains Cyrillic chars → name is already valid UTF-8.
  if (CYRILLIC_RANGE.test(input)) return input;
  // Heuristic: only attempt recovery if the input contains bytes that
  // typically appear in mis-decoded Cyrillic (Ð, Ñ, ð, ñ).
  if (!/[À-ÿ]/.test(input)) return input;
  try {
    // Re-encode as latin1 bytes, decode as utf-8.
    const buf = Buffer.from(input, 'latin1');
    const recovered = buf.toString('utf8');
    // Validate: recovery only succeeds if the result contains actual Cyrillic
    // (otherwise we just shuffled garbage around).
    if (CYRILLIC_RANGE.test(recovered)) return recovered;
  } catch {
    // ignore
  }
  return input;
}

// True if the input looks like Cyrillic UTF-8 decoded as latin1 — used by
// tests / display-layer to decide whether to apply recovery.
export function looksLikeMojibake(input: string): boolean {
  if (!input) return false;
  if (CYRILLIC_RANGE.test(input)) return false;
  return /Ð[-¿]|Ñ[-¿]/.test(input);
}
