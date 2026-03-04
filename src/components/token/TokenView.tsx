import { useMemo } from "react";
import type { TokenLine } from "../../lib/tokenModels.ts";
import { AsciiLoader } from "../AsciiLoader.tsx";
import {
  buildTokenDisplayRows,
  formatDisplayRowLineLabel,
} from "./tokenViewRows.ts";
import "./TokenView.css";

interface TokenViewProps {
  status: "idle" | "tokenizing" | "ready" | "error";
  lines: TokenLine[];
  totalLines: number;
  errorMessage: string | null;
  markdownFallback: string;
}

const LINE_HEIGHT_PX = 28;

export function TokenView({
  status,
  lines,
  totalLines,
  errorMessage,
  markdownFallback,
}: TokenViewProps) {
  const visibleRows = useMemo(() => buildTokenDisplayRows(lines), [lines]);

  if (status === "error") {
    return (
      <div className="token-view token-view-state">
        <p className="token-view-message">Tokenization failed: {errorMessage ?? "Unknown error."}</p>
        <pre className="token-view-fallback">
          <code>{markdownFallback}</code>
        </pre>
      </div>
    );
  }

  if (status === "tokenizing") {
    return (
      <div className="token-view token-view-state">
        <AsciiLoader label="Tokenizing markdown with o200k rules..." />
      </div>
    );
  }

  if (status !== "ready") {
    return (
      <div className="token-view token-view-state">
        <p className="token-view-message">Open Token View to inspect model-style tokens.</p>
      </div>
    );
  }

  return (
    <div className="token-view">
      <div className="token-view-scroll">
        {visibleRows.map((row) => (
          <div className="token-view-line" key={row.key} style={{ minHeight: LINE_HEIGHT_PX }}>
            <span className="token-view-line-number">
              {formatDisplayRowLineLabel(row)}
            </span>
            {row.type === "collapsed-empty" ? (
              <span className="token-view-line-content token-view-collapsed">
                blank
              </span>
            ) : (
              <span className="token-view-line-content">
                {row.line.tokens.length === 0 ? (
                  <span className="token-view-empty-line"> </span>
                ) : (
                  row.line.tokens.map((segment) => (
                    <span className="token-view-token" key={segment.sequence}>
                      {renderVisibleWhitespace(segment.text)}
                    </span>
                  ))
                )}
              </span>
            )}
          </div>
        ))}
      </div>
      <p className="token-view-range">
        showing lines 1-{Math.max(totalLines, 1)} of {Math.max(totalLines, 1)}
      </p>
    </div>
  );
}

function renderVisibleWhitespace(value: string): string {
  return value
    .replace(/\t/g, "→   ")
    .replace(/ /g, "·");
}
