import { useCallback, useEffect, useRef, useState } from "react";
import type { SearchWorkerRequest, SearchWorkerResponse } from "../../lib/searchWorkerMessages.ts";
import {
  EMPTY_RESULT,
  createDefaultSearchOptions,
  hasActiveSearchTags,
  type SearchOptions,
  type SearchResult,
  type SearchTag,
} from "./types.ts";

interface UseSearchSessionArgs {
  docId: string | null;
  markdown: string | null;
}

export function useSearchSession({ docId, markdown }: UseSearchSessionArgs) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [options, setOptions] = useState<SearchOptions>(createDefaultSearchOptions);
  const [searchResult, setSearchResult] = useState<SearchResult>(EMPTY_RESULT);
  const [resultDocId, setResultDocId] = useState<string | null>(docId);

  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeDocIdRef = useRef<string | null>(docId);
  const hasDocumentLoadedRef = useRef(Boolean(docId && markdown));

  const queryRef = useRef(query);
  const optionsRef = useRef(options);

  useEffect(() => {
    queryRef.current = query;
    optionsRef.current = options;
  }, [query, options]);

  const postWorkerMessage = useCallback((message: SearchWorkerRequest) => {
    workerRef.current?.postMessage(message);
  }, []);

  const scheduleSearch = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      const trimmedQuery = queryRef.current.trim();
      const nextOptions = optionsRef.current;
      const hasActiveTags = hasActiveSearchTags(nextOptions.tags);

      if (!trimmedQuery && !hasActiveTags) {
        setSearchResult(EMPTY_RESULT);
        return;
      }

      if (!activeDocIdRef.current || !hasDocumentLoadedRef.current) {
        setSearchResult(EMPTY_RESULT);
        return;
      }

      const id = ++requestIdRef.current;
      postWorkerMessage({
        type: "run-search",
        id,
        query: queryRef.current,
        options: nextOptions,
      });
    }, 200);
  }, [postWorkerMessage]);

  useEffect(() => {
    let worker: Worker;

    try {
      worker = new Worker(new URL("../../lib/searchWorker.ts", import.meta.url), {
        type: "module",
      });
    } catch (error) {
      console.error("Failed to create search worker:", error);
      return;
    }

    worker.onmessage = (event: MessageEvent<SearchWorkerResponse>) => {
      const message = event.data;
      if (message.type === "search-result" && message.id === requestIdRef.current) {
        setSearchResult(message.result);
        setResultDocId(activeDocIdRef.current);
      }
    };

    worker.onerror = (error) => console.error("Search worker error:", error);

    workerRef.current = worker;

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    activeDocIdRef.current = docId;
    hasDocumentLoadedRef.current = Boolean(docId && markdown);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    requestIdRef.current += 1;

    if (!docId || !markdown) {
      postWorkerMessage({ type: "clear-document" });
      return;
    }

    postWorkerMessage({
      type: "set-document",
      docKey: docId,
      markdown,
    });

    scheduleSearch();
  }, [docId, markdown, postWorkerMessage, scheduleSearch]);

  useEffect(() => {
    scheduleSearch();
  }, [options, scheduleSearch]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  const trimmedQuery = query.trim();
  const hasActiveTags = hasActiveSearchTags(options.tags);
  const hasActiveSearch = !!trimmedQuery || hasActiveTags;
  const visibleSearchResult = resultDocId === docId ? searchResult : EMPTY_RESULT;

  function handleQueryChange(value: string) {
    setQuery(value);
    setCurrentPage(1);
    scheduleSearch();
  }

  function toggleSearchTag(tag: SearchTag) {
    setCurrentPage(1);
    setOptions((current) => ({
      ...current,
      tags: {
        ...createDefaultSearchOptions().tags,
        [tag]: !current.tags[tag],
      },
    }));
  }

  function toggleCaseSensitive() {
    setCurrentPage(1);
    setOptions((current) => ({
      ...current,
      caseSensitive: !current.caseSensitive,
    }));
  }

  function toggleWholeWord() {
    setCurrentPage(1);
    setOptions((current) => ({
      ...current,
      wholeWord: !current.wholeWord,
    }));
  }

  function toggleRegex() {
    setCurrentPage(1);
    setOptions((current) => ({
      ...current,
      regex: !current.regex,
    }));
  }

  const resetSearch = useCallback(() => {
    requestIdRef.current += 1;
    setQuery("");
    setCurrentPage(1);
    setOptions(createDefaultSearchOptions());
    setSearchResult(EMPTY_RESULT);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
  }, []);

  return {
    inputRef,
    query,
    currentPage,
    options,
    searchResult: visibleSearchResult,
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
  };
}
