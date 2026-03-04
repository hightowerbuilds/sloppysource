export interface SearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
  tags: {
    h1: boolean;
    h2: boolean;
    h3: boolean;
    h4: boolean;
    h5: boolean;
    h6: boolean;
    code: boolean;
    p: boolean;
  };
}

export type SearchTag = keyof SearchOptions["tags"];

export interface LineMatch {
  lineNumber: number;
  occurrences: number;
  preview: string;
}

export interface SearchResult {
  matches: LineMatch[];
  totalOccurrences: number;
  totalMatchedLines: number;
  isTruncated: boolean;
  errorMessage: string | null;
}

export const MAX_MATCH_LINES = 500;

export const EMPTY_RESULT: SearchResult = {
  matches: [],
  totalOccurrences: 0,
  totalMatchedLines: 0,
  isTruncated: false,
  errorMessage: null,
};

export function createDefaultSearchOptions(): SearchOptions {
  return {
    caseSensitive: false,
    wholeWord: false,
    regex: false,
    tags: {
      h1: false,
      h2: false,
      h3: false,
      h4: false,
      h5: false,
      h6: false,
      code: false,
      p: false,
    },
  };
}

export function hasActiveSearchTags(tags: SearchOptions["tags"]): boolean {
  return (
    tags.h1 ||
    tags.h2 ||
    tags.h3 ||
    tags.h4 ||
    tags.h5 ||
    tags.h6 ||
    tags.code ||
    tags.p
  );
}
