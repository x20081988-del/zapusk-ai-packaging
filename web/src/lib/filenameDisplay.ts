// Sprint 61.HOTFIX — display-side mojibake recovery.
//
// The server fix (recoverUtf8Filename in server/src/lib/filenameEncoding.ts)
// applies at upload time, so NEW uploads land clean. But existing
// UploadedFile rows from before the server fix already have mojibake stored
// in originalName. This helper recovers them at display time without DB
// migration.
//
// Heuristic:
//   Mojibake from "Cyrillic UTF-8 mis-decoded as latin1" has a recognizable
//   signature: bytes Ð / Ñ / Ò (0xD0-0xD3 in latin1) in clusters.
//   We re-encode the JS string as latin1 bytes (TextEncoder doesn't expose
//   latin1, so we map chars 0-255 directly), then decode as UTF-8 via
//   TextDecoder. If the result contains actual Cyrillic — we recovered.
//   Otherwise return the input as-is so we never corrupt clean filenames.

const CYRILLIC_RANGE = /[Ѐ-ӿ]/;

export function recoverDisplayFilename(input: string | null | undefined): string {
  if (!input) return input ?? '';
  // Already contains Cyrillic — name is fine.
  if (CYRILLIC_RANGE.test(input)) return input;
  // Mojibake marker chars: Ð (U+00D0), Ñ (U+00D1), Ò (U+00D2), ð (U+00F0).
  if (!/[Ð-Óð]/.test(input)) return input;
  try {
    // Map each char to its lower 8 bits (latin1 byte), then decode UTF-8.
    const bytes = new Uint8Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const c = input.charCodeAt(i);
      if (c > 0xff) return input; // out of latin1 range — not mojibake we can fix
      bytes[i] = c;
    }
    const recovered = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    if (CYRILLIC_RANGE.test(recovered)) return recovered;
  } catch {
    // ignore — fall through to return input
  }
  return input;
}
