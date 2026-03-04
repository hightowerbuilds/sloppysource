import { useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AsciiLoader } from "../AsciiLoader.tsx";
import {
  extractSlideOutlines,
  materializeSlideMarkdownFromLines,
  splitMarkdownLines,
} from "../../lib/slideParser.ts";
import { SLIDE_TAG_LABELS } from "../../lib/slideModels.ts";
import { useSlideSession } from "./useSlideSession.ts";
import "./SlidesView.css";

interface SlidesViewProps {
  markdown: string;
  fontScale: number;
  layoutMode: "horizontal" | "vertical";
}

const remarkPluginsConfig = [remarkGfm];

export function SlidesView({ markdown, fontScale, layoutMode }: SlidesViewProps) {
  const outlines = useMemo(() => extractSlideOutlines(markdown), [markdown]);
  const markdownLines = useMemo(() => splitMarkdownLines(markdown), [markdown]);
  const thumbnailRailRef = useRef<HTMLDivElement | null>(null);

  const {
    currentIndex,
    direction,
    positionLabel,
    goToSlide,
    isSlideHydrated,
  } = useSlideSession({
    slideCount: outlines.length,
    layoutMode,
  });

  useEffect(() => {
    if (layoutMode !== "vertical") return;

    const rail = thumbnailRailRef.current;
    if (!rail) return;

    const selectedButton = rail.querySelector<HTMLElement>(
      `[data-slide-index="${currentIndex}"]`,
    );
    selectedButton?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [currentIndex, layoutMode]);

  const activeOutline = outlines[currentIndex] ?? null;
  const isLoaded = isSlideHydrated(currentIndex);
  const activeMarkdown = useMemo(
    () => (
      activeOutline && isLoaded
        ? materializeSlideMarkdownFromLines(markdownLines, activeOutline)
        : ""
    ),
    [activeOutline, isLoaded, markdownLines],
  );
  const fontScalePercent = Math.round(fontScale * 100);

  if (outlines.length === 0) {
    return (
      <div className="slides-view slides-empty-state">
        <p>No markdown elements available for slides.</p>
      </div>
    );
  }

  return (
    <div className={`slides-view${layoutMode === "vertical" ? " is-vertical" : ""}`}>
      <div className="slides-stage-shell">
        <div className="slides-toolbar">
          <button
            type="button"
            className="slides-nav-button"
            onClick={() => goToSlide(currentIndex - 1)}
            disabled={currentIndex <= 0}
            aria-label={layoutMode === "vertical" ? "Previous thumbnail" : "Previous slide"}
          >
            {layoutMode === "vertical" ? "↑" : "Prev"}
          </button>
          <p className="slides-position">Slide {positionLabel}</p>
          <button
            type="button"
            className="slides-nav-button"
            onClick={() => goToSlide(currentIndex + 1)}
            disabled={currentIndex >= outlines.length - 1}
            aria-label={layoutMode === "vertical" ? "Next thumbnail" : "Next slide"}
          >
            {layoutMode === "vertical" ? "↓" : "Next"}
          </button>
        </div>

        <div className="slides-stage" aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            {activeOutline ? (
              <motion.article
                key={activeOutline.id}
                className="slides-card"
                initial={{
                  opacity: 0,
                  y: direction > 0 ? 14 : -14,
                }}
                animate={{
                  opacity: 1,
                  y: 0,
                  transition: {
                    duration: 0.22,
                    ease: [0.22, 1, 0.36, 1],
                  },
                }}
                exit={{
                  opacity: 0,
                  y: direction > 0 ? -10 : 10,
                  transition: {
                    duration: 0.14,
                    ease: [0.4, 0, 1, 1],
                  },
                }}
              >
                <header className="slides-card-header">
                  <span className="slides-card-tag">{SLIDE_TAG_LABELS[activeOutline.tag]}</span>
                  <span className="slides-card-line">
                    L{activeOutline.startLine}
                    {activeOutline.endLine !== activeOutline.startLine
                      ? `-${activeOutline.endLine}`
                      : ""}
                  </span>
                </header>

                <div className="slides-card-content">
                  {isLoaded ? (
                    <div className="slides-markdown" style={{ fontSize: `${fontScalePercent}%` }}>
                      <ReactMarkdown remarkPlugins={remarkPluginsConfig}>
                        {activeMarkdown}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <div className="slides-card-loading">
                      <AsciiLoader label="Loading slide..." />
                    </div>
                  )}
                </div>
              </motion.article>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      <div
        className="slides-thumbnails"
        role="tablist"
        aria-label="Slide thumbnails"
        ref={thumbnailRailRef}
      >
        {outlines.map((outline, index) => (
          <button
            key={outline.id}
            type="button"
            role="tab"
            aria-selected={index === currentIndex}
            className={`slides-thumbnail${index === currentIndex ? " is-active" : ""}`}
            onClick={() => goToSlide(index)}
            data-slide-index={index}
          >
            <span className="slides-thumbnail-meta">
              <span className="slides-thumbnail-index">{index + 1}</span>
              <span className="slides-thumbnail-tag">{SLIDE_TAG_LABELS[outline.tag]}</span>
            </span>
            <span className="slides-thumbnail-text">{outline.preview}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
