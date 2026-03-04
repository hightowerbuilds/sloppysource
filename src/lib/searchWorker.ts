import {
  EMPTY_RESULT,
  MAX_MATCH_LINES,
  hasActiveSearchTags,
  type LineMatch,
  type SearchOptions,
  type SearchResult,
} from "./searchModels.ts";
import type {
  SearchWorkerRequest,
  SearchWorkerResponse,
} from "./searchWorkerMessages.ts";

/* ── Web Worker: runs markdown search off the main thread ── */

type LineTag = "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "code" | "p" | null;

const SNIPPET_PADDING = 40;

let indexedDocKey: string | null = null;
let indexedLines: string[] = [];
let indexedLineTags: LineTag[] = [];

/* ── Indexing ── */

function setDocumentIndex(docKey: string, markdown: string) {
  indexedDocKey = docKey;
  indexedLines = markdown.split(/\r?\n/);
  indexedLineTags = classifyLines(indexedLines);
}

function clearDocumentIndex() {
  indexedDocKey = null;
  indexedLines = [];
  indexedLineTags = [];
}

/* ── Line classification ── */

function classifyLines(lines: string[]): LineTag[] {
  const tags: LineTag[] = new Array<LineTag>(lines.length);
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = (lines[i] ?? "").trimStart();

    if (trimmed.startsWith("```")) {
      tags[i] = "code";
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (inCodeBlock) {
      tags[i] = "code";
      continue;
    }

    if (trimmed.startsWith("###### ") || trimmed === "######") {
      tags[i] = "h6";
    } else if (trimmed.startsWith("##### ") || trimmed === "#####") {
      tags[i] = "h5";
    } else if (trimmed.startsWith("#### ") || trimmed === "####") {
      tags[i] = "h4";
    } else if (trimmed.startsWith("### ") || trimmed === "###") {
      tags[i] = "h3";
    } else if (trimmed.startsWith("## ") || trimmed === "##") {
      tags[i] = "h2";
    } else if (trimmed.startsWith("# ") || trimmed === "#") {
      tags[i] = "h1";
    } else if (isParagraphLine(trimmed)) {
      tags[i] = "p";
    } else {
      tags[i] = null;
    }
  }

  return tags;
}

function linePassesTagFilter(tag: LineTag, tags: SearchOptions["tags"]): boolean {
  if (!hasActiveSearchTags(tags)) return true;
  if (tag === "h1") return tags.h1;
  if (tag === "h2") return tags.h2;
  if (tag === "h3") return tags.h3;
  if (tag === "h4") return tags.h4;
  if (tag === "h5") return tags.h5;
  if (tag === "h6") return tags.h6;
  if (tag === "code") return tags.code;
  if (tag === "p") return tags.p;
  return false;
}

function collectTaggedLines(
  lines: string[],
  lineTags: LineTag[],
  tags: SearchOptions["tags"],
): SearchResult {
  const matches: LineMatch[] = [];

  for (let index = 0; index < lines.length; index++) {
    if (!linePassesTagFilter(lineTags[index], tags)) continue;

    if (matches.length >= MAX_MATCH_LINES) {
      return {
        matches,
        totalOccurrences: -1,
        totalMatchedLines: -1,
        isTruncated: true,
        errorMessage: null,
      };
    }

    const line = lines[index] ?? "";
    matches.push({
      lineNumber: index + 1,
      occurrences: 1,
      preview: line.length > 0 ? line : "(empty line)",
    });
  }

  return {
    matches,
    totalOccurrences: matches.length,
    totalMatchedLines: matches.length,
    isTruncated: false,
    errorMessage: null,
  };
}

/* ── Search ── */

function runSearch(
  lines: string[],
  lineTags: LineTag[],
  query: string,
  options: SearchOptions,
): SearchResult {
  if (options.regex) {
    return searchByRegex(lines, lineTags, query, options);
  }
  return searchBySubstring(lines, lineTags, query, options);
}

function searchByRegex(
  lines: string[],
  lineTags: LineTag[],
  query: string,
  options: SearchOptions,
): SearchResult {
  const flags = options.caseSensitive ? "g" : "gi";
  const source = options.wholeWord ? `\\b(?:${query})\\b` : query;
  let regex: RegExp;

  try {
    regex = new RegExp(source, flags);
  } catch {
    return { ...EMPTY_RESULT, errorMessage: "Invalid regular expression." };
  }

  const matches: LineMatch[] = [];

  for (let index = 0; index < lines.length; index++) {
    if (!linePassesTagFilter(lineTags[index], options.tags)) continue;

    const line = lines[index];
    regex.lastIndex = 0;

    let occurrences = 0;
    let firstMatchIndex = -1;
    let firstMatchLength = 0;
    let result = regex.exec(line);

    while (result) {
      occurrences += 1;

      if (firstMatchIndex === -1) {
        firstMatchIndex = result.index;
        firstMatchLength = Math.max(1, result[0]?.length ?? 1);
      }

      if (result[0] === "") {
        regex.lastIndex += 1;
      }

      result = regex.exec(line);
    }

    if (occurrences === 0) continue;

    if (matches.length >= MAX_MATCH_LINES) {
      return {
        matches,
        totalOccurrences: -1,
        totalMatchedLines: -1,
        isTruncated: true,
        errorMessage: null,
      };
    }

    matches.push({
      lineNumber: index + 1,
      occurrences,
      preview: createPreview(line, firstMatchIndex, firstMatchLength),
    });
  }

  const totalOccurrences = matches.reduce((sum, match) => sum + match.occurrences, 0);

  return {
    matches,
    totalOccurrences,
    totalMatchedLines: matches.length,
    isTruncated: false,
    errorMessage: null,
  };
}

function searchBySubstring(
  lines: string[],
  lineTags: LineTag[],
  query: string,
  options: SearchOptions,
): SearchResult {
  const matches: LineMatch[] = [];
  const normalizedQuery = options.caseSensitive ? query : query.toLowerCase();

  for (let index = 0; index < lines.length; index++) {
    if (!linePassesTagFilter(lineTags[index], options.tags)) continue;

    const line = lines[index];
    const searchTarget = options.caseSensitive ? line : line.toLowerCase();
    let occurrences = 0;
    let fromIndex = 0;
    let firstMatchIndex = -1;

    while (fromIndex < searchTarget.length) {
      const foundIndex = searchTarget.indexOf(normalizedQuery, fromIndex);

      if (foundIndex === -1) break;

      const isWholeWordMatch =
        !options.wholeWord || hasWordBoundaries(line, foundIndex, normalizedQuery.length);

      if (isWholeWordMatch) {
        occurrences += 1;
        if (firstMatchIndex === -1) {
          firstMatchIndex = foundIndex;
        }
      }

      fromIndex = foundIndex + Math.max(1, normalizedQuery.length);
    }

    if (occurrences === 0) continue;

    if (matches.length >= MAX_MATCH_LINES) {
      return {
        matches,
        totalOccurrences: -1,
        totalMatchedLines: -1,
        isTruncated: true,
        errorMessage: null,
      };
    }

    matches.push({
      lineNumber: index + 1,
      occurrences,
      preview: createPreview(line, firstMatchIndex, query.length),
    });
  }

  const totalOccurrences = matches.reduce((sum, match) => sum + match.occurrences, 0);

  return {
    matches,
    totalOccurrences,
    totalMatchedLines: matches.length,
    isTruncated: false,
    errorMessage: null,
  };
}

/* ── Helpers ── */

function createPreview(line: string, index: number, matchLength: number): string {
  if (!line) return "(empty line)";

  const safeIndex = Math.max(0, index);
  const safeLength = Math.max(1, matchLength);
  const sliceStart = Math.max(0, safeIndex - SNIPPET_PADDING);
  const sliceEnd = Math.min(line.length, safeIndex + safeLength + SNIPPET_PADDING);

  const prefix = sliceStart > 0 ? "..." : "";
  const suffix = sliceEnd < line.length ? "..." : "";

  return `${prefix}${line.slice(sliceStart, sliceEnd)}${suffix}`;
}

function hasWordBoundaries(line: string, index: number, matchLength: number): boolean {
  const charBefore = line[index - 1] ?? "";
  const charAfter = line[index + matchLength] ?? "";
  return !isWordCharacter(charBefore) && !isWordCharacter(charAfter);
}

function isWordCharacter(char: string): boolean {
  if (!char) return false;
  return /[\p{L}\p{N}_]/u.test(char);
}

function isParagraphLine(trimmedLine: string): boolean {
  if (!trimmedLine) return false;
  if (/^(?:[-+*]|\d+\.)\s+/.test(trimmedLine)) return false;
  if (/^>/.test(trimmedLine)) return false;
  if (/^\|/.test(trimmedLine)) return false;
  if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmedLine)) return false;
  return true;
}

/* ── Worker message handler ── */

self.onmessage = (event: MessageEvent<SearchWorkerRequest>) => {
  const message = event.data;

  if (message.type === "set-document") {
    setDocumentIndex(message.docKey, message.markdown);
    return;
  }

  if (message.type === "clear-document") {
    clearDocumentIndex();
    return;
  }

  if (message.type !== "run-search") {
    return;
  }

  const { id, query, options } = message;
  const trimmed = query.trim();

  if (!indexedDocKey) {
    const response: SearchWorkerResponse = {
      type: "search-result",
      id,
      result: EMPTY_RESULT,
    };
    self.postMessage(response);
    return;
  }

  if (!trimmed && !hasActiveSearchTags(options.tags)) {
    const response: SearchWorkerResponse = {
      type: "search-result",
      id,
      result: EMPTY_RESULT,
    };
    self.postMessage(response);
    return;
  }

  const result = !trimmed
    ? collectTaggedLines(indexedLines, indexedLineTags, options.tags)
    : runSearch(indexedLines, indexedLineTags, trimmed, options);

  const response: SearchWorkerResponse = {
    type: "search-result",
    id,
    result,
  };

  self.postMessage(response);
};
