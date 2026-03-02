import { useEffect, useMemo, useRef, useState, useCallback } from "react";

interface DocumentSearchModalProps {
  isOpen: boolean;
  documentName: string;
  markdown: string;
  onClose: () => void;
}

interface SearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
}

interface LineMatch {
  lineNumber: number;
  occurrences: number;
  preview: string;
}

interface SearchResult {
  matches: LineMatch[];
  totalOccurrences: number;
  totalMatchedLines: number;
  isTruncated: boolean;
  errorMessage: string | null;
}

const MAX_MATCH_LINES = 500;
const MATCHES_PER_PAGE = 100;
const SNIPPET_PADDING = 40;

export function DocumentSearchModal({
  isOpen,
  documentName,
  markdown,
  onClose,
}: DocumentSearchModalProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [options, setOptions] = useState<SearchOptions>({
    caseSensitive: false,
    wholeWord: false,
    regex: false,
  });

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateDebouncedQuery = useCallback((value: string) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(value);
    }, 250);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const lines = useMemo(() => markdown.split(/\r?\n/), [markdown]);

  const searchResult = useMemo(
    () => searchMarkdownLines(lines, debouncedQuery.trim(), options),
    [lines, debouncedQuery, options],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="search-modal-backdrop"
      onClick={() => onClose()}
      role="presentation"
    >
      <section
        className="search-modal"
        aria-modal="true"
        aria-labelledby="search-modal-title"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="search-modal-header">
          <div>
            <p className="section-title" id="search-modal-title">
              Search Document
            </p>
            <p className="hint">{documentName}</p>
          </div>
          <button className="search-modal-close" type="button" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="search-controls">
          <label className="search-input-label" htmlFor="doc-search-query">
            Search String
          </label>
          <input
            ref={inputRef}
            id="doc-search-query"
            className="search-input"
            type="text"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCurrentPage(1);
              updateDebouncedQuery(event.target.value);
            }}
            placeholder="Search text or regex"
          />
          <div className="search-options">
            <label className="search-option">
              <input
                type="checkbox"
                checked={options.caseSensitive}
                onChange={(event) =>
                  setOptions((current) => ({
                    ...current,
                    caseSensitive: event.target.checked,
                  }))
                }
              />
              Case sensitive
            </label>
            <label className="search-option">
              <input
                type="checkbox"
                checked={options.wholeWord}
                onChange={(event) =>
                  setOptions((current) => ({
                    ...current,
                    wholeWord: event.target.checked,
                  }))
                }
              />
              Whole word
            </label>
            <label className="search-option">
              <input
                type="checkbox"
                checked={options.regex}
                onChange={(event) =>
                  setOptions((current) => ({
                    ...current,
                    regex: event.target.checked,
                  }))
                }
              />
              Regex
            </label>
          </div>
        </div>

        <div className="search-summary" role="status" aria-live="polite">
          {query.trim() ? (
            <>
              <span>
                {searchResult.isTruncated ? (
                  <>{MAX_MATCH_LINES.toLocaleString()}+ matches (showing first {MAX_MATCH_LINES.toLocaleString()} lines)</>
                ) : (
                  <>{searchResult.totalOccurrences.toLocaleString()} match
                  {searchResult.totalOccurrences === 1 ? "" : "es"} across{" "}
                  {searchResult.totalMatchedLines.toLocaleString()} line
                  {searchResult.totalMatchedLines === 1 ? "" : "s"}</>
                )}
              </span>
            </>
          ) : (
            <span className="hint">
              Enter a search string to list all matching line numbers.
            </span>
          )}
        </div>

        {searchResult.errorMessage ? (
          <p className="status error" role="status">
            {searchResult.errorMessage}
          </p>
        ) : null}

        <div className="search-results">
          {!query.trim() ? (
            <p className="empty">No query yet.</p>
          ) : searchResult.errorMessage ? (
            <p className="empty">Fix the search pattern to view matches.</p>
          ) : searchResult.matches.length === 0 ? (
            <p className="empty">No matching lines found.</p>
          ) : (
            <>
              <ul className="search-result-list">
                {searchResult.matches
                  .slice((currentPage - 1) * MATCHES_PER_PAGE, currentPage * MATCHES_PER_PAGE)
                  .map((match) => (
                  <li
                    className="search-result-item"
                    key={`${match.lineNumber}-${match.preview}`}
                  >
                    <p className="search-result-meta">
                      Line {match.lineNumber} · {match.occurrences} match
                      {match.occurrences === 1 ? "" : "es"}
                    </p>
                    <pre className="search-result-preview">{match.preview}</pre>
                  </li>
                ))}
              </ul>
              {searchResult.matches.length > MATCHES_PER_PAGE ? (
                <nav className="search-pagination" aria-label="Search result pages">
                  {Array.from(
                    { length: Math.ceil(searchResult.matches.length / MATCHES_PER_PAGE) },
                    (_, i) => i + 1,
                  ).map((page) => (
                    <button
                      key={page}
                      className={`search-page-button${page === currentPage ? " is-active" : ""}`}
                      type="button"
                      onClick={() => setCurrentPage(page)}
                    >
                      {page}
                    </button>
                  ))}
                </nav>
              ) : null}
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function searchMarkdownLines(
  lines: string[],
  query: string,
  options: SearchOptions,
): SearchResult {
  if (!query) {
    return {
      matches: [],
      totalOccurrences: 0,
      totalMatchedLines: 0,
      isTruncated: false,
      errorMessage: null,
    };
  }

  if (options.regex) {
    return searchByRegex(lines, query, options);
  }

  return searchBySubstring(lines, query, options);
}

function searchByRegex(
  lines: string[],
  query: string,
  options: SearchOptions,
): SearchResult {
  const flags = options.caseSensitive ? "g" : "gi";
  const source = options.wholeWord ? `\\b(?:${query})\\b` : query;
  let regex: RegExp;

  try {
    regex = new RegExp(source, flags);
  } catch {
    return {
      matches: [],
      totalOccurrences: 0,
      totalMatchedLines: 0,
      isTruncated: false,
      errorMessage: "Invalid regular expression.",
    };
  }

  const matches: LineMatch[] = [];

  for (let index = 0; index < lines.length; index++) {
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

    if (occurrences === 0) {
      continue;
    }

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

  const totalOccurrences = matches.reduce((sum, m) => sum + m.occurrences, 0);

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
  query: string,
  options: SearchOptions,
): SearchResult {
  const matches: LineMatch[] = [];
  const normalizedQuery = options.caseSensitive ? query : query.toLowerCase();

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const searchTarget = options.caseSensitive ? line : line.toLowerCase();
    let occurrences = 0;
    let fromIndex = 0;
    let firstMatchIndex = -1;

    while (fromIndex < searchTarget.length) {
      const foundIndex = searchTarget.indexOf(normalizedQuery, fromIndex);

      if (foundIndex === -1) {
        break;
      }

      const isWholeWordMatch =
        !options.wholeWord ||
        hasWordBoundaries(line, foundIndex, normalizedQuery.length);

      if (isWholeWordMatch) {
        occurrences += 1;
        if (firstMatchIndex === -1) {
          firstMatchIndex = foundIndex;
        }
      }

      fromIndex = foundIndex + Math.max(1, normalizedQuery.length);
    }

    if (occurrences === 0) {
      continue;
    }

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

  const totalOccurrences = matches.reduce((sum, m) => sum + m.occurrences, 0);

  return {
    matches,
    totalOccurrences,
    totalMatchedLines: matches.length,
    isTruncated: false,
    errorMessage: null,
  };
}

function createPreview(
  line: string,
  index: number,
  matchLength: number,
): string {
  if (!line) {
    return "(empty line)";
  }

  const safeIndex = Math.max(0, index);
  const safeLength = Math.max(1, matchLength);
  const sliceStart = Math.max(0, safeIndex - SNIPPET_PADDING);
  const sliceEnd = Math.min(line.length, safeIndex + safeLength + SNIPPET_PADDING);

  const prefix = sliceStart > 0 ? "..." : "";
  const suffix = sliceEnd < line.length ? "..." : "";

  return `${prefix}${line.slice(sliceStart, sliceEnd)}${suffix}`;
}

function hasWordBoundaries(
  line: string,
  index: number,
  matchLength: number,
): boolean {
  const charBefore = line[index - 1] ?? "";
  const charAfter = line[index + matchLength] ?? "";
  return !isWordCharacter(charBefore) && !isWordCharacter(charAfter);
}

function isWordCharacter(char: string): boolean {
  if (!char) {
    return false;
  }

  return /[\p{L}\p{N}_]/u.test(char);
}
