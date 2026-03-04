import type { SearchOptions, SearchResult } from "./searchModels.ts";

export interface SearchWorkerSetDocumentRequest {
  type: "set-document";
  docKey: string;
  markdown: string;
}

export interface SearchWorkerClearDocumentRequest {
  type: "clear-document";
}

export interface SearchWorkerRunSearchRequest {
  type: "run-search";
  id: number;
  query: string;
  options: SearchOptions;
}

export type SearchWorkerRequest =
  | SearchWorkerSetDocumentRequest
  | SearchWorkerClearDocumentRequest
  | SearchWorkerRunSearchRequest;

export interface SearchWorkerSearchResultResponse {
  type: "search-result";
  id: number;
  result: SearchResult;
}

export type SearchWorkerResponse = SearchWorkerSearchResultResponse;
