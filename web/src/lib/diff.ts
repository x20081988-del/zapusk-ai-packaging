// Sprint 33 — простой line-by-line diff для compare view материалов.
// Минимальная реализация LCS (Longest Common Subsequence) без npm dependencies.
// Достаточно для markdown / plain text артефактов; не пытаемся словесный/символьный
// diff — это работа Sprint 34, если понадобится.

export type DiffOp = 'equal' | 'add' | 'remove';

export interface DiffLine {
  op: DiffOp;
  /** Текст строки. Для op='equal' одинаковый в обеих версиях. */
  text: string;
  /** Индекс строки в старой версии (если op != 'add'). */
  oldIndex?: number;
  /** Индекс строки в новой версии (если op != 'remove'). */
  newIndex?: number;
}

/** LCS таблица: lcs[i][j] = длина LCS первых i строк старого и j строк нового. */
function buildLCS(oldLines: string[], newLines: string[]): number[][] {
  const m = oldLines.length;
  const n = newLines.length;
  const lcs: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        lcs[i][j] = lcs[i - 1][j - 1] + 1;
      } else {
        lcs[i][j] = Math.max(lcs[i - 1][j], lcs[i][j - 1]);
      }
    }
  }
  return lcs;
}

/**
 * Сравнивает старую и новую версию текста построчно и возвращает массив
 * операций. Identical строки = 'equal'; уникальные для old = 'remove';
 * уникальные для new = 'add'. Изменённая строка рендерится как remove+add пара.
 */
export function diffLines(oldText: string, newText: string): DiffLine[] {
  // Нормализация: SQLite + OpenAI могут возвращать \r\n / \r — приводим к \n.
  const oldLines = (oldText ?? '').replace(/\r\n?/g, '\n').split('\n');
  const newLines = (newText ?? '').replace(/\r\n?/g, '\n').split('\n');
  const lcs = buildLCS(oldLines, newLines);

  // Backtrack по таблице LCS, собирая операции с конца.
  const result: DiffLine[] = [];
  let i = oldLines.length;
  let j = newLines.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({ op: 'equal', text: oldLines[i - 1], oldIndex: i - 1, newIndex: j - 1 });
      i--; j--;
    } else if (j > 0 && (i === 0 || lcs[i][j - 1] >= lcs[i - 1][j])) {
      result.unshift({ op: 'add', text: newLines[j - 1], newIndex: j - 1 });
      j--;
    } else if (i > 0) {
      result.unshift({ op: 'remove', text: oldLines[i - 1], oldIndex: i - 1 });
      i--;
    }
  }
  return result;
}

/** Аггрегированная статистика для отображения в шапке compare view. */
export interface DiffStats {
  added: number;
  removed: number;
  unchanged: number;
}

export function diffStats(diff: DiffLine[]): DiffStats {
  let added = 0, removed = 0, unchanged = 0;
  for (const d of diff) {
    if (d.op === 'add') added++;
    else if (d.op === 'remove') removed++;
    else unchanged++;
  }
  return { added, removed, unchanged };
}
