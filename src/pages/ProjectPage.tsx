import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createLazyRoute } from "@tanstack/react-router";
import { motion, useReducedMotion } from "framer-motion";
import { formatDate } from "../lib/format.ts";
import { projectsQueryKey } from "../lib/queryKeys.ts";
import { createProject, listProjects } from "../lib/projectsDb.ts";
import { useAuthUser } from "../lib/useAuthUser.ts";
import "./ProjectPage.css";

export const Route = createLazyRoute("/project")({
  component: ProjectPage,
});

type MotionBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

type MotionPoint = {
  x: number;
  y: number;
};

const INPUT_IDLE_DELAY_MS = 69_000;
const THUMBNAIL_IDLE_DELAY_MS = 70_000;
const CODE_BLOCK_IDLE_DELAY_MS = 71_000;
const TEXT_FONT_CYCLE_IDLE_DELAY_MS = 73_000;
const PANIC_BUTTON_IDLE_DELAY_MS = 80_000;

function ProjectPage() {
  const user = useAuthUser();
  const userId = user?.id ?? null;
  const shouldReduceMotion = useReducedMotion();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [sessionKey, setSessionKey] = useState(createDefaultSessionKey());
  const [actionError, setActionError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [isInputCollisionEnabled, setIsInputCollisionEnabled] = useState(false);
  const [isFloatingEnabled, setIsFloatingEnabled] = useState(false);
  const [isCodeBlockFloatingEnabled, setIsCodeBlockFloatingEnabled] = useState(false);
  const [isTextFontCycleEnabled, setIsTextFontCycleEnabled] = useState(false);
  const [isPanicButtonEnabled, setIsPanicButtonEnabled] = useState(false);
  const [panicButtonMessageIndex, setPanicButtonMessageIndex] = useState(0);
  const [idleCountdownNowMs, setIdleCountdownNowMs] = useState(() => Date.now());
  const [nextFreakoutAtMs, setNextFreakoutAtMs] = useState(() => Date.now() + INPUT_IDLE_DELAY_MS);
  const thumbRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const panicButtonRef = useRef<HTMLButtonElement | null>(null);
  const [motionBoundsById, setMotionBoundsById] = useState<Record<string, MotionBounds>>({});
  const [panicButtonTarget, setPanicButtonTarget] = useState<MotionPoint>({ x: 0, y: 0 });

  const projectsQuery = useQuery({
    queryKey: projectsQueryKey(userId),
    queryFn: listProjects,
    staleTime: 15_000,
    enabled: !!userId,
  });

  const createMutation = useMutation({
    mutationFn: createProject,
    onSuccess: async () => {
      setActionError(null);
      setName("");
      setSessionKey(createDefaultSessionKey());
      await queryClient.invalidateQueries({ queryKey: projectsQueryKey(userId) });
    },
  });

  const projects = useMemo(
    () => (projectsQuery.data ?? []).filter((project) => project.status !== "deleted"),
    [projectsQuery.data],
  );
  const activeCount = projects.filter((project) => project.status === "active").length;

  useEffect(() => {
    const interval = window.setInterval(() => setCurrentTime(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (shouldReduceMotion) return undefined;

    const inputIdleDelayMs = INPUT_IDLE_DELAY_MS;
    const thumbnailIdleDelayMs = THUMBNAIL_IDLE_DELAY_MS;
    const codeBlockIdleDelayMs = CODE_BLOCK_IDLE_DELAY_MS;
    const textFontCycleIdleDelayMs = TEXT_FONT_CYCLE_IDLE_DELAY_MS;
    const panicButtonIdleDelayMs = PANIC_BUTTON_IDLE_DELAY_MS;
    let inputTimeoutId = window.setTimeout(
      () => setIsInputCollisionEnabled(true),
      inputIdleDelayMs,
    );
    let thumbnailTimeoutId = window.setTimeout(
      () => setIsFloatingEnabled(true),
      thumbnailIdleDelayMs,
    );
    let codeBlockTimeoutId = window.setTimeout(
      () => setIsCodeBlockFloatingEnabled(true),
      codeBlockIdleDelayMs,
    );
    let textFontCycleTimeoutId = window.setTimeout(
      () => setIsTextFontCycleEnabled(true),
      textFontCycleIdleDelayMs,
    );
    let panicButtonTimeoutId = window.setTimeout(
      () => setIsPanicButtonEnabled(true),
      panicButtonIdleDelayMs,
    );

    const markActivity = () => {
      setIsInputCollisionEnabled(false);
      setIsFloatingEnabled(false);
      setIsCodeBlockFloatingEnabled(false);
      setIsTextFontCycleEnabled(false);
      setIsPanicButtonEnabled(false);
      setPanicButtonMessageIndex(0);
      setNextFreakoutAtMs(Date.now() + INPUT_IDLE_DELAY_MS);
      window.clearTimeout(inputTimeoutId);
      window.clearTimeout(thumbnailTimeoutId);
      window.clearTimeout(codeBlockTimeoutId);
      window.clearTimeout(textFontCycleTimeoutId);
      window.clearTimeout(panicButtonTimeoutId);
      inputTimeoutId = window.setTimeout(
        () => setIsInputCollisionEnabled(true),
        inputIdleDelayMs,
      );
      thumbnailTimeoutId = window.setTimeout(
        () => setIsFloatingEnabled(true),
        thumbnailIdleDelayMs,
      );
      codeBlockTimeoutId = window.setTimeout(
        () => setIsCodeBlockFloatingEnabled(true),
        codeBlockIdleDelayMs,
      );
      textFontCycleTimeoutId = window.setTimeout(
        () => setIsTextFontCycleEnabled(true),
        textFontCycleIdleDelayMs,
      );
      panicButtonTimeoutId = window.setTimeout(
        () => setIsPanicButtonEnabled(true),
        panicButtonIdleDelayMs,
      );
    };

    const activityEvents: Array<keyof WindowEventMap> = [
      "pointerdown",
      "keydown",
      "wheel",
      "scroll",
      "touchstart",
      "input",
    ];

    for (const eventName of activityEvents) {
      window.addEventListener(eventName, markActivity);
    }

    return () => {
      window.clearTimeout(inputTimeoutId);
      window.clearTimeout(thumbnailTimeoutId);
      window.clearTimeout(codeBlockTimeoutId);
      window.clearTimeout(textFontCycleTimeoutId);
      window.clearTimeout(panicButtonTimeoutId);
      for (const eventName of activityEvents) {
        window.removeEventListener(eventName, markActivity);
      }
    };
  }, [shouldReduceMotion]);

  useEffect(() => {
    if (shouldReduceMotion) return undefined;

    const intervalId = window.setInterval(() => {
      setIdleCountdownNowMs(Date.now());
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [shouldReduceMotion]);

  useEffect(() => {
    if (shouldReduceMotion || projects.length === 0) return undefined;

    const edgePadding = 10;
    let animationFrameId = 0;

    const updateBounds = () => {
      animationFrameId = 0;

      setMotionBoundsById((previous) => {
        const next: Record<string, MotionBounds> = {};
        let hasChanged = Object.keys(previous).length !== projects.length;

        for (const project of projects) {
          const element = thumbRefs.current[project.id];
          if (!element) continue;

          const rect = element.getBoundingClientRect();
          const measuredBounds = normalizeMotionBounds({
            minX: edgePadding - rect.left,
            maxX: window.innerWidth - edgePadding - rect.right,
            minY: edgePadding - rect.top,
            maxY: window.innerHeight - edgePadding - rect.bottom,
          });

          next[project.id] = measuredBounds;
          const previousBounds = previous[project.id];
          if (!previousBounds || !isSameMotionBounds(previousBounds, measuredBounds)) {
            hasChanged = true;
          }
        }

        if (!hasChanged) return previous;
        return next;
      });
    };

    const scheduleBoundsUpdate = () => {
      if (animationFrameId !== 0) return;
      animationFrameId = window.requestAnimationFrame(updateBounds);
    };

    scheduleBoundsUpdate();

    window.addEventListener("resize", scheduleBoundsUpdate);
    window.addEventListener("scroll", scheduleBoundsUpdate, { passive: true });

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => scheduleBoundsUpdate());
      for (const project of projects) {
        const element = thumbRefs.current[project.id];
        if (element) observer.observe(element);
      }
    }

    return () => {
      if (animationFrameId !== 0) window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", scheduleBoundsUpdate);
      window.removeEventListener("scroll", scheduleBoundsUpdate);
      observer?.disconnect();
    };
  }, [projects, shouldReduceMotion]);

  useEffect(() => {
    if (shouldReduceMotion || !isPanicButtonEnabled || createMutation.isPending) return undefined;

    const intervalId = window.setInterval(() => {
      setPanicButtonMessageIndex((previous) => ((previous + 1) % 2));
    }, 1_080);

    return () => window.clearInterval(intervalId);
  }, [createMutation.isPending, isPanicButtonEnabled, shouldReduceMotion]);

  useEffect(() => {
    if (shouldReduceMotion || !isPanicButtonEnabled || createMutation.isPending) return undefined;

    const viewportPadding = 18;
    let animationFrameId = 0;

    const updateTarget = () => {
      animationFrameId = 0;
      const button = panicButtonRef.current;
      if (!button) return;

      const rect = button.getBoundingClientRect();
      const nextTarget: MotionPoint = {
        x: clamp(window.innerWidth - viewportPadding - rect.right, 0, window.innerWidth),
        y: clamp(window.innerHeight - viewportPadding - rect.bottom, 0, window.innerHeight),
      };

      setPanicButtonTarget((previous) => {
        if (isSameMotionPoint(previous, nextTarget)) return previous;
        return nextTarget;
      });
    };

    const scheduleTargetUpdate = () => {
      if (animationFrameId !== 0) return;
      animationFrameId = window.requestAnimationFrame(updateTarget);
    };

    scheduleTargetUpdate();
    window.addEventListener("resize", scheduleTargetUpdate);
    window.addEventListener("scroll", scheduleTargetUpdate, { passive: true });

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => scheduleTargetUpdate());
      const button = panicButtonRef.current;
      if (button) observer.observe(button);
    }

    return () => {
      if (animationFrameId !== 0) window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", scheduleTargetUpdate);
      window.removeEventListener("scroll", scheduleTargetUpdate);
      observer?.disconnect();
    };
  }, [createMutation.isPending, isPanicButtonEnabled, shouldReduceMotion]);

  function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedName = name.trim();
    const trimmedSessionKey = sessionKey.trim();

    if (!trimmedName) {
      setActionError("Project name is required.");
      return;
    }

    if (!trimmedSessionKey) {
      setActionError("Session key is required.");
      return;
    }

    setActionError(null);
    createMutation.mutate(
      {
        name: trimmedName,
        sessionKey: trimmedSessionKey,
      },
      {
        onError: (error) => setActionError(error.message),
      },
    );
  }

  const displayedError = actionError ?? getErrorMessage(projectsQuery.error);
  const shouldAnimateInputCollision = !shouldReduceMotion && isInputCollisionEnabled;
  const shouldAnimateThumbnails = !shouldReduceMotion && isFloatingEnabled;
  const shouldAnimateCodeBlock = !shouldReduceMotion && isCodeBlockFloatingEnabled;
  const shouldAnimateHeading = !shouldReduceMotion && isCodeBlockFloatingEnabled;
  const shouldAnimateTextFontCycle = !shouldReduceMotion && isTextFontCycleEnabled;
  const shouldAnimatePanicButton = !shouldReduceMotion && isPanicButtonEnabled && !createMutation.isPending;
  const codeBlockFloatMotion = getCodeBlockFloatMotion();
  const freakoutCountdownMs = Math.max(0, nextFreakoutAtMs - idleCountdownNowMs);
  const panicButtonLabel = createMutation.isPending
    ? "Creating..."
    : shouldAnimatePanicButton
      ? (panicButtonMessageIndex === 0 ? "WHAT ARE YOU DOING!!" : "HELP ME!!")
      : "Start Project";

  return (
    <section className="workspace">
      <article className={`project-page${shouldAnimateTextFontCycle ? " project-page-font-cycle" : ""}`}>
        <div className="project-page-top">
          <div className="project-page-left-column">
            <header className="project-page-header">
              <motion.h1
                className={`project-page-title project-page-title-dance${
                  shouldAnimateHeading ? " is-active" : ""
                }`}
                animate={
                  shouldAnimateHeading
                    ? {
                      x: [0, 5, -6, 4, 0],
                      y: [0, -4, 3, -3, 0],
                      scale: [1, 1.2, 0.97, 1.13, 1],
                      rotate: [0, -2.4, 2.2, -1.7, 0],
                    }
                    : {
                      x: 0,
                      y: 0,
                      scale: 1,
                      rotate: 0,
                    }
                }
                transition={
                  shouldAnimateHeading
                    ? {
                      duration: 2.9,
                      ease: "easeInOut",
                      repeat: Number.POSITIVE_INFINITY,
                      repeatType: "loop",
                    }
                    : {
                      duration: 0.35,
                      ease: "easeOut",
                    }
                }
              >
                Sloppy Projects
              </motion.h1>
              <div className="project-page-intro">
                <p className="project-page-subtitle">
                  There are some guidelines to keep things simple.
                  <br />
                  1. Everyone uses the same DB. I recommend supabase.
                  <br />
                  2. No assets go on the repo. Everything to the cloud. Code to github, data/storage to
                  supabase.
                  <br />
                  3. KISSgf Method: keep it simple, stupid, good fun.
                  <br />
                  4. begin on the builder branch and end on the main branch which is hosted.
                </p>
                <motion.pre
                  className="project-page-intro-code"
                  animate={
                    shouldAnimateCodeBlock
                      ? {
                        x: codeBlockFloatMotion.x,
                        y: codeBlockFloatMotion.y,
                        rotate: codeBlockFloatMotion.rotate,
                        scale: codeBlockFloatMotion.scale,
                      }
                      : {
                        x: 0,
                        y: 0,
                        rotate: 0,
                        scale: 1,
                      }
                  }
                  transition={
                    shouldAnimateCodeBlock
                      ? {
                        duration: codeBlockFloatMotion.duration,
                        ease: "linear",
                        repeat: Number.POSITIVE_INFINITY,
                        repeatType: "loop",
                        delay: codeBlockFloatMotion.delay,
                      }
                      : {
                        duration: 0.45,
                        ease: "easeOut",
                      }
                  }
                >
                  <code>{`git checkout main
git merge builder
git push origin main`}</code>
                </motion.pre>
                <p className="project-page-subtitle">
                  Here's what to anticipate:
                  <br />
                  - this page is going to freak out in t-minus{" "}
                  <span className="project-page-countdown">
                    {formatCountdownLabel(freakoutCountdownMs)}
                  </span>
                  .
                  <br />
                  - commit messages will display in real-time
                </p>
              </div>
            </header>

            <form className="project-form" onSubmit={(event) => handleCreateProject(event)}>
              <label className="project-label" htmlFor="project-name">
                Project Name
              </label>
              <motion.input
                id="project-name"
                className="project-input"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="My game build"
                disabled={createMutation.isPending}
                animate={
                  shouldAnimateInputCollision
                    ? {
                      y: [0, 0, 14, 9, 14, 0, 0],
                      scale: [1, 1.02, 0.99, 1.01, 0.99, 1.02, 1],
                      borderColor: [
                        "rgba(175, 190, 220, 0.25)",
                        "rgba(175, 190, 220, 0.25)",
                        "rgba(255, 177, 127, 0.92)",
                        "rgba(175, 190, 220, 0.45)",
                        "rgba(255, 177, 127, 0.92)",
                        "rgba(175, 190, 220, 0.25)",
                        "rgba(175, 190, 220, 0.25)",
                      ],
                      boxShadow: [
                        "0 0 0 rgba(255, 177, 127, 0)",
                        "0 0 0 rgba(255, 177, 127, 0)",
                        "0 0 22px rgba(255, 177, 127, 0.78)",
                        "0 0 8px rgba(255, 177, 127, 0.28)",
                        "0 0 22px rgba(255, 177, 127, 0.78)",
                        "0 0 0 rgba(255, 177, 127, 0)",
                        "0 0 0 rgba(255, 177, 127, 0)",
                      ],
                    }
                    : {
                      y: 0,
                      scale: 1,
                      borderColor: "rgba(175, 190, 220, 0.25)",
                      boxShadow: "0 0 0 rgba(255, 177, 127, 0)",
                    }
                }
                transition={
                  shouldAnimateInputCollision
                    ? {
                      duration: 1.08,
                      times: [0, 0.16, 0.3, 0.48, 0.62, 0.82, 1],
                      ease: "linear",
                      repeat: Number.POSITIVE_INFINITY,
                      repeatType: "loop",
                    }
                    : {
                      duration: 0.35,
                      ease: "easeOut",
                    }
                }
              />

              <label className="project-label" htmlFor="project-session-key">
                Session Key
              </label>
              <motion.input
                id="project-session-key"
                className="project-input"
                type="text"
                value={sessionKey}
                onChange={(event) => setSessionKey(event.target.value)}
                placeholder="session-001"
                disabled={createMutation.isPending}
                animate={
                  shouldAnimateInputCollision
                    ? {
                      y: [0, 0, -14, -9, -14, 0, 0],
                      scale: [1, 1.02, 0.99, 1.01, 0.99, 1.02, 1],
                      borderColor: [
                        "rgba(175, 190, 220, 0.25)",
                        "rgba(175, 190, 220, 0.25)",
                        "rgba(255, 177, 127, 0.92)",
                        "rgba(175, 190, 220, 0.45)",
                        "rgba(255, 177, 127, 0.92)",
                        "rgba(175, 190, 220, 0.25)",
                        "rgba(175, 190, 220, 0.25)",
                      ],
                      boxShadow: [
                        "0 0 0 rgba(255, 177, 127, 0)",
                        "0 0 0 rgba(255, 177, 127, 0)",
                        "0 0 22px rgba(255, 177, 127, 0.78)",
                        "0 0 8px rgba(255, 177, 127, 0.28)",
                        "0 0 22px rgba(255, 177, 127, 0.78)",
                        "0 0 0 rgba(255, 177, 127, 0)",
                        "0 0 0 rgba(255, 177, 127, 0)",
                      ],
                    }
                    : {
                      y: 0,
                      scale: 1,
                      borderColor: "rgba(175, 190, 220, 0.25)",
                      boxShadow: "0 0 0 rgba(255, 177, 127, 0)",
                    }
                }
                transition={
                  shouldAnimateInputCollision
                    ? {
                      duration: 1.08,
                      times: [0, 0.16, 0.3, 0.48, 0.62, 0.82, 1],
                      ease: "linear",
                      repeat: Number.POSITIVE_INFINITY,
                      repeatType: "loop",
                    }
                    : {
                      duration: 0.35,
                      ease: "easeOut",
                    }
                }
              />

              <motion.button
                ref={panicButtonRef}
                className={`project-primary-button${shouldAnimatePanicButton ? " is-panic" : ""}`}
                type="submit"
                disabled={createMutation.isPending}
                animate={
                  shouldAnimatePanicButton
                    ? {
                      x: [
                        panicButtonTarget.x,
                        panicButtonTarget.x + 12,
                        panicButtonTarget.x - 7,
                        panicButtonTarget.x + 4,
                        panicButtonTarget.x,
                      ],
                      y: [
                        panicButtonTarget.y,
                        panicButtonTarget.y - 8,
                        panicButtonTarget.y + 4,
                        panicButtonTarget.y - 6,
                        panicButtonTarget.y,
                      ],
                      rotate: [0, -2.8, 1.9, -1.8, 0],
                      scale: [1, 1.07, 0.98, 1.04, 1],
                      boxShadow: [
                        "0 0 0 rgba(255, 123, 123, 0)",
                        "0 0 24px rgba(255, 123, 123, 0.82)",
                        "0 0 10px rgba(255, 123, 123, 0.36)",
                        "0 0 20px rgba(255, 123, 123, 0.72)",
                        "0 0 0 rgba(255, 123, 123, 0)",
                      ],
                    }
                    : {
                      x: 0,
                      y: 0,
                      rotate: 0,
                      scale: 1,
                      boxShadow: "0 0 0 rgba(255, 123, 123, 0)",
                    }
                }
                transition={
                  shouldAnimatePanicButton
                    ? {
                      duration: 1.08,
                      ease: "linear",
                      repeat: Number.POSITIVE_INFINITY,
                      repeatType: "loop",
                    }
                    : {
                      duration: 0.42,
                      ease: "easeOut",
                    }
                }
              >
                {panicButtonLabel}
              </motion.button>
            </form>
          </div>
        </div>

        <section className="project-page-panel" aria-label="Project list">
          <div className="project-list-header">
            <p className="project-list-title">Your Projects</p>
            <span className="library-count">{activeCount} active</span>
          </div>

          {displayedError ? (
            <p className="status error" role="status">
              {displayedError}
            </p>
          ) : null}

          {projectsQuery.isPending ? <p className="empty">Loading projects...</p> : null}

          {!projectsQuery.isPending && projects.length === 0 ? (
            <p className="empty">No projects yet. Start your first project above.</p>
          ) : null}

          {!projectsQuery.isPending && projects.length > 0 ? (
            <ul className="project-thumb-list">
              {projects.map((project, index) => {
                const deadline = getDeadlineInfo(project.createdAt, currentTime);
                const clockLabel = deadline?.label ?? "Clock unavailable";
                const repoLabel = project.githubRepoFullName
                  ? `github.com/${project.githubRepoFullName}`
                  : "No repo linked";
                const floatMotion = getProjectFloatMotion(
                  index,
                  motionBoundsById[project.id],
                  project.status === "active",
                );

                return (
                  <motion.li
                    className="project-thumb-item"
                    key={project.id}
                    ref={(element) => {
                      thumbRefs.current[project.id] = element;
                    }}
                    animate={
                      shouldAnimateThumbnails
                        ? {
                          x: floatMotion.x,
                          y: floatMotion.y,
                          rotate: floatMotion.rotate,
                          scale: floatMotion.scale,
                        }
                        : {
                          x: 0,
                          y: 0,
                          rotate: 0,
                          scale: 1,
                        }
                    }
                    transition={
                      shouldAnimateThumbnails
                        ? {
                          duration: floatMotion.duration,
                          ease: "linear",
                          repeat: Number.POSITIVE_INFINITY,
                          repeatType: "loop",
                          delay: floatMotion.delay,
                        }
                        : {
                          duration: 0.45,
                          ease: "easeOut",
                        }
                    }
                  >
                    <Link
                      className="project-thumb-card"
                      to="/project/$projectId/activity"
                      params={{ projectId: project.id }}
                    >
                      <div className="project-thumb-top">
                        <p className={`project-status project-status-${project.status}`}>
                          {project.status}
                        </p>
                        <p
                          className={`project-thumb-clock${
                            deadline ? ` project-thumb-clock-${deadline.status}` : ""
                          }`}
                        >
                          {clockLabel}
                        </p>
                      </div>
                      <p className="project-thumb-title">{project.name}</p>
                      <p className="project-thumb-repo">{repoLabel}</p>
                      <p className="project-thumb-meta">Updated {formatDate(project.updatedAt)}</p>
                      {project.lastError ? (
                        <p className="project-thumb-error">{project.lastError}</p>
                      ) : null}
                    </Link>
                  </motion.li>
                );
              })}
            </ul>
          ) : null}
        </section>
      </article>
    </section>
  );
}

function createDefaultSessionKey(): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `session-${stamp}`;
}

function getCodeBlockFloatMotion(): {
  x: string[];
  y: string[];
  rotate: number[];
  scale: number[];
  duration: number;
  delay: number;
} {
  return {
    x: ["0vw", "16vw", "38vw", "52vw", "26vw", "2vw", "-8vw", "0vw"],
    y: ["0vh", "-8vh", "-16vh", "-26vh", "-22vh", "-14vh", "-10vh", "0vh"],
    rotate: [0, -1.3, 1.2, -1.5, 1.1, -0.9, 0.6, 0],
    scale: [1, 1.01, 0.995, 1.018, 1.004, 1.008, 0.996, 1],
    duration: 19,
    delay: 0,
  };
}

function getProjectFloatMotion(index: number, bounds?: MotionBounds, isActive = false): {
  x: number[];
  y: number[];
  rotate: number[];
  scale: number[];
  duration: number;
  delay: number;
} {
  const normalizedBounds = normalizeMotionBounds(
    bounds ?? { minX: -140, maxX: 140, minY: -90, maxY: 90 },
  );
  const constrainedBounds = insetMotionBounds(
    normalizedBounds,
    isActive ? 42 : 18,
    isActive ? 34 : 16,
  );

  const edgeFactor = isActive ? 0.92 : 0.97;
  const left = constrainedBounds.minX * edgeFactor;
  const right = constrainedBounds.maxX * edgeFactor;
  const top = constrainedBounds.minY * (isActive ? 0.94 : 1);
  const bottom = constrainedBounds.maxY * (isActive ? 0.2 : 0.3);

  const innerLeft = lerp(left, right, 0.26);
  const innerRight = lerp(left, right, 0.74);
  const innerTop = lerp(top, bottom, 0.08);
  const innerBottom = lerp(top, bottom, 0.38);

  const baseX = [left, innerLeft, right, right, innerRight, left, left, innerLeft];
  const baseY = [top, top, innerTop, innerBottom, bottom, innerBottom, innerTop, top];
  const baseRotate = isActive
    ? [0.35, -0.7, 0.62, -0.58, 0.52, -0.64, 0.46, -0.32]
    : [0.75, -1.35, 1.1, -1.1, 1.0, -1.2, 0.8, -0.6];
  const baseScale = isActive
    ? [1, 1.005, 0.996, 1.007, 1, 1.006, 0.997, 1]
    : [1, 1.01, 0.992, 1.013, 1, 1.01, 0.995, 1];

  const offset = (index * 2) % baseX.length;
  const loopX = shiftLoop(baseX, offset);
  const loopY = shiftLoop(baseY, offset);
  const loopRotate = shiftLoop(baseRotate, offset);
  const loopScale = shiftLoop(baseScale, offset);

  return {
    x: [...loopX, loopX[0]],
    y: [...loopY, loopY[0]],
    rotate: [...loopRotate, loopRotate[0]],
    scale: [...loopScale, loopScale[0]],
    duration: (isActive ? 16.5 : 15) + (index % 4) * 1.1,
    delay: (index % 5) * 0.2,
  };
}

function normalizeMotionBounds(bounds: MotionBounds): MotionBounds {
  const minX = Number.isFinite(bounds.minX) ? bounds.minX : 0;
  const maxX = Number.isFinite(bounds.maxX) ? bounds.maxX : 0;
  const minY = Number.isFinite(bounds.minY) ? bounds.minY : 0;
  const maxY = Number.isFinite(bounds.maxY) ? bounds.maxY : 0;

  return {
    minX: Math.min(minX, maxX),
    maxX: Math.max(minX, maxX),
    minY: Math.min(minY, maxY),
    maxY: Math.max(minY, maxY),
  };
}

function isSameMotionBounds(left: MotionBounds, right: MotionBounds): boolean {
  return (
    Math.abs(left.minX - right.minX) < 0.5 &&
    Math.abs(left.maxX - right.maxX) < 0.5 &&
    Math.abs(left.minY - right.minY) < 0.5 &&
    Math.abs(left.maxY - right.maxY) < 0.5
  );
}

function insetMotionBounds(bounds: MotionBounds, insetX: number, insetY: number): MotionBounds {
  const width = Math.max(0, bounds.maxX - bounds.minX);
  const height = Math.max(0, bounds.maxY - bounds.minY);
  const clampedInsetX = Math.max(0, Math.min(insetX, Math.max(0, ((width - 4) / 2))));
  const clampedInsetY = Math.max(0, Math.min(insetY, Math.max(0, ((height - 4) / 2))));

  return {
    minX: bounds.minX + clampedInsetX,
    maxX: bounds.maxX - clampedInsetX,
    minY: bounds.minY + clampedInsetY,
    maxY: bounds.maxY - clampedInsetY,
  };
}

function isSameMotionPoint(left: MotionPoint, right: MotionPoint): boolean {
  return Math.abs(left.x - right.x) < 0.5 && Math.abs(left.y - right.y) < 0.5;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(start: number, end: number, amount: number): number {
  return start + ((end - start) * amount);
}

function shiftLoop(values: number[], offset: number): number[] {
  if (values.length === 0) return [];
  const normalizedOffset = ((offset % values.length) + values.length) % values.length;
  return [...values.slice(normalizedOffset), ...values.slice(0, normalizedOffset)];
}

function formatCountdownLabel(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function getErrorMessage(error: unknown): string | null {
  if (error instanceof Error) return error.message;
  return null;
}

function getDeadlineInfo(createdAt: string | null, nowMs: number): {
  label: string;
  status: "ok" | "warning" | "expired";
} | null {
  if (!createdAt) return null;

  const createdAtMs = Date.parse(createdAt);
  if (Number.isNaN(createdAtMs)) return null;

  const deadlineMs = createdAtMs + (24 * 60 * 60 * 1000);
  const remainingMs = deadlineMs - nowMs;

  if (remainingMs <= 0) {
    return {
      label: "24h window expired",
      status: "expired",
    };
  }

  const totalMinutes = Math.ceil(remainingMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const status = hours < 4 ? "warning" : "ok";

  return {
    label: `${hours}h ${minutes}m left`,
    status,
  };
}
