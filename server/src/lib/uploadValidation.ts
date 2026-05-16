// Sprint 50 P1.2 — file-upload allowlists.
//
// Two upload surfaces live in this codebase: project files (documents that
// feed the brief / packaging pipeline) and audio for conversation analysis.
// Each gets its own whitelist of MIME + extension pairs. Reject anything
// else early — multer hands the buffer to memory regardless of type, so the
// cost of an unexpected upload is real both in RAM and in subsequent
// processing.
//
// We compare BOTH the declared MIME type and the file extension because:
//   - a renamed binary keeps its real magic bytes but lies about the MIME;
//   - a curl with --header can lie about the MIME while the extension is
//     genuine.
// Requiring agreement between the two makes the spoof harder. We don't
// dive into magic-byte sniffing here — that's a libmagic-class dependency
// for marginal value over this dual-check.

import type { Request } from 'express';

export type UploadKind = 'project_file' | 'audio';

interface AllowEntry {
  // Single MIME or set of accepted MIMEs.
  mimes: ReadonlySet<string>;
  // Lowercased extensions including the dot.
  exts: ReadonlySet<string>;
}

const PROJECT_FILE: AllowEntry = {
  mimes: new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
    'text/plain',
    'text/markdown',
    'text/csv',
    'image/png',
    'image/jpeg',
    'image/jpg',
  ]),
  exts: new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt', '.md', '.csv', '.png', '.jpg', '.jpeg']),
};

const AUDIO: AllowEntry = {
  mimes: new Set([
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/wave',
    'audio/x-wav',
    'audio/webm',
    'audio/ogg',
    'audio/mp4',
    'audio/m4a',
    'audio/x-m4a',
    'audio/flac',
    'video/webm',  // some browsers wrap audio in webm/video container
    'video/mp4',   // some recorders save .mp4 for audio-only too
    'text/plain',  // text-transcript upload (rare, but supported by /conversation-analysis)
  ]),
  exts: new Set(['.mp3', '.wav', '.webm', '.ogg', '.oga', '.m4a', '.mp4', '.flac', '.txt']),
};

const ALLOWLISTS: Record<UploadKind, AllowEntry> = {
  project_file: PROJECT_FILE,
  audio: AUDIO,
};

function lastExt(name: string | undefined): string {
  if (!name) return '';
  const dot = name.lastIndexOf('.');
  if (dot < 0 || dot === name.length - 1) return '';
  return name.slice(dot).toLowerCase();
}

export interface UploadDecision {
  ok: boolean;
  reason?: 'missing_file' | 'mime_not_allowed' | 'extension_not_allowed' | 'mime_extension_mismatch';
  mimeType?: string;
  extension?: string;
}

export function validateUpload(file: Express.Multer.File | undefined, kind: UploadKind): UploadDecision {
  if (!file) return { ok: false, reason: 'missing_file' };
  const list = ALLOWLISTS[kind];
  const mime = (file.mimetype || '').toLowerCase();
  const ext = lastExt(file.originalname);
  const mimeOk = list.mimes.has(mime);
  const extOk = list.exts.has(ext);

  // Both must pass. Returning the most specific reason helps the client
  // tell the user "wrong type" vs "wrong extension".
  if (!mimeOk && !extOk) return { ok: false, reason: 'mime_not_allowed', mimeType: mime, extension: ext };
  if (!mimeOk) return { ok: false, reason: 'mime_not_allowed', mimeType: mime, extension: ext };
  if (!extOk) return { ok: false, reason: 'extension_not_allowed', mimeType: mime, extension: ext };
  return { ok: true, mimeType: mime, extension: ext };
}

// Multer fileFilter signature. Mount this as `fileFilter` on multer config
// to reject upstream of the buffer copy. We translate failures into a
// 400-shaped Error that multer surfaces to the route's catch.
export function multerFileFilter(kind: UploadKind) {
  return (
    _req: Request,
    file: Express.Multer.File,
    cb: (err: Error | null, accept?: boolean) => void,
  ): void => {
    const decision = validateUpload(file, kind);
    if (decision.ok) return cb(null, true);
    const err = new Error(`upload_rejected:${decision.reason}`);
    (err as Error & { code?: string }).code = decision.reason;
    cb(err);
  };
}

// User-friendly Russian reason for the toast. Don't expose `ext` / `mime`
// in the response — the reason code is enough for the client to know what
// to fix.
export function uploadRejectionMessage(reason: string | undefined): string {
  switch (reason) {
    case 'missing_file': return 'Файл не передан.';
    case 'mime_not_allowed': return 'Тип файла не поддерживается. Допустимо: PDF, DOCX, XLSX, TXT, MD, изображения, аудио.';
    case 'extension_not_allowed': return 'Расширение файла не поддерживается.';
    case 'mime_extension_mismatch': return 'Содержимое файла не совпадает с его расширением.';
    default: return 'Файл не принят.';
  }
}
