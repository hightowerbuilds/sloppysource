import { useEffect, useState } from "react";
import "./AsciiLoader.css";

const DEFAULT_FRAMES = [
  "[    ]",
  "[=   ]",
  "[==  ]",
  "[=== ]",
  "[ ===]",
  "[  ==]",
  "[   =]",
];

interface AsciiLoaderProps {
  label: string;
  className?: string;
  frames?: string[];
  intervalMs?: number;
}

export function AsciiLoader({
  label,
  className,
  frames = DEFAULT_FRAMES,
  intervalMs = 120,
}: AsciiLoaderProps) {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    if (frames.length <= 1) return;

    const intervalId = window.setInterval(() => {
      setFrameIndex((previous) => (previous + 1) % frames.length);
    }, intervalMs);

    return () => window.clearInterval(intervalId);
  }, [frames, intervalMs]);

  return (
    <span className={joinClassNames("ascii-loader", className)}>
      <span className="ascii-loader-frame" aria-hidden>
        {frames[frameIndex]}
      </span>
      <span className="ascii-loader-label">{label}</span>
    </span>
  );
}

function joinClassNames(
  ...values: Array<string | undefined>
): string {
  return values.filter((value) => Boolean(value)).join(" ");
}
