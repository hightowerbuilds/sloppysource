import { Tiktoken } from "js-tiktoken/lite";
import o200kBase from "js-tiktoken/ranks/o200k_base";
import { EMPTY_TOKENIZED_DOCUMENT, type TokenLine, type TokenizedDocument } from "./tokenModels.ts";
import type { TokenWorkerRequest, TokenWorkerResponse } from "./tokenWorkerMessages.ts";

/* ── Web Worker: tokenizes markdown into OpenAI-style BPE tokens ── */

const encoder = new Tiktoken(o200kBase);

let indexedDocKey: string | null = null;
let indexedMarkdown = "";
let cachedTokenizedDocument: TokenizedDocument | null = null;

function setDocumentIndex(docKey: string, markdown: string) {
  if (indexedDocKey === docKey && indexedMarkdown === markdown) {
    return;
  }

  indexedDocKey = docKey;
  indexedMarkdown = markdown;
  cachedTokenizedDocument = null;
}

function clearDocumentIndex() {
  indexedDocKey = null;
  indexedMarkdown = "";
  cachedTokenizedDocument = null;
}

function getTokenizedDocument(): TokenizedDocument {
  if (!indexedDocKey) {
    return EMPTY_TOKENIZED_DOCUMENT;
  }

  if (cachedTokenizedDocument) {
    return cachedTokenizedDocument;
  }

  const result = tokenizeMarkdown(indexedMarkdown);
  cachedTokenizedDocument = result;
  return result;
}

function tokenizeMarkdown(markdown: string): TokenizedDocument {
  if (!markdown) {
    return EMPTY_TOKENIZED_DOCUMENT;
  }

  const tokenIds = encoder.encode(markdown);
  const lines: TokenLine[] = [];
  let currentLine: TokenLine = { lineNumber: 1, tokens: [] };
  let lineNumber = 1;
  let sequence = 0;
  let offset = 0;

  for (const tokenId of tokenIds) {
    const decodedToken = encoder.decode([tokenId]);
    if (!decodedToken) continue;

    let cursor = 0;

    while (cursor < decodedToken.length) {
      const newline = findNextLineBreak(decodedToken, cursor);
      const chunkEnd = newline ? newline.index : decodedToken.length;

      if (chunkEnd > cursor) {
        const chunk = decodedToken.slice(cursor, chunkEnd);
        const start = offset;
        offset += chunk.length;
        sequence += 1;

        currentLine.tokens.push({
          sequence,
          tokenId,
          text: chunk,
          start,
          end: offset,
        });
      }

      if (!newline) {
        break;
      }

      offset += newline.length;
      lines.push(currentLine);
      lineNumber += 1;
      currentLine = { lineNumber, tokens: [] };
      cursor = newline.index + newline.length;
    }
  }

  lines.push(currentLine);

  return {
    lines,
    totalTokens: tokenIds.length,
    totalLines: lines.length,
  };
}

function findNextLineBreak(
  value: string,
  fromIndex: number,
): { index: number; length: number } | null {
  for (let index = fromIndex; index < value.length; index++) {
    const charCode = value.charCodeAt(index);
    if (charCode === 10) {
      return { index, length: 1 };
    }

    if (charCode === 13) {
      const hasFollowingNewline = value.charCodeAt(index + 1) === 10;
      return { index, length: hasFollowingNewline ? 2 : 1 };
    }
  }

  return null;
}

self.onmessage = (event: MessageEvent<TokenWorkerRequest>) => {
  const message = event.data;

  if (message.type === "set-document") {
    setDocumentIndex(message.docKey, message.markdown);
    return;
  }

  if (message.type === "clear-document") {
    clearDocumentIndex();
    return;
  }

  if (message.type !== "tokenize") {
    return;
  }

  const { id } = message;

  try {
    const response: TokenWorkerResponse = {
      type: "tokenize-result",
      id,
      result: getTokenizedDocument(),
    };
    self.postMessage(response);
  } catch (error) {
    const errorMessage = error instanceof Error
      ? error.message
      : "Tokenization failed.";

    const response: TokenWorkerResponse = {
      type: "tokenize-error",
      id,
      message: errorMessage,
    };

    self.postMessage(response);
  }
};
