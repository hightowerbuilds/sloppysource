export type TraverseTag =
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6"
  | "p"
  | "code"
  | "li"
  | "blockquote"
  | "table"
  | "hr";

export type TraverseNavigationMode = "list" | "document";

export interface TraverseItem {
  id: string;
  type: TraverseTag;
  text: string;
  line: number | null;
  endLine: number | null;
}

export const TRAVERSE_TAG_LABELS: Record<TraverseTag, string> = {
  h1: "H1",
  h2: "H2",
  h3: "H3",
  h4: "H4",
  h5: "H5",
  h6: "H6",
  p: "P",
  code: "CODE",
  li: "LI",
  blockquote: "QUOTE",
  table: "TABLE",
  hr: "HR",
};
