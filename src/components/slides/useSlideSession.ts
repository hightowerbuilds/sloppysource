import { useCallback, useEffect, useMemo, useState } from "react";

export type SlideDirection = -1 | 1;

interface UseSlideSessionArgs {
  slideCount: number;
  layoutMode: "horizontal" | "vertical";
}

interface UseSlideSessionResult {
  currentIndex: number;
  direction: SlideDirection;
  positionLabel: string;
  goToSlide: (nextIndex: number) => void;
  isSlideHydrated: (index: number) => boolean;
}

const HYDRATION_RADIUS = 1;

export function useSlideSession({
  slideCount,
  layoutMode,
}: UseSlideSessionArgs): UseSlideSessionResult {
  const [currentIndexState, setCurrentIndexState] = useState(0);
  const [direction, setDirection] = useState<SlideDirection>(1);

  const currentIndex = slideCount > 0
    ? clampNumber(currentIndexState, 0, slideCount - 1)
    : 0;

  const hydratedRange = useMemo(() => {
    if (slideCount <= 0) {
      return { start: 0, end: -1 };
    }

    return {
      start: clampNumber(currentIndex - HYDRATION_RADIUS, 0, slideCount - 1),
      end: clampNumber(currentIndex + HYDRATION_RADIUS, 0, slideCount - 1),
    };
  }, [currentIndex, slideCount]);

  const isSlideHydrated = useCallback((index: number): boolean => {
    if (slideCount <= 0) return false;
    return index >= hydratedRange.start && index <= hydratedRange.end;
  }, [hydratedRange.end, hydratedRange.start, slideCount]);

  const goToSlide = useCallback((nextIndex: number) => {
    if (slideCount <= 0) return;

    const clamped = clampNumber(nextIndex, 0, slideCount - 1);
    if (clamped === currentIndex) return;

    setDirection(clamped > currentIndex ? 1 : -1);
    setCurrentIndexState(clamped);
  }, [currentIndex, slideCount]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (shouldIgnoreKeyboardEventTarget(event.target)) return;

      if (event.key === "ArrowRight") {
        event.preventDefault();
        goToSlide(currentIndex + 1);
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToSlide(currentIndex - 1);
        return;
      }

      if (layoutMode !== "vertical") return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        goToSlide(currentIndex + 1);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        goToSlide(currentIndex - 1);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, goToSlide, layoutMode]);

  return {
    currentIndex,
    direction,
    positionLabel: `${slideCount > 0 ? currentIndex + 1 : 0} / ${slideCount}`,
    goToSlide,
    isSlideHydrated,
  };
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function shouldIgnoreKeyboardEventTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  const tagName = target.tagName;
  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
    return true;
  }

  return target.isContentEditable;
}
