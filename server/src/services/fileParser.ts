import fs from 'node:fs/promises';
import path from 'node:path';
import { storage } from './storage.js';

// Extract plain-text from uploaded materials so the AI brief has real content
// to work with, not just file names. Each extractor is forgiving — it returns
// whatever it can pull and never throws upward.

export interface ExtractedContent {
  fileId: string;
  originalName: string;
  category: string;
  mimeType: string;
  text: string;       // extracted plain text (may be truncated)
  charCount: number;
  truncated: boolean;
  error?: string;
}

const MAX_PER_FILE = 30_000; // chars — keeps total brief context bounded

export async function extractFromUploadedFile(file: {
  id: string;
  originalName: string;
  mimeType: string;
  path: string;
  category: string;
  url: string | null;
}): Promise<ExtractedContent> {
  const base = { fileId: file.id, originalName: file.originalName, category: file.category, mimeType: file.mimeType };

  if (file.url) {
    return { ...base, text: `[External resource: ${file.url}]`, charCount: 0, truncated: false };
  }
  if (!file.path) {
    return { ...base, text: '', charCount: 0, truncated: false };
  }

  const abs = storage.resolvePath(file.path);
  const ext = path.extname(file.originalName).toLowerCase();

  try {
    let text = '';
    if (ext === '.pdf' || file.mimeType === 'application/pdf') {
      text = await extractPdf(abs);
    } else if (ext === '.docx' || file.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      text = await extractDocx(abs);
    } else if (ext === '.xlsx' || file.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      text = await extractXlsx(abs);
    } else if (ext === '.txt' || ext === '.md' || file.mimeType.startsWith('text/')) {
      text = await fs.readFile(abs, 'utf8');
    } else {
      return { ...base, text: '', charCount: 0, truncated: false, error: 'unsupported_format' };
    }

    const trimmed = text.replace(/\s+/g, ' ').trim();
    const truncated = trimmed.length > MAX_PER_FILE;
    return {
      ...base,
      text: truncated ? trimmed.slice(0, MAX_PER_FILE) + '… [TRUNCATED]' : trimmed,
      charCount: trimmed.length,
      truncated,
    };
  } catch (err) {
    return {
      ...base,
      text: '',
      charCount: 0,
      truncated: false,
      error: err instanceof Error ? err.message : 'extraction_failed',
    };
  }
}

async function extractPdf(abs: string): Promise<string> {
  const buf = await fs.readFile(abs);
  // pdf-parse is CJS and ships test fixtures that crash on import — pass buffer directly to library.
  const { default: pdfParse } = await import('pdf-parse');
  const result = await pdfParse(buf);
  return result.text ?? '';
}

async function extractDocx(abs: string): Promise<string> {
  const mammoth = await import('mammoth');
  const { value } = await mammoth.extractRawText({ path: abs });
  return value ?? '';
}

async function extractXlsx(abs: string): Promise<string> {
  const XLSX = await import('xlsx');
  const wb = XLSX.readFile(abs);
  const lines: string[] = [];
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    lines.push(`\n## Sheet: ${sheetName}\n`);
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    lines.push(csv);
  }
  return lines.join('\n');
}
