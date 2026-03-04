import type { TokenLine } from "../../lib/tokenModels.ts";

export interface TokenLineRow {
  type: "line";
  key: string;
  startLine: number;
  endLine: number;
  line: TokenLine;
}

export interface TokenCollapsedEmptyRow {
  type: "collapsed-empty";
  key: string;
  startLine: number;
  endLine: number;
  emptyCount: number;
}

export type TokenDisplayRow = TokenLineRow | TokenCollapsedEmptyRow;

export function buildTokenDisplayRows(lines: TokenLine[]): TokenDisplayRow[] {
  const rows: TokenDisplayRow[] = [];
  let index = 0;

  while (index < lines.length) {
    const currentLine = lines[index];
    if (!currentLine) {
      index += 1;
      continue;
    }

    if (currentLine.tokens.length > 0) {
      rows.push({
        type: "line",
        key: `line-${currentLine.lineNumber}`,
        startLine: currentLine.lineNumber,
        endLine: currentLine.lineNumber,
        line: currentLine,
      });
      index += 1;
      continue;
    }

    const startIndex = index;
    while (index < lines.length && (lines[index]?.tokens.length ?? 0) === 0) {
      index += 1;
    }

    const emptyCount = index - startIndex;
    const firstLine = lines[startIndex];
    const lastLine = lines[index - 1];
    if (!firstLine || !lastLine) continue;

    if (emptyCount <= 1) {
      rows.push({
        type: "line",
        key: `line-${firstLine.lineNumber}`,
        startLine: firstLine.lineNumber,
        endLine: firstLine.lineNumber,
        line: firstLine,
      });
      continue;
    }

    rows.push({
      type: "collapsed-empty",
      key: `collapsed-${firstLine.lineNumber}-${lastLine.lineNumber}`,
      startLine: firstLine.lineNumber,
      endLine: lastLine.lineNumber,
      emptyCount,
    });
  }

  return rows;
}

export function formatDisplayRowLineLabel(row: TokenDisplayRow): string {
  if (row.startLine === row.endLine) {
    return String(row.startLine);
  }

  return `${row.startLine}-${row.endLine}`;
}
