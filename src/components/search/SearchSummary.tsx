import { MAX_MATCH_LINES, type SearchResult } from "./types.ts";
import "./SearchSummary.css";

interface SearchSummaryProps {
  hasActiveSearch: boolean;
  hasActiveTags: boolean;
  trimmedQuery: string;
  result: SearchResult;
}

export function SearchSummary({
  hasActiveSearch,
  hasActiveTags,
  trimmedQuery,
  result,
}: SearchSummaryProps) {
  return (
    <div className="search-summary" role="status" aria-live="polite">
      {hasActiveSearch ? (
        <span>
          {result.isTruncated ? (
            <>
              {MAX_MATCH_LINES.toLocaleString()}+ matches (showing first{" "}
              {MAX_MATCH_LINES.toLocaleString()} lines)
            </>
          ) : hasActiveTags && !trimmedQuery ? (
            <>
              {result.totalMatchedLines.toLocaleString()} tagged line
              {result.totalMatchedLines === 1 ? "" : "s"} found
            </>
          ) : (
            <>
              {result.totalOccurrences.toLocaleString()} match
              {result.totalOccurrences === 1 ? "" : "es"} across{" "}
              {result.totalMatchedLines.toLocaleString()} line
              {result.totalMatchedLines === 1 ? "" : "s"}
            </>
          )}
        </span>
      ) : (
        <span className="hint">Select a tag filter or enter a search string.</span>
      )}
    </div>
  );
}
