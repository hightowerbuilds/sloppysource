import { useCallback, useEffect, useReducer, useRef } from "react";
import { EMPTY_TOKENIZED_DOCUMENT, type TokenizedDocument } from "../../lib/tokenModels.ts";
import type { TokenWorkerRequest, TokenWorkerResponse } from "../../lib/tokenWorkerMessages.ts";

interface UseTokenSessionArgs {
  docId: string | null;
  docToken: string;
  markdown: string | null;
  enabled: boolean;
}

type TokenSessionStatus = "idle" | "tokenizing" | "ready" | "error";

interface TokenSessionState {
  status: TokenSessionStatus;
  tokenizedDocument: TokenizedDocument;
  errorMessage: string | null;
  resultDocToken: string | null;
}

const DEFAULT_TOKEN_SESSION_STATE: TokenSessionState = {
  status: "idle",
  tokenizedDocument: EMPTY_TOKENIZED_DOCUMENT,
  errorMessage: null,
  resultDocToken: null,
};

const WORKER_INIT_ERROR_MESSAGE = "Unable to initialize tokenizer worker.";

type TokenSessionAction =
  | { type: "worker-init-failed"; message: string }
  | { type: "reset" }
  | { type: "idle" }
  | { type: "ready-cached"; docToken: string }
  | { type: "tokenizing" }
  | { type: "ready"; docToken: string; result: TokenizedDocument }
  | { type: "error"; docToken: string | null; message: string };

function tokenSessionReducer(
  state: TokenSessionState,
  action: TokenSessionAction,
): TokenSessionState {
  if (action.type === "worker-init-failed") {
    return {
      status: "error",
      tokenizedDocument: EMPTY_TOKENIZED_DOCUMENT,
      errorMessage: action.message,
      resultDocToken: null,
    };
  }

  if (action.type === "reset") {
    return DEFAULT_TOKEN_SESSION_STATE;
  }

  if (action.type === "idle") {
    if (state.status === "idle" && !state.errorMessage) return state;
    return {
      ...state,
      status: "idle",
      errorMessage: null,
    };
  }

  if (action.type === "ready-cached") {
    if (state.resultDocToken !== action.docToken) return state;
    if (state.status === "ready" && !state.errorMessage) return state;
    return {
      ...state,
      status: "ready",
      errorMessage: null,
    };
  }

  if (action.type === "tokenizing") {
    return {
      status: "tokenizing",
      tokenizedDocument: EMPTY_TOKENIZED_DOCUMENT,
      errorMessage: null,
      resultDocToken: null,
    };
  }

  if (action.type === "ready") {
    return {
      status: "ready",
      tokenizedDocument: action.result,
      errorMessage: null,
      resultDocToken: action.docToken,
    };
  }

  return {
    status: "error",
    tokenizedDocument: EMPTY_TOKENIZED_DOCUMENT,
    errorMessage: action.message,
    resultDocToken: action.docToken,
  };
}

export function useTokenSession({
  docId,
  docToken,
  markdown,
  enabled,
}: UseTokenSessionArgs) {
  const [state, dispatch] = useReducer(tokenSessionReducer, DEFAULT_TOKEN_SESSION_STATE);
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const resultDocTokenRef = useRef<string | null>(null);
  const activeDocTokenRef = useRef(docToken);

  useEffect(() => {
    activeDocTokenRef.current = docToken;
  }, [docToken]);

  const postWorkerMessage = useCallback((message: TokenWorkerRequest) => {
    workerRef.current?.postMessage(message);
  }, []);

  useEffect(() => {
    let worker: Worker;

    try {
      worker = new Worker(new URL("../../lib/tokenWorker.ts", import.meta.url), {
        type: "module",
      });
    } catch (error) {
      console.error("Failed to create token worker:", error);
      dispatch({
        type: "worker-init-failed",
        message: WORKER_INIT_ERROR_MESSAGE,
      });
      return;
    }

    worker.onmessage = (event: MessageEvent<TokenWorkerResponse>) => {
      const message = event.data;
      if (message.id !== requestIdRef.current) return;

      if (message.type === "tokenize-error") {
        dispatch({
          type: "error",
          docToken: activeDocTokenRef.current,
          message: message.message,
        });
        return;
      }

      const activeDocToken = activeDocTokenRef.current;
      resultDocTokenRef.current = activeDocToken;
      dispatch({
        type: "ready",
        docToken: activeDocToken,
        result: message.result,
      });
    };

    worker.onerror = (error) => {
      console.error("Token worker error:", error);
    };

    workerRef.current = worker;

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    requestIdRef.current += 1;

    if (!docId || markdown === null) {
      resultDocTokenRef.current = null;
      dispatch({ type: "reset" });
      postWorkerMessage({ type: "clear-document" });
      return;
    }

    if (!workerRef.current) {
      dispatch({
        type: "error",
        docToken,
        message: WORKER_INIT_ERROR_MESSAGE,
      });
      return;
    }

    postWorkerMessage({
      type: "set-document",
      docKey: docToken,
      markdown,
    });

    if (!enabled) {
      dispatch({ type: "idle" });
      return;
    }

    if (resultDocTokenRef.current === docToken) {
      dispatch({ type: "ready-cached", docToken });
      return;
    }

    const id = ++requestIdRef.current;
    dispatch({ type: "tokenizing" });

    postWorkerMessage({
      type: "tokenize",
      id,
    });
  }, [docId, docToken, markdown, enabled, postWorkerMessage]);

  return state;
}
