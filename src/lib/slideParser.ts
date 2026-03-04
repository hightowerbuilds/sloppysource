import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { SlideOutline, SlideTag } from "./slideModels.ts";

interface MarkdownNode {
  type: string;
  depth?: number;
  value?: string;
  alt?: string;
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

const PREVIEW_LIMIT = 84;
const parser = unified().use(remarkParse).use(remarkGfm);

export function extractSlideOutlines(markdown: string): SlideOutline[] {
  if (!markdown.trim()) return [];

  const root = parser.parse(markdown) as MarkdownNode;
  const children = root.children ?? [];

  const outlines: SlideOutline[] = [];

  for (let index = 0; index < children.length; index += 1) {
    const node = children[index];
    if (!node) continue;

    const startLine = node.position?.start?.line;
    const endLine = node.position?.end?.line;

    if (typeof startLine !== "number" || typeof endLine !== "number") {
      continue;
    }

    const tag = mapNodeToSlideTag(node);
    if (!tag) continue;

    outlines.push({
      id: `${tag}-${startLine}-${index + 1}`,
      tag,
      preview: buildPreview(node, tag),
      startLine,
      endLine,
    });
  }

  if (outlines.length > 0) {
    return outlines;
  }

  const lines = markdown.split(/\r?\n/);

  return [
    {
      id: "other-1-1",
      tag: "other",
      preview: truncateText(normalizeWhitespace(markdown), PREVIEW_LIMIT) || "Markdown content",
      startLine: 1,
      endLine: Math.max(lines.length, 1),
    },
  ];
}

export function materializeSlideMarkdown(markdown: string, outline: SlideOutline): string {
  return materializeSlideMarkdownFromLines(splitMarkdownLines(markdown), outline);
}

export function splitMarkdownLines(markdown: string): string[] {
  return markdown.split(/\r?\n/);
}

export function materializeSlideMarkdownFromLines(
  lines: string[],
  outline: SlideOutline,
): string {
  if (lines.length === 0) return "";

  const startIndex = clampNumber(outline.startLine - 1, 0, lines.length - 1);
  const endIndexInclusive = clampNumber(outline.endLine - 1, startIndex, lines.length - 1);

  return lines.slice(startIndex, endIndexInclusive + 1).join("\n");
}

function mapNodeToSlideTag(node: MarkdownNode): SlideTag | null {
  if (node.type === "heading") return "heading";
  if (node.type === "paragraph") return "paragraph";
  if (node.type === "code") return "code";
  if (node.type === "list") return "list";
  if (node.type === "blockquote") return "blockquote";
  if (node.type === "table") return "table";
  if (node.type === "thematicBreak") return null;
  return "other";
}

function buildPreview(node: MarkdownNode, tag: SlideTag): string {
  const text = normalizeWhitespace(extractNodeText(node));

  if (text) {
    return truncateText(text, PREVIEW_LIMIT);
  }

  if (tag === "heading") return "Heading";
  if (tag === "paragraph") return "Paragraph";
  if (tag === "code") return "Code block";
  if (tag === "list") return "List";
  if (tag === "blockquote") return "Blockquote";
  if (tag === "table") return "Table";

  return "Markdown block";
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

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
