export interface TokenSegment {
  sequence: number;
  tokenId: number;
  text: string;
  start: number;
  end: number;
}

export interface TokenLine {
  lineNumber: number;
  tokens: TokenSegment[];
}

export interface TokenizedDocument {
  lines: TokenLine[];
  totalTokens: number;
  totalLines: number;
}

export const EMPTY_TOKENIZED_DOCUMENT: TokenizedDocument = {
  lines: [],
  totalTokens: 0,
  totalLines: 0,
};
