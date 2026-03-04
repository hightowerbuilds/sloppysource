import type { TokenizedDocument } from "./tokenModels.ts";

export interface TokenWorkerSetDocumentRequest {
  type: "set-document";
  docKey: string;
  markdown: string;
}

export interface TokenWorkerClearDocumentRequest {
  type: "clear-document";
}

export interface TokenWorkerTokenizeRequest {
  type: "tokenize";
  id: number;
}

export type TokenWorkerRequest =
  | TokenWorkerSetDocumentRequest
  | TokenWorkerClearDocumentRequest
  | TokenWorkerTokenizeRequest;

export interface TokenWorkerTokenizeResultResponse {
  type: "tokenize-result";
  id: number;
  result: TokenizedDocument;
}

export interface TokenWorkerTokenizeErrorResponse {
  type: "tokenize-error";
  id: number;
  message: string;
}

export type TokenWorkerResponse =
  | TokenWorkerTokenizeResultResponse
  | TokenWorkerTokenizeErrorResponse;
