export type SlideTag =
  | "heading"
  | "paragraph"
  | "code"
  | "list"
  | "blockquote"
  | "table"
  | "other";

export interface SlideOutline {
  id: string;
  tag: SlideTag;
  preview: string;
  startLine: number;
  endLine: number;
}

export const SLIDE_TAG_LABELS: Record<SlideTag, string> = {
  heading: "Heading",
  paragraph: "Paragraph",
  code: "Code",
  list: "List",
  blockquote: "Quote",
  table: "Table",
  other: "Block",
};
