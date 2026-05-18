// Sprint 62 P4 — Sheet-aware XLSX extraction.
//
// Until Sprint 62, extractXlsx flattened every sheet into a single CSV blob.
// Problems:
//   • Sheet boundaries were ASCII markers «## Sheet: <name>» but chunkText
//     could split MID-SHEET, losing the «P&L 2027» context for the second
//     half of the table.
//   • Header rows (col labels) only appeared at top — chunks deep in a
//     long sheet had no clue what «92» referred to.
//   • Retrieval scored against flat token soup; «прибыль 2027» matched but
//     downstream founder couldn't tell which sheet the chunk came from.
//
// This module returns STRUCTURED sections:
//   { sheetName, headerRow, dataCsv, charCount }
//
// Downstream ingestion (ingestKnowledgeSource) uses these to:
//   • Chunk per-sheet boundary first (large sheets split into row batches
//     with header repeated at each chunk start).
//   • Tag each chunk with `sectionLabel='Sheet: P&L 2027'`.
//   • Tag each chunk with `headerContext='Период, Выручка, Прибыль'`.
//
// Pure function, no side effects. Tested directly via project-knowledge-smoke.

export interface SheetSection {
  /** Sheet name as it appears in the workbook. */
  sheetName: string;
  /** Optional comma-joined header row (first non-empty row of the sheet). */
  headerRow: string | null;
  /** All data rows including header, joined by newlines, comma-separated. */
  dataCsv: string;
  /** Length of dataCsv in chars. Convenience for chunk planning. */
  charCount: number;
  /** Sheet index in the workbook (0-based). */
  sheetIndex: number;
}

export interface XlsxStructuredResult {
  sections: SheetSection[];
  /** Total chars across all sections — used by «text too short» guard. */
  totalChars: number;
  /** Sheet names in original order. */
  sheetNames: string[];
}

interface XlsxLikeModule {
  read(input: ArrayBuffer | Uint8Array | Buffer, opts: { type: string }): {
    SheetNames: string[];
    Sheets: Record<string, unknown>;
  };
  utils: {
    sheet_to_csv(sheet: unknown, opts?: { blankrows?: boolean }): string;
  };
}

export async function extractXlsxStructured(buffer: Buffer): Promise<XlsxStructuredResult> {
  const XLSXmod = await import('xlsx');
  const XLSX = XLSXmod as unknown as XlsxLikeModule;
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sections: SheetSection[] = [];
  let totalChars = 0;

  for (let idx = 0; idx < wb.SheetNames.length; idx++) {
    const sheetName = wb.SheetNames[idx];
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false }).trim();
    if (!csv) continue;
    // Header row = first non-empty CSV line.
    const firstNewlineIdx = csv.indexOf('\n');
    const headerRow = firstNewlineIdx === -1 ? csv : csv.slice(0, firstNewlineIdx).trim() || null;
    sections.push({
      sheetName,
      headerRow,
      dataCsv: csv,
      charCount: csv.length,
      sheetIndex: idx,
    });
    totalChars += csv.length;
  }

  return {
    sections,
    totalChars,
    sheetNames: wb.SheetNames.slice(),
  };
}

// Plan how to split a XlsxStructuredResult into individual chunks. Each
// section becomes one or more chunks; large sections split into row batches
// with header repeated. Targets ~800-1200 chars per chunk (matches the
// global chunkText constants in knowledgeService).
export interface PlannedChunk {
  /** Final text inserted into KnowledgeChunk.text. Includes sheet header. */
  text: string;
  /** Goes into KnowledgeChunk.sectionLabel. */
  sectionLabel: string;
  /** Goes into KnowledgeChunk.headerContext. */
  headerContext: string | null;
  /** Index of source sheet (for debugging). */
  sheetIndex: number;
}

const CHUNK_TARGET_MIN = 800;
const CHUNK_TARGET_MAX = 1200;

export function planChunksForXlsx(result: XlsxStructuredResult): PlannedChunk[] {
  const plan: PlannedChunk[] = [];
  for (const section of result.sections) {
    const sectionLabel = `Sheet: ${section.sheetName}`;
    const header = section.headerRow ?? null;
    // Tiny sheet: one chunk.
    if (section.charCount <= CHUNK_TARGET_MAX) {
      plan.push({
        text: composeChunkText(sectionLabel, header, section.dataCsv),
        sectionLabel,
        headerContext: header,
        sheetIndex: section.sheetIndex,
      });
      continue;
    }
    // Large sheet: split by rows so we never break a row in half. Header
    // row is repeated at the start of every chunk.
    const lines = section.dataCsv.split('\n').filter((l) => l.length > 0);
    const headerLine = lines.length > 0 ? lines[0] : '';
    const dataLines = lines.length > 1 ? lines.slice(1) : [];
    let acc: string[] = [];
    let accChars = headerLine.length;
    for (const row of dataLines) {
      const next = row.length + 1; // +1 newline
      if (accChars + next > CHUNK_TARGET_MAX && acc.length > 0) {
        plan.push({
          text: composeChunkText(sectionLabel, header, [headerLine, ...acc].join('\n')),
          sectionLabel,
          headerContext: header,
          sheetIndex: section.sheetIndex,
        });
        acc = [];
        accChars = headerLine.length;
      }
      acc.push(row);
      accChars += next;
    }
    if (acc.length > 0) {
      const finalText = composeChunkText(sectionLabel, header, [headerLine, ...acc].join('\n'));
      // If the leftover is tiny AND there was at least one previous chunk
      // for this section, merge it back into the last one. Avoids 80-char
      // tail chunks below MIN_CHUNK_LEN that retrieval drops.
      if (finalText.length < CHUNK_TARGET_MIN && plan.length > 0 && plan[plan.length - 1].sheetIndex === section.sheetIndex) {
        const prev = plan.pop()!;
        plan.push({
          text: `${prev.text}\n${acc.join('\n')}`,
          sectionLabel: prev.sectionLabel,
          headerContext: prev.headerContext,
          sheetIndex: prev.sheetIndex,
        });
      } else {
        plan.push({
          text: finalText,
          sectionLabel,
          headerContext: header,
          sheetIndex: section.sheetIndex,
        });
      }
    }
  }
  return plan;
}

function composeChunkText(sectionLabel: string, header: string | null, body: string): string {
  const parts: string[] = [`## ${sectionLabel}`];
  if (header && !body.startsWith(header)) parts.push(`Headers: ${header}`);
  parts.push(body);
  return parts.join('\n');
}

// Combine all sections into a single flat-text representation. Used to feed
// `ingestKnowledgeSource.rawText` for the contentHash dedup check — we
// hash the structured output, not the original buffer, so re-uploads of
// the same XLSX collapse via existing dedup.
export function flattenXlsxStructured(result: XlsxStructuredResult): string {
  const parts: string[] = [];
  for (const section of result.sections) {
    parts.push(`## Sheet: ${section.sheetName}`);
    if (section.headerRow) parts.push(`Headers: ${section.headerRow}`);
    parts.push(section.dataCsv);
    parts.push('');
  }
  return parts.join('\n').trim();
}
