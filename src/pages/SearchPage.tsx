import { useQuery } from "@tanstack/react-query";
import { createLazyRoute } from "@tanstack/react-router";
import { DocPicker } from "../components/DocPicker.tsx";
import { SearchControls } from "../components/search/SearchControls.tsx";
import { SearchResults } from "../components/search/SearchResults.tsx";
import { SearchSummary } from "../components/search/SearchSummary.tsx";
import { useSearchSession } from "../components/search/useSearchSession.ts";
import { documentQueryKey } from "../lib/queryKeys.ts";
import { getDocument } from "../lib/supabaseDb.ts";
import { useAuthUser } from "../lib/useAuthUser.ts";
import { useSelectedDoc } from "../lib/useSelectedDoc.ts";
import "../components/search/SearchPageLayout.css";

export const Route = createLazyRoute("/search")({
  component: SearchPage,
});

function SearchPage() {
  const { docId } = useSelectedDoc();
  const user = useAuthUser();
  const userId = user?.id ?? null;

  const documentQuery = useQuery({
    queryKey: documentQueryKey(userId, docId),
    queryFn: () => getDocument(docId!),
    staleTime: 60_000,
    enabled: !!userId && !!docId,
  });

  const document = documentQuery.data ?? null;

  const {
    inputRef,
    query,
    currentPage,
    options,
    searchResult,
    trimmedQuery,
    hasActiveTags,
    hasActiveSearch,
    setCurrentPage,
    handleQueryChange,
    toggleSearchTag,
    toggleCaseSensitive,
    toggleWholeWord,
    toggleRegex,
    resetSearch,
  } = useSearchSession({
    docId,
    markdown: document?.markdown ?? null,
  });

  return (
    <section className="workspace">
      <div className="search-page">
        <div className="search-page-header">
          <DocPicker onSelect={resetSearch} />
        </div>

        {!docId ? (
          <div className="search-page-empty">
            <p>Select a markdown file to search.</p>
          </div>
        ) : documentQuery.isPending ? (
          <div className="search-page-empty">
            <p>Loading document...</p>
          </div>
        ) : !document ? (
          <div className="search-page-empty">
            <p>Document not found.</p>
          </div>
        ) : (
          <>
            <SearchControls
              inputRef={inputRef}
              query={query}
              options={options}
              onQueryChange={handleQueryChange}
              onToggleCaseSensitive={toggleCaseSensitive}
              onToggleWholeWord={toggleWholeWord}
              onToggleRegex={toggleRegex}
              onToggleTag={toggleSearchTag}
            />

            <SearchSummary
              hasActiveSearch={hasActiveSearch}
              hasActiveTags={hasActiveTags}
              trimmedQuery={trimmedQuery}
              result={searchResult}
            />

            {searchResult.errorMessage ? (
              <p className="status error" role="status">
                {searchResult.errorMessage}
              </p>
            ) : null}

            <SearchResults
              hasActiveSearch={hasActiveSearch}
              trimmedQuery={trimmedQuery}
              options={options}
              result={searchResult}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
            />
          </>
        )}
      </div>
    </section>
  );
}
