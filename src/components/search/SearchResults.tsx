import type { ReactNode } from "react";
import { MATCHES_PER_PAGE, type SearchOptions, type SearchResult } from "./types.ts";
import "./SearchResults.css";

const PAGE_BUTTON_GROUP_SIZE = 10;

interface SearchResultsProps {
  hasActiveSearch: boolean;
  trimmedQuery: string;
  options: SearchOptions;
  result: SearchResult;
  currentPage: number;
  onPageChange: (page: number) => void;
}

export function SearchResults({
  hasActiveSearch,
  trimmedQuery,
  options,
  result,
  currentPage,
  onPageChange,
}: SearchResultsProps) {
  const totalPages = Math.ceil(result.matches.length / MATCHES_PER_PAGE);
  const safeCurrentPage = totalPages > 0 ? Math.min(Math.max(currentPage, 1), totalPages) : 1;
  const { startPage, endPage } = getVisiblePageRange(safeCurrentPage, totalPages);
  const pagedMatches = result.matches.slice(
    (safeCurrentPage - 1) * MATCHES_PER_PAGE,
    safeCurrentPage * MATCHES_PER_PAGE,
  );

  return (
    <div className="search-results">
      {!hasActiveSearch ? (
        <p className="empty">Select a tag filter or type a search query.</p>
      ) : result.errorMessage ? (
        <p className="empty">Fix the search pattern to view matches.</p>
      ) : result.matches.length === 0 ? (
        <p className="empty">No matching lines found.</p>
      ) : (
        <>
          <ul className="search-result-list">
            {pagedMatches.map((match) => (
              <li className="search-result-item" key={`${match.lineNumber}-${match.preview}`}>
                <p className="search-result-meta">
                  Line {match.lineNumber}
                  {trimmedQuery ? (
                    <>
                      {" "}
                      · {match.occurrences} match
                      {match.occurrences === 1 ? "" : "es"}
                    </>
                  ) : null}
                </p>
                <pre className="search-result-preview">
                  {trimmedQuery
                    ? highlightPreview(match.preview, trimmedQuery, options)
                    : match.preview}
                </pre>
              </li>
            ))}
          </ul>
          {totalPages > 1 ? (
            <nav className="search-pagination" aria-label="Search result pages">
              {startPage > 1 ? (
                <button
                  className="search-page-button search-page-jump"
                  type="button"
                  onClick={() => onPageChange(startPage - 1)}
                >
                  Prev
                </button>
              ) : null}
              {Array.from({ length: endPage - startPage + 1 }, (_, index) => startPage + index).map((page) => (
                <button
                  key={page}
                  className={`search-page-button${page === safeCurrentPage ? " is-active" : ""}`}
                  type="button"
                  onClick={() => onPageChange(page)}
                >
                  {page}
                </button>
              ))}
              {endPage < totalPages ? (
                <button
                  className="search-page-button search-page-jump"
                  type="button"
                  onClick={() => onPageChange(endPage + 1)}
                >
                  Next
                </button>
              ) : null}
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}

function getVisiblePageRange(currentPage: number, totalPages: number): {
  startPage: number;
  endPage: number;
} {
  if (totalPages <= PAGE_BUTTON_GROUP_SIZE) {
    return { startPage: 1, endPage: totalPages };
  }

  const groupStart =
    Math.floor((Math.max(currentPage, 1) - 1) / PAGE_BUTTON_GROUP_SIZE) *
      PAGE_BUTTON_GROUP_SIZE +
    1;
  const groupEnd = Math.min(totalPages, groupStart + PAGE_BUTTON_GROUP_SIZE - 1);

  return { startPage: groupStart, endPage: groupEnd };
}

function highlightPreview(
  preview: string,
  query: string,
  options: SearchOptions,
): ReactNode {
  if (!query) return preview;

  const flags = options.caseSensitive ? "g" : "gi";
  let pattern: string;

  if (options.regex) {
    pattern = options.wholeWord ? `\\b(?:${query})\\b` : query;
  } else {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    pattern = options.wholeWord ? `\\b(?:${escaped})\\b` : escaped;
  }

  let regex: RegExp;
  try {
    regex = new RegExp(`(${pattern})`, flags);
  } catch {
    return preview;
  }

  const parts = preview.split(regex);
  if (parts.length <= 1) return preview;

  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <mark key={index} className="search-highlight">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}
