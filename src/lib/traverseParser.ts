import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { TraverseItem, TraverseTag } from "./traverseModels.ts";

interface MarkdownNode {
  type: string;
  depth?: number;
  value?: string;
  alt?: string;
  lang?: string | null;
  children?: MarkdownNode[];
  position?: {
    start?: {
      line?: number;
    };
    end?: {
      line?: number;
    };
  };
}

const PREVIEW_LIMIT = 120;
const parser = unified().use(remarkParse).use(remarkGfm);

export function extractTraverseItems(markdown: string): TraverseItem[] {
  if (!markdown.trim()) return [];

  const root = parser.parse(markdown) as MarkdownNode;
  const items: TraverseItem[] = [];
  let sequence = 0;

  walkTree(root, items, () => {
    sequence += 1;
    return sequence;
  });

  return items;
}

function walkTree(
  node: MarkdownNode,
  items: TraverseItem[],
  nextSequence: () => number,
) {
  const tag = mapNodeToTraverseTag(node);

  if (tag) {
    const line = node.position?.start?.line ?? null;
    const endLine = node.position?.end?.line ?? null;
    const sequence = nextSequence();

    items.push({
      id: `${tag}-${line ?? "x"}-${sequence}`,
      type: tag,
      text: previewTextForNode(node, tag),
      line,
      endLine,
    });
  }

  const children = node.children ?? [];
  for (const child of children) {
    walkTree(child, items, nextSequence);
  }
}

function mapNodeToTraverseTag(node: MarkdownNode): TraverseTag | null {
  if (node.type === "heading") {
    return headingTag(node.depth);
  }

  if (node.type === "paragraph") return "p";
  if (node.type === "code") return "code";
  if (node.type === "listItem") return "li";
  if (node.type === "blockquote") return "blockquote";
  if (node.type === "table") return "table";
  if (node.type === "thematicBreak") return null;
  return null;
}

function headingTag(depth: number | undefined): TraverseTag {
  if (!depth || depth <= 1) return "h1";
  if (depth === 2) return "h2";
  if (depth === 3) return "h3";
  if (depth === 4) return "h4";
  if (depth === 5) return "h5";
  return "h6";
}

function previewTextForNode(node: MarkdownNode, tag: TraverseTag): string {
  if (tag === "hr") return "Horizontal rule";

  if (tag === "code") {
    const language = node.lang?.trim();
    const firstLine = firstNonEmptyLine(node.value ?? "") ?? "Code block";
    const withLanguage = language ? `${language}: ${firstLine}` : firstLine;
    return truncateText(withLanguage, PREVIEW_LIMIT);
  }

  const text = normalizeWhitespace(extractNodeText(node));
  if (text) return truncateText(text, PREVIEW_LIMIT);

  if (tag === "blockquote") return "Blockquote";
  if (tag === "li") return "List item";
  if (tag === "table") return "Table";
  if (tag === "p") return "Paragraph";
  return "Heading";
}

function firstNonEmptyLine(value: string): string | null {
  const lines = value.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function extractNodeText(node: MarkdownNode): string {
  if (node.type === "text" || node.type === "inlineCode" || node.type === "code") {
    return node.value ?? "";
  }

  if (node.type === "image") {
    return node.alt ?? "";
  }

  if (node.type === "break") {
    return " ";
  }

  const children = node.children ?? [];
  let text = "";

  for (const child of children) {
    const childText = extractNodeText(child);
    if (!childText) continue;
    text += childText;
    text += " ";
  }

  return text;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncateText(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 3).trimEnd()}...`;
}
