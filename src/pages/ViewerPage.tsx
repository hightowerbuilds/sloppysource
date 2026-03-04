import { useEffect, useMemo, useRef, useState } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useQuery } from "@tanstack/react-query";
import { createLazyRoute } from "@tanstack/react-router";
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import { getDocument } from "../lib/supabaseDb.ts";
import { useSelectedDoc } from "../lib/useSelectedDoc.ts";
import { AsciiLoader } from "../components/AsciiLoader.tsx";
import { DocPicker } from "../components/DocPicker.tsx";
import { TraverseSidebar } from "../components/traverse/TraverseSidebar.tsx";
import { TokenView } from "../components/token/TokenView.tsx";
import { useTokenSession } from "../components/token/useTokenSession.ts";
import { PoseSidebar } from "../components/pose/PoseSidebar.tsx";
import { PoseView } from "../components/pose/PoseView.tsx";
import { SlidesView } from "../components/slides/SlidesView.tsx";
import { formatBytes, formatDate } from "../lib/format.ts";
import { extractTraverseItems } from "../lib/traverseParser.ts";
import type {
  TraverseItem,
  TraverseNavigationMode,
  TraverseTag,
} from "../lib/traverseModels.ts";
import "./ViewerPage.css";

const remarkPluginsConfig = [remarkGfm];

interface TraverseKeyboardState {
  docToken: string;
  selectedIndex: number;
  navigationMode: TraverseNavigationMode;
}

interface PoseKeyboardState {
  docToken: string;
  selectedIndex: number;
}

type ViewerMode = "rendered" | "token" | "pose" | "slides";
type SlideLayoutMode = "horizontal" | "vertical";

const DEFAULT_TRAVERSE_STATE: TraverseKeyboardState = {
  docToken: "",
  selectedIndex: 0,
  navigationMode: "list",
};
const DEFAULT_POSE_STATE: PoseKeyboardState = {
  docToken: "",
  selectedIndex: 0,
};
const MIN_SLIDE_FONT_SCALE = 0.8;
const MAX_SLIDE_FONT_SCALE = 1.8;
const SLIDE_FONT_SCALE_STEP = 0.1;
const DEFAULT_SLIDE_FONT_SCALE = 1.12;
const DEFAULT_SLIDE_LAYOUT_MODE: SlideLayoutMode = "vertical";
const DEFAULT_POSE_TILT_X = 17;
const DEFAULT_POSE_TILT_Y = 0;

export const Route = createLazyRoute("/display")({
  component: ViewerPage,
});

function ViewerPage() {
  const { docId } = useSelectedDoc();
  const [viewerMode, setViewerMode] = useState<ViewerMode>("rendered");
  const [horizontalSlideFontScale, setHorizontalSlideFontScale] = useState(
    DEFAULT_SLIDE_FONT_SCALE,
  );
  const [verticalSlideFontScale, setVerticalSlideFontScale] = useState(
    DEFAULT_SLIDE_FONT_SCALE,
  );
  const [slideLayoutMode, setSlideLayoutMode] = useState<SlideLayoutMode>(
    DEFAULT_SLIDE_LAYOUT_MODE,
  );
  const [isTraverseOpen, setIsTraverseOpen] = useState(false);
  const [traverseState, setTraverseState] = useState<TraverseKeyboardState>(
    DEFAULT_TRAVERSE_STATE,
  );
  const [poseState, setPoseState] = useState<PoseKeyboardState>(DEFAULT_POSE_STATE);
  const [poseTiltX, setPoseTiltX] = useState(DEFAULT_POSE_TILT_X);
  const [poseTiltY, setPoseTiltY] = useState(DEFAULT_POSE_TILT_Y);
  const markdownOutputRef = useRef<HTMLDivElement | null>(null);
  const traverseListRef = useRef<HTMLUListElement | null>(null);
  const poseListRef = useRef<HTMLUListElement | null>(null);

  const documentQuery = useQuery({
    queryKey: ["document", docId] as const,
    queryFn: () => getDocument(docId!),
    staleTime: 60_000,
    enabled: !!docId,
  });

  const document = documentQuery.data ?? null;

  const markdown = document?.markdown;

  const traverseItems = useMemo(
    () => markdown ? extractTraverseItems(markdown) : [],
    [markdown],
  );

  const docToken = `${docId ?? "none"}:${document?.updatedAt ?? ""}`;
  const resolvedTraverseState = resolveTraverseState(traverseState, docToken);
  const resolvedPoseState = resolvePoseState(poseState, docToken);
  const maxTraverseIndex = Math.max(0, traverseItems.length - 1);
  const selectedTraverseIndex =
    traverseItems.length === 0
      ? 0
      : Math.min(resolvedTraverseState.selectedIndex, maxTraverseIndex);
  const selectedPoseIndex =
    traverseItems.length === 0
      ? 0
      : Math.min(resolvedPoseState.selectedIndex, maxTraverseIndex);

  const hasLoadedDocument = Boolean(document);
  const isTokenView = viewerMode === "token";
  const isPoseView = viewerMode === "pose";
  const isSlidesView = viewerMode === "slides";
  const isSlidesVerticalLayout = isSlidesView && slideLayoutMode === "vertical";
  const isTraverseVisible =
    hasLoadedDocument && isTraverseOpen && !isTokenView && !isPoseView && !isSlidesView;
  const traverseNavigationMode: TraverseNavigationMode = isTraverseVisible
    ? resolvedTraverseState.navigationMode
    : "list";
  const selectedTraverseItem =
    traverseItems.length === 0 ? null : (traverseItems[selectedTraverseIndex] ?? null);
  const selectedPoseItem =
    traverseItems.length === 0 ? null : (traverseItems[selectedPoseIndex] ?? null);
  const tokenSession = useTokenSession({
    docId,
    docToken,
    markdown: markdown ?? null,
    enabled: isTokenView,
  });
  const tokenCountLabel = resolveTokenCountLabel(isTokenView, tokenSession);
  const activeSlideFontScale = slideLayoutMode === "vertical"
    ? verticalSlideFontScale
    : horizontalSlideFontScale;
  const slideFontScalePercent = Math.round(activeSlideFontScale * 100);

  const markdownComponents = useMemo<Components>(
    () => {
      const highlightedItem = isPoseView
        ? null
        : (isTraverseVisible && traverseNavigationMode === "document"
          ? selectedTraverseItem
          : null);

      return createMarkdownComponents(highlightedItem);
    },
    [
      isPoseView,
      isTraverseVisible,
      selectedTraverseItem,
      traverseNavigationMode,
    ],
  );

  const renderedMarkdown = useMemo(
    () => markdown ? (
      <ReactMarkdown components={markdownComponents} remarkPlugins={remarkPluginsConfig}>
        {markdown}
      </ReactMarkdown>
    ) : null,
    [markdown, markdownComponents],
  );

  const poseMarkdown = useMemo(
    () => materializePoseItemMarkdown(markdown ?? "", selectedPoseItem),
    [markdown, selectedPoseItem],
  );

  const renderedPoseMarkdown = useMemo(
    () => poseMarkdown ? (
      <ReactMarkdown components={markdownComponents} remarkPlugins={remarkPluginsConfig}>
        {poseMarkdown}
      </ReactMarkdown>
    ) : null,
    [markdownComponents, poseMarkdown],
  );

  function setViewerModeWithPanelState(mode: ViewerMode) {
    const nextMode: ViewerMode = viewerMode === mode ? "rendered" : mode;
    if (nextMode !== "rendered") {
      setIsTraverseOpen(false);
    }
    setViewerMode(nextMode);
  }

  function decreaseSlideFontScale() {
    if (slideLayoutMode === "vertical") {
      setVerticalSlideFontScale((previous) =>
        clampNumber(
          roundToTenth(previous - SLIDE_FONT_SCALE_STEP),
          MIN_SLIDE_FONT_SCALE,
          MAX_SLIDE_FONT_SCALE,
        )
      );
      return;
    }

    setHorizontalSlideFontScale((previous) =>
      clampNumber(
        roundToTenth(previous - SLIDE_FONT_SCALE_STEP),
        MIN_SLIDE_FONT_SCALE,
        MAX_SLIDE_FONT_SCALE,
      )
    );
  }

  function increaseSlideFontScale() {
    if (slideLayoutMode === "vertical") {
      setVerticalSlideFontScale((previous) =>
        clampNumber(
          roundToTenth(previous + SLIDE_FONT_SCALE_STEP),
          MIN_SLIDE_FONT_SCALE,
          MAX_SLIDE_FONT_SCALE,
        )
      );
      return;
    }

    setHorizontalSlideFontScale((previous) =>
      clampNumber(
        roundToTenth(previous + SLIDE_FONT_SCALE_STEP),
        MIN_SLIDE_FONT_SCALE,
        MAX_SLIDE_FONT_SCALE,
      )
    );
  }

  function moveTraverseSelection(delta: number) {
    setTraverseState((previous) => {
      const resolved = resolveTraverseState(previous, docToken);
      if (traverseItems.length === 0 || delta === 0) return resolved;

      const direction = delta > 0 ? 1 : -1;
      let nextIndex = resolved.selectedIndex;
      let remainingSteps = Math.abs(delta);

      while (remainingSteps > 0) {
        const candidateIndex = findNextTraversableIndex(
          traverseItems,
          nextIndex,
          direction,
        );

        if (candidateIndex === null) break;
        nextIndex = candidateIndex;
        remainingSteps -= 1;
      }

      if (nextIndex === resolved.selectedIndex) {
        return resolved;
      }

      return {
        ...resolved,
        selectedIndex: nextIndex,
      };
    });
  }

  function movePoseSelection(delta: number) {
    setPoseState((previous) => {
      const resolved = resolvePoseState(previous, docToken);
      if (traverseItems.length === 0 || delta === 0) return resolved;

      const nextIndex = clampNumber(
        resolved.selectedIndex + delta,
        0,
        traverseItems.length - 1,
      );

      if (nextIndex === resolved.selectedIndex) return resolved;

      return {
        ...resolved,
        selectedIndex: nextIndex,
      };
    });
  }

  useHotkey(
    "ArrowDown",
    (event) => {
      if (!isTraverseVisible || shouldIgnoreHotkeyTarget(event.target)) return;
      event.preventDefault();
      moveTraverseSelection(1);
    },
    { enabled: isTraverseVisible },
  );

  useHotkey(
    "ArrowDown",
    (event) => {
      if (!isPoseView || shouldIgnoreHotkeyTarget(event.target)) return;
      event.preventDefault();
      movePoseSelection(1);
    },
    { enabled: isPoseView },
  );

  useHotkey(
    "ArrowUp",
    (event) => {
      if (!isPoseView || shouldIgnoreHotkeyTarget(event.target)) return;
      event.preventDefault();
      movePoseSelection(-1);
    },
    { enabled: isPoseView },
  );

  useHotkey(
    "ArrowUp",
    (event) => {
      if (!isTraverseVisible || shouldIgnoreHotkeyTarget(event.target)) return;
      event.preventDefault();
      moveTraverseSelection(-1);
    },
    { enabled: isTraverseVisible },
  );

  useHotkey(
    "ArrowRight",
    (event) => {
      if (!isTraverseVisible || shouldIgnoreHotkeyTarget(event.target)) return;
      if (traverseItems.length === 0) return;
      event.preventDefault();
      setTraverseState((previous) => {
        const resolved = resolveTraverseState(previous, docToken);
        const traversableIndex = resolveTraversableSelectionIndex(
          traverseItems,
          resolved.selectedIndex,
        );
        if (traversableIndex === null) return resolved;

        return {
          ...resolved,
          selectedIndex: traversableIndex,
          navigationMode: "document",
        };
      });
    },
    { enabled: isTraverseVisible },
  );

  useHotkey(
    "ArrowLeft",
    (event) => {
      if (!isTraverseVisible || shouldIgnoreHotkeyTarget(event.target)) return;
      if (traverseNavigationMode !== "document") return;
      event.preventDefault();
      setTraverseState((previous) => ({
        ...resolveTraverseState(previous, docToken),
        navigationMode: "list",
      }));
    },
    { enabled: isTraverseVisible },
  );

  useEffect(() => {
    if (!isTraverseVisible || !selectedTraverseItem) return;

    if (traverseNavigationMode === "document") {
      const container = markdownOutputRef.current;
      if (!container) return;
      const target = findTraverseTargetElement(container, selectedTraverseItem);
      target?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }

    const list = traverseListRef.current;
    if (!list) return;
    const selectedButton = list.querySelector<HTMLElement>(
      `[data-traverse-index="${selectedTraverseIndex}"]`,
    );
    selectedButton?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [
    isTraverseVisible,
    selectedTraverseIndex,
    selectedTraverseItem,
    traverseNavigationMode,
  ]);

  useEffect(() => {
    if (!isPoseView || !selectedPoseItem) return;

    const list = poseListRef.current;
    if (!list) return;
    const selectedButton = list.querySelector<HTMLElement>(
      `[data-pose-index="${selectedPoseIndex}"]`,
    );
    selectedButton?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [isPoseView, selectedPoseIndex, selectedPoseItem]);

  return (
    <section className={`workspace${isPoseView ? " is-pose-mode" : ""}`}>
      <article
        className={
          `viewer${isSlidesVerticalLayout ? " is-slides-vertical" : ""}` +
          `${isPoseView ? " is-pose-mode" : ""}`
        }
        aria-live="polite"
      >
        <div className="viewer-header">
          <div className="viewer-header-main">
            <DocPicker />
            <button
              type="button"
              className={`viewer-traverse-button${isTraverseVisible ? " is-active" : ""}`}
              onClick={() => {
                if (isTraverseVisible) {
                  setIsTraverseOpen(false);
                  return;
                }

                if (isTokenView || isPoseView || isSlidesView) {
                  setViewerMode("rendered");
                }

                setTraverseState((previous) => ({
                  ...resolveTraverseState(previous, docToken),
                  navigationMode: "list",
                }));
                setIsTraverseOpen(true);
              }}
              disabled={!hasLoadedDocument}
            >
              {isTraverseVisible ? "Hide Traverse" : "Traverse"}
            </button>
            <button
              type="button"
              className={`viewer-traverse-button${isTokenView ? " is-active" : ""}`}
              onClick={() => setViewerModeWithPanelState("token")}
              disabled={!hasLoadedDocument}
            >
              Token View
            </button>
            <button
              type="button"
              className={`viewer-traverse-button${isPoseView ? " is-active" : ""}`}
              onClick={() => setViewerModeWithPanelState("pose")}
              disabled={!hasLoadedDocument}
            >
              Pose
            </button>
            <button
              type="button"
              className={`viewer-traverse-button${isSlidesView ? " is-active" : ""}`}
              onClick={() => setViewerModeWithPanelState("slides")}
              disabled={!hasLoadedDocument}
            >
              Slides
            </button>
            {isSlidesView ? (
              <>
                <div className="viewer-slide-font-controls" role="group" aria-label="Slide font size">
                  <button
                    type="button"
                    className="viewer-slide-font-button"
                    onClick={decreaseSlideFontScale}
                    disabled={activeSlideFontScale <= MIN_SLIDE_FONT_SCALE}
                    aria-label="Decrease slide font size"
                  >
                    -
                  </button>
                  <span className="viewer-slide-font-label">{slideFontScalePercent}%</span>
                  <button
                    type="button"
                    className="viewer-slide-font-button"
                    onClick={increaseSlideFontScale}
                    disabled={activeSlideFontScale >= MAX_SLIDE_FONT_SCALE}
                    aria-label="Increase slide font size"
                  >
                    +
                  </button>
                </div>
                <div className="viewer-slide-layout-controls" role="group" aria-label="Slide layout">
                  <button
                    type="button"
                    className={`viewer-slide-layout-button${
                      slideLayoutMode === "horizontal" ? " is-active" : ""
                    }`}
                    onClick={() => setSlideLayoutMode("horizontal")}
                  >
                    Horizontal
                  </button>
                  <button
                    type="button"
                    className={`viewer-slide-layout-button${
                      slideLayoutMode === "vertical" ? " is-active" : ""
                    }`}
                    onClick={() => setSlideLayoutMode("vertical")}
                  >
                    Vertical
                  </button>
                </div>
              </>
            ) : null}
            {document ? (
              <p className="viewer-meta">
                Updated {formatDate(document.updatedAt)} ·{" "}
                {formatBytes(document.sizeBytes)}
                {tokenCountLabel ? ` · ${tokenCountLabel}` : ""}
              </p>
            ) : null}
          </div>
        </div>

        {!docId ? (
          <div className="viewer-empty">
            <p>Select a markdown file to display.</p>
          </div>
        ) : documentQuery.isPending ? (
          <div className="viewer-empty">
            <AsciiLoader label="Loading document..." />
          </div>
        ) : document ? (
          <div
            className={
              `viewer-content${isTraverseVisible ? " is-traverse-open" : ""}` +
              `${isPoseView ? " is-pose-open" : ""}`
            }
          >
            {isPoseView ? (
              <PoseSidebar
                items={traverseItems}
                selectedIndex={selectedPoseIndex}
                listRef={poseListRef}
                tiltX={poseTiltX}
                tiltY={poseTiltY}
                onTiltXChange={setPoseTiltX}
                onTiltYChange={setPoseTiltY}
                onSelect={(index) => {
                  setPoseState((previous) => ({
                    ...resolvePoseState(previous, docToken),
                    selectedIndex: clampNumber(index, 0, Math.max(0, traverseItems.length - 1)),
                  }));
                }}
              />
            ) : (
              <TraverseSidebar
                items={traverseItems}
                isOpen={isTraverseVisible}
                selectedIndex={selectedTraverseIndex}
                navigationMode={traverseNavigationMode}
                listRef={traverseListRef}
                onSelect={(index) => {
                  setTraverseState((previous) => {
                    const resolved = resolveTraverseState(previous, docToken);
                    if (traverseItems.length === 0) return resolved;
                    const clampedIndex = clampNumber(index, 0, traverseItems.length - 1);
                    const nextIndex =
                      resolved.navigationMode === "document"
                        ? (resolveTraversableSelectionIndex(traverseItems, clampedIndex)
                          ?? resolved.selectedIndex)
                        : clampedIndex;

                    return {
                      ...resolved,
                      selectedIndex: nextIndex,
                    };
                  });
                }}
                onClose={() => setIsTraverseOpen(false)}
              />
            )}
            <div
              className={
                `markdown-output${isTokenView ? " is-token-view" : ""}` +
                `${isPoseView ? " is-pose-view" : ""}` +
                `${isSlidesView ? " is-slides-view" : ""}` +
                `${isSlidesVerticalLayout ? " is-slides-vertical" : ""}`
              }
              ref={markdownOutputRef}
            >
              {isTokenView ? (
                <TokenView
                  status={tokenSession.status}
                  lines={tokenSession.tokenizedDocument.lines}
                  totalLines={tokenSession.tokenizedDocument.totalLines}
                  errorMessage={tokenSession.errorMessage}
                  markdownFallback={markdown ?? ""}
                />
              ) : isPoseView ? (
                <PoseView tiltX={poseTiltX} tiltY={poseTiltY}>
                  {renderedPoseMarkdown ?? (
                    <div className="pose-empty">
                      <p>Unable to render this element.</p>
                    </div>
                  )}
                </PoseView>
              ) : isSlidesView ? (
                <SlidesView
                  key={docToken}
                  markdown={markdown ?? ""}
                  fontScale={activeSlideFontScale}
                  layoutMode={slideLayoutMode}
                />
              ) : (
                renderedMarkdown
              )}
            </div>
          </div>
        ) : (
          <div className="viewer-empty">
            <p>Document not found.</p>
          </div>
        )}
      </article>
    </section>
  );
}

function resolveTraverseState(
  state: TraverseKeyboardState,
  docToken: string,
): TraverseKeyboardState {
  if (state.docToken === docToken) {
    return state;
  }

  return {
    docToken,
    selectedIndex: 0,
    navigationMode: "list",
  };
}

function resolvePoseState(
  state: PoseKeyboardState,
  docToken: string,
): PoseKeyboardState {
  if (state.docToken === docToken) {
    return state;
  }

  return {
    docToken,
    selectedIndex: 0,
  };
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function isTraversableItem(item: TraverseItem | undefined): boolean {
  if (!item) return false;
  return item.type !== "hr";
}

function findNextTraversableIndex(
  items: TraverseItem[],
  startIndex: number,
  direction: -1 | 1,
): number | null {
  let cursor = startIndex + direction;

  while (cursor >= 0 && cursor < items.length) {
    if (isTraversableItem(items[cursor])) return cursor;
    cursor += direction;
  }

  return null;
}

function resolveTraversableSelectionIndex(
  items: TraverseItem[],
  preferredIndex: number,
): number | null {
  if (items.length === 0) return null;

  const clampedIndex = clampNumber(preferredIndex, 0, items.length - 1);
  if (isTraversableItem(items[clampedIndex])) return clampedIndex;

  const nextIndex = findNextTraversableIndex(items, clampedIndex, 1);
  if (nextIndex !== null) return nextIndex;

  return findNextTraversableIndex(items, clampedIndex, -1);
}

function shouldIgnoreHotkeyTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest(".doc-picker-dropdown")) return true;

  const tagName = target.tagName;
  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
    return true;
  }

  return target.isContentEditable;
}

function findTraverseTargetElement(
  container: HTMLElement,
  item: TraverseItem,
): HTMLElement | null {
  if (!item.line) return null;

  const exactSelector =
    `[data-traverse-tag="${item.type}"][data-traverse-line="${item.line}"]`;
  const exactMatch = container.querySelector<HTMLElement>(exactSelector);
  if (exactMatch) return exactMatch;

  return container.querySelector<HTMLElement>(`[data-traverse-line="${item.line}"]`);
}

function createMarkdownComponents(
  selectedTraverseItem: TraverseItem | null,
): Components {
  return {
    h1: ({ node, className, ...props }) => (
      <h1
        {...props}
        {...createTraverseElementProps(node, className, "h1", selectedTraverseItem)}
      />
    ),
    h2: ({ node, className, ...props }) => (
      <h2
        {...props}
        {...createTraverseElementProps(node, className, "h2", selectedTraverseItem)}
      />
    ),
    h3: ({ node, className, ...props }) => (
      <h3
        {...props}
        {...createTraverseElementProps(node, className, "h3", selectedTraverseItem)}
      />
    ),
    h4: ({ node, className, ...props }) => (
      <h4
        {...props}
        {...createTraverseElementProps(node, className, "h4", selectedTraverseItem)}
      />
    ),
    h5: ({ node, className, ...props }) => (
      <h5
        {...props}
        {...createTraverseElementProps(node, className, "h5", selectedTraverseItem)}
      />
    ),
    h6: ({ node, className, ...props }) => (
      <h6
        {...props}
        {...createTraverseElementProps(node, className, "h6", selectedTraverseItem)}
      />
    ),
    p: ({ node, className, ...props }) => (
      <p
        {...props}
        {...createTraverseElementProps(node, className, "p", selectedTraverseItem)}
      />
    ),
    li: ({ node, className, ...props }) => (
      <li
        {...props}
        {...createTraverseElementProps(node, className, "li", selectedTraverseItem)}
      />
    ),
    blockquote: ({ node, className, ...props }) => (
      <blockquote
        {...props}
        {...createTraverseElementProps(node, className, "blockquote", selectedTraverseItem)}
      />
    ),
    table: ({ node, className, ...props }) => (
      <table
        {...props}
        {...createTraverseElementProps(node, className, "table", selectedTraverseItem)}
      />
    ),
    hr: ({ node, className, ...props }) => (
      <hr
        {...props}
        {...createTraverseElementProps(node, className, "hr", selectedTraverseItem)}
      />
    ),
    pre: ({ node, className, ...props }) => (
      <pre
        {...props}
        {...createTraverseElementProps(node, className, "code", selectedTraverseItem)}
      />
    ),
  };
}

function createTraverseElementProps(
  node: ExtraProps["node"] | undefined,
  className: string | undefined,
  tag: TraverseTag,
  selectedTraverseItem: TraverseItem | null,
) {
  const line = getNodeStartLine(node);
  const isSelected = isSelectedTraverseNode(selectedTraverseItem, tag, line);

  return {
    className: joinClassNames(className, isSelected ? "is-traverse-selected" : undefined),
    "data-traverse-tag": tag,
    "data-traverse-line": line ?? undefined,
    "data-pose-node": "",
  };
}

function getNodeStartLine(node: ExtraProps["node"] | undefined): number | null {
  const line = node?.position?.start?.line;
  return typeof line === "number" ? line : null;
}

function isSelectedTraverseNode(
  selectedTraverseItem: TraverseItem | null,
  tag: TraverseTag,
  line: number | null,
): boolean {
  if (!selectedTraverseItem) return false;
  if (!line) return false;
  return selectedTraverseItem.type === tag && selectedTraverseItem.line === line;
}

function joinClassNames(
  ...classNames: Array<string | undefined>
): string | undefined {
  const values = classNames.filter((className) => Boolean(className));
  if (values.length === 0) return undefined;
  return values.join(" ");
}

function resolveTokenCountLabel(
  isTokenTabActive: boolean,
  tokenSession: ReturnType<typeof useTokenSession>,
): string | null {
  if (!isTokenTabActive) return null;
  if (tokenSession.status === "ready") {
    return `${tokenSession.tokenizedDocument.totalTokens.toLocaleString()} tokens`;
  }

  if (tokenSession.status === "tokenizing") {
    return "tokenizing";
  }

  if (tokenSession.status === "error") {
    return "token count unavailable";
  }

  return null;
}

function materializePoseItemMarkdown(
  markdown: string,
  item: TraverseItem | null,
): string {
  if (!markdown || !item) return "";
  if (!item.line || !item.endLine) return "";

  const lines = markdown.split(/\r?\n/);
  if (lines.length === 0) return "";

  const startIndex = clampNumber(item.line - 1, 0, lines.length - 1);
  const endIndex = clampNumber(item.endLine - 1, startIndex, lines.length - 1);

  return lines.slice(startIndex, endIndex + 1).join("\n").trimEnd();
}
