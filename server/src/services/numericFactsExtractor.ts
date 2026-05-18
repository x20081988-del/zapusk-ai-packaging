// Sprint 62 P5 — Numeric facts extractor (V1).
//
// Pure function. Takes parsed XLSX sections (sheetName + csv) and yields
// structured (metric, period, value) tuples with confidence + provenance.
//
// V1 scope:
//   • Wide tables: row label in column 0, period columns in 1..N (typical
//     P&L / cash flow layout). Detected by header containing year tokens.
//   • Vertical key=value tables: «CAC, 180000» / «Параметр value».
//   • No PDF extraction yet.
//   • No deep NLP — pure regex + numeric coercion. Confidence reflects
//     how literal the match is.
//
// Persistence is done by the caller (ingestKnowledgeSource → P5 hook),
// this module only does in-memory extraction.

import type { SheetSection } from './xlsxStructured.js';

export interface ExtractedFact {
  metric: string;       // canonical label (preserves original Russian/English wording)
  metricSlug: string;   // normalized lower-snake-case for query lookup
  period: string | null;
  value: number;
  unit: string | null;
  rowLabel: string;
  columnHeader: string;
  confidence: number;   // 0..100
  sheetName: string;
  sheetIndex: number;
}

// Known canonical metrics → slug. Used both for confidence boost AND for
// query lookup at runtime (buildProjectFinancialFacts).
const METRIC_DICTIONARY: Array<{ rx: RegExp; slug: string; canonical: string }> = [
  // Russian
  { rx: /^выручк/i,                slug: 'revenue',           canonical: 'Выручка' },
  { rx: /^чист(?:ая|ый)?\s+прибыл/i, slug: 'net_profit',      canonical: 'Чистая прибыль' },
  { rx: /^прибыл/i,                slug: 'profit',            canonical: 'Прибыль' },
  { rx: /^убыток/i,                slug: 'loss',              canonical: 'Убыток' },
  { rx: /^ebitda\s+margin/i,       slug: 'ebitda_margin',     canonical: 'EBITDA margin' },
  { rx: /^ebitda/i,                slug: 'ebitda',            canonical: 'EBITDA' },
  { rx: /^маржа/i,                 slug: 'margin',            canonical: 'Маржа' },
  { rx: /^маржинальност/i,         slug: 'margin',            canonical: 'Маржинальность' },
  { rx: /^cac/i,                   slug: 'cac',               canonical: 'CAC' },
  { rx: /^ltv/i,                   slug: 'ltv',               canonical: 'LTV' },
  { rx: /^arpu/i,                  slug: 'arpu',              canonical: 'ARPU' },
  { rx: /^mrr/i,                   slug: 'mrr',               canonical: 'MRR' },
  { rx: /^arr/i,                   slug: 'arr',               canonical: 'ARR' },
  { rx: /^gmv/i,                   slug: 'gmv',               canonical: 'GMV' },
  { rx: /^cash[\s_-]?flow/i,       slug: 'cash_flow',         canonical: 'Cash Flow' },
  { rx: /^денежн(?:ый|ая)\s+поток/i, slug: 'cash_flow',       canonical: 'Денежный поток' },
  { rx: /^operating\s+cf/i,        slug: 'operating_cf',      canonical: 'Operating CF' },
  { rx: /^investing\s+cf/i,        slug: 'investing_cf',      canonical: 'Investing CF' },
  { rx: /^financing\s+cf/i,        slug: 'financing_cf',      canonical: 'Financing CF' },
  { rx: /^net\s+change/i,          slug: 'net_change',        canonical: 'Net change' },
  { rx: /^расход/i,                slug: 'costs',             canonical: 'Расходы' },
  { rx: /^затрат/i,                slug: 'costs',             canonical: 'Затраты' },
  { rx: /^себестоимост/i,          slug: 'cogs',              canonical: 'Себестоимость' },
  { rx: /^капекс|^capex/i,         slug: 'capex',             canonical: 'CAPEX' },
  { rx: /^опекс|^opex/i,           slug: 'opex',              canonical: 'OPEX' },
  { rx: /^окупаемост|^payback/i,   slug: 'payback',           canonical: 'Окупаемость' },
  { rx: /^оценка|^valuation|^pre-?money|^post-?money/i, slug: 'valuation', canonical: 'Оценка' },
  { rx: /^доля\s+инвестор/i,       slug: 'investor_equity',   canonical: 'Доля инвестора' },
  { rx: /^доходност|^irr|^roi/i,   slug: 'return_rate',       canonical: 'Доходность' },
  { rx: /^vacancy|^вакансия|^вакантност/i, slug: 'vacancy',   canonical: 'Vacancy' },
  { rx: /^арендатор/i,             slug: 'tenants',           canonical: 'Арендаторы' },
  { rx: /^ставк/i,                 slug: 'rate',              canonical: 'Ставка' },
  { rx: /^контракт/i,              slug: 'contract',          canonical: 'Контракт' },
  { rx: /^площад/i,                slug: 'area',              canonical: 'Площадь' },
];

const YEAR_RX = /^(20\d{2})$/;
const QUARTER_RX = /^(Q[1-4]\s*\d{4}|q[1-4]\s*\d{4}|[1-4]q\s*\d{4})$/i;
const PERIOD_HEADER_RX = /^(год|year|период|period|месяц|month|кв\.|quarter)$/i;

// Try to parse a value cell into number. Strips Russian-style spaces and
// percent/RUB suffixes. Returns null if not a clean number.
function parseValueCell(raw: string): { value: number; unit: string | null } | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Detect unit suffix.
  let unit: string | null = null;
  let cleaned = trimmed;
  if (/%$/.test(cleaned) || /процент/i.test(cleaned)) { unit = '%'; cleaned = cleaned.replace(/%/, '').replace(/процент\w*/i, '').trim(); }
  if (/RUB|руб|\bр\b/i.test(cleaned)) { unit = unit ?? 'RUB'; cleaned = cleaned.replace(/RUB|руб\w*|\bр\b/gi, '').trim(); }
  if (/USD|\$/i.test(cleaned)) { unit = unit ?? 'USD'; cleaned = cleaned.replace(/USD|\$/gi, '').trim(); }
  if (/EUR|€/i.test(cleaned)) { unit = unit ?? 'EUR'; cleaned = cleaned.replace(/EUR|€/gi, '').trim(); }
  if (/(?:м2|кв\.?\s?м|м²)/i.test(cleaned)) { unit = unit ?? 'м2'; cleaned = cleaned.replace(/м2|кв\.?\s?м|м²/gi, '').trim(); }
  if (/(?:лет|года?|месяцев|мес)/i.test(cleaned)) {
    // «4.5 года» → keep numeric but unit = «лет»
    unit = unit ?? 'лет';
    cleaned = cleaned.replace(/лет|года?|месяцев|мес/gi, '').trim();
  }
  // Strip thousands separators (space / NBSP / comma).
  cleaned = cleaned.replace(/[\s  ]/g, '').replace(/,(\d{3})/g, '$1');
  // Allow Russian decimal comma «38,2».
  cleaned = cleaned.replace(/,(\d+)$/, '.$1');
  // Allow negative sign / parens for negative.
  if (/^\(.*\)$/.test(cleaned)) cleaned = `-${cleaned.slice(1, -1)}`;
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return null;
  return { value: num, unit };
}

// Detect known metric by row label.
function lookupMetric(rowLabel: string): { slug: string; canonical: string; confidenceBoost: number } | null {
  const stripped = rowLabel.trim().replace(/[*:.()«»"']/g, '').trim();
  for (const entry of METRIC_DICTIONARY) {
    if (entry.rx.test(stripped)) {
      return { slug: entry.slug, canonical: entry.canonical, confidenceBoost: 40 };
    }
  }
  return null;
}

function slugifyFallback(rowLabel: string): string {
  return rowLabel.trim().toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64) || 'unknown_metric';
}

function splitCsvRow(row: string): string[] {
  // Minimal CSV splitter — XLSX.utils.sheet_to_csv does not produce quoted
  // commas in our usage (numeric + plain text). For now, split by comma.
  // Future: switch to PapaParse if we hit edge cases.
  return row.split(',').map((c) => c.trim());
}

// Extract facts from one XLSX section.
export function extractFactsFromSection(section: SheetSection): ExtractedFact[] {
  const lines = section.dataCsv.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const headers = splitCsvRow(lines[0]);
  const facts: ExtractedFact[] = [];

  // Detect period columns: indexes with year/quarter headers.
  const periodCols: Array<{ idx: number; period: string }> = [];
  // Detect label column: header is NOT a year/quarter AND NOT a value-only
  // word (e.g. "value"). In xlsx `json_to_sheet` the column order depends on
  // object key order, NOT on first-key-first — so the label can be at any
  // index. We pick the first non-period header.
  let labelColIdx: number | null = null;
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].trim();
    if (!h) continue;
    if (YEAR_RX.test(h) || QUARTER_RX.test(h)) {
      periodCols.push({ idx: i, period: h });
    } else if (labelColIdx === null) {
      labelColIdx = i;
    }
  }
  const hasWideLayout = periodCols.length >= 1 && labelColIdx !== null;

  // Detect vertical key-value table: 2 columns where one is label and the
  // other is value (header «value» or similar). Order independent.
  let kvLabelIdx: number | null = null;
  let kvValueIdx: number | null = null;
  if (!hasWideLayout && headers.length === 2) {
    const h0 = headers[0].trim().toLowerCase();
    const h1 = headers[1].trim().toLowerCase();
    if (h0 === 'value' || h0 === 'значение' || h0 === 'число') { kvValueIdx = 0; kvLabelIdx = 1; }
    else { kvLabelIdx = 0; kvValueIdx = 1; }
  }
  const isVerticalKV = kvLabelIdx !== null && kvValueIdx !== null;

  for (let r = 1; r < lines.length; r++) {
    const cells = splitCsvRow(lines[r]);
    if (hasWideLayout && labelColIdx !== null) {
      const rowLabel = cells[labelColIdx]?.trim();
      if (!rowLabel) continue;
      const lookup = lookupMetric(rowLabel);
      for (const { idx, period } of periodCols) {
        const cell = cells[idx];
        if (cell === undefined) continue;
        const parsed = parseValueCell(cell);
        if (!parsed) continue;
        const metric = lookup?.canonical ?? rowLabel.trim();
        const metricSlug = lookup?.slug ?? slugifyFallback(rowLabel);
        const confidence = Math.min(100, 40 + (lookup?.confidenceBoost ?? 0) + 20);
        facts.push({
          metric, metricSlug, period, value: parsed.value, unit: parsed.unit,
          rowLabel, columnHeader: period, confidence,
          sheetName: section.sheetName, sheetIndex: section.sheetIndex,
        });
      }
    } else if (isVerticalKV && kvLabelIdx !== null && kvValueIdx !== null) {
      const rowLabel = cells[kvLabelIdx]?.trim();
      if (!rowLabel) continue;
      const cell = cells[kvValueIdx];
      if (cell === undefined) continue;
      const parsed = parseValueCell(cell);
      if (!parsed) continue;
      const yearMatch = rowLabel.match(/(20\d{2})/);
      const period = yearMatch ? yearMatch[1] : null;
      const labelWithoutYear = period ? rowLabel.replace(period, '').trim().replace(/[\s,]+$/, '') : rowLabel;
      const lookupClean = lookupMetric(labelWithoutYear);
      const metric = lookupClean?.canonical ?? labelWithoutYear.trim();
      const metricSlug = lookupClean?.slug ?? slugifyFallback(labelWithoutYear);
      const confidence = Math.min(100, 30 + (lookupClean?.confidenceBoost ?? 0) + 20);
      facts.push({
        metric, metricSlug, period, value: parsed.value, unit: parsed.unit,
        rowLabel, columnHeader: headers[kvValueIdx] ?? 'value', confidence,
        sheetName: section.sheetName, sheetIndex: section.sheetIndex,
      });
    }
  }
  return facts;
}

export function extractFactsFromSheets(sections: SheetSection[]): ExtractedFact[] {
  const out: ExtractedFact[] = [];
  for (const s of sections) {
    for (const f of extractFactsFromSection(s)) out.push(f);
  }
  return out;
}
