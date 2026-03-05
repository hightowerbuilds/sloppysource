import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createLazyRoute } from "@tanstack/react-router";
import { formatDate } from "../lib/format.ts";
import { projectsQueryKey } from "../lib/queryKeys.ts";
import {
  createProject,
  endProjectSession,
  exportProjectZip,
  listProjects,
} from "../lib/projectsDb.ts";
import { useAuthUser } from "../lib/useAuthUser.ts";
import "./ProjectPage.css";

export const Route = createLazyRoute("/project")({
  component: ProjectPage,
});

function ProjectPage() {
  const user = useAuthUser();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [sessionKey, setSessionKey] = useState(createDefaultSessionKey());
  const [actionError, setActionError] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<{ projectId: string; message: string } | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());

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

  const exportMutation = useMutation({
    mutationFn: exportProjectZip,
    onSuccess: (result) => {
      setActionError(null);
      startDownload(result.downloadUrl);
    },
  });

  const endSessionMutation = useMutation({
    mutationFn: endProjectSession,
    onSuccess: async () => {
      setActionError(null);
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
    if (!copyMessage) return undefined;

    const timeout = window.setTimeout(() => setCopyMessage(null), 2_500);
    return () => window.clearTimeout(timeout);
  }, [copyMessage]);

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
    createMutation.mutate({
      name: trimmedName,
      sessionKey: trimmedSessionKey,
    }, {
      onError: (error) => setActionError(error.message),
    });
  }

  function handleExport(projectId: string) {
    exportMutation.mutate(projectId, {
      onError: (error) => setActionError(error.message),
    });
  }

  function handleEndSession(projectId: string, projectName: string) {
    const shouldEnd = window.confirm(
      `End session for "${projectName}"? This triggers auto-delete of the project repo.`,
    );
    if (!shouldEnd) return;

    endSessionMutation.mutate(projectId, {
      onError: (error) => setActionError(error.message),
    });
  }

  const displayedError = actionError ?? getErrorMessage(projectsQuery.error);

  async function handleCopy(projectId: string, text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyMessage({ projectId, message: `${label} copied.` });
    } catch {
      setActionError(`Unable to copy ${label.toLowerCase()}.`);
    }
  }

  return (
    <section className="workspace">
      <article className="project-page">
        <header className="project-page-header">
          <p className="section-title">Project</p>
          <h1 className="project-page-title">Project Repos</h1>
          <p className="project-page-subtitle">
            Start a React + Bun + Vite project, export snapshots, and end sessions.
          </p>
        </header>

        <form className="project-form" onSubmit={(event) => handleCreateProject(event)}>
          <label className="project-label" htmlFor="project-name">
            Project Name
          </label>
          <input
            id="project-name"
            className="project-input"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="My game build"
            disabled={createMutation.isPending}
          />

          <label className="project-label" htmlFor="project-session-key">
            Session Key
          </label>
          <input
            id="project-session-key"
            className="project-input"
            type="text"
            value={sessionKey}
            onChange={(event) => setSessionKey(event.target.value)}
            placeholder="session-001"
            disabled={createMutation.isPending}
          />

          <button className="project-primary-button" type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Creating..." : "Start Project"}
          </button>
        </form>

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
            <ul className="project-list">
              {projects.map((project) => {
                const workflowBranchName = createBranchName(project.name);
                const repoLinks = project.githubRepoFullName
                  ? getRepoLinks(project.githubRepoFullName, workflowBranchName)
                  : null;
                const deadline = getDeadlineInfo(project.createdAt, currentTime);
                const cloneCommands = project.githubRepoFullName
                  ? `git clone https://github.com/${project.githubRepoFullName}.git
cd ${project.githubRepoFullName.split("/")[1] ?? "project"}
bun install
bun run dev`
                  : "";
                const branchCommands = project.githubRepoFullName
                  ? `git checkout -b ${workflowBranchName}
# make your changes
git add .
git commit -m "feat: describe your update"
git push -u origin ${workflowBranchName}`
                  : "";

                return (
                  <li className="project-item" key={project.id}>
                    <div className="project-item-main">
                      <p className="project-item-name">{project.name}</p>
                      <p className="project-item-meta">
                        {project.githubRepoFullName ?? "No repo linked"} · Updated{" "}
                        {formatDate(project.updatedAt)}
                      </p>
                      <p className={`project-status project-status-${project.status}`}>
                        {project.status}
                      </p>
                      {project.lastError ? (
                        <p className="project-item-error">{project.lastError}</p>
                      ) : null}

                      {repoLinks ? (
                        <details className="project-next-details">
                          <summary className="project-next-summary">
                            <span>Next Steps</span>
                            {deadline ? (
                              <span className={`project-deadline-pill project-deadline-pill-${deadline.status}`}>
                                {deadline.label}
                              </span>
                            ) : null}
                          </summary>
                          <div className="project-next-body">
                            <ol className="project-next-list">
                              <li>Pull the codebase into your editor and run locally.</li>
                            </ol>
                            <pre className="project-next-code">
                              <code>{cloneCommands}</code>
                            </pre>
                            <div className="project-next-actions">
                              <button
                                className="project-primary-button"
                                type="button"
                                onClick={() => void handleCopy(project.id, cloneCommands, "Clone commands")}
                              >
                                Copy Clone Steps
                              </button>
                              <a className="project-link-button" href={repoLinks.repoUrl} target="_blank" rel="noreferrer">
                                Open Repo
                              </a>
                            </div>

                            <ol className="project-next-list project-next-list-tight" start={2}>
                              <li>Build for up to 24 hours, then commit and push your branch.</li>
                            </ol>
                            <pre className="project-next-code">
                              <code>{branchCommands}</code>
                            </pre>
                            <div className="project-next-actions">
                              <button
                                className="project-primary-button"
                                type="button"
                                onClick={() => void handleCopy(project.id, branchCommands, "Branch workflow")}
                              >
                                Copy Branch Steps
                              </button>
                            </div>

                            <ol className="project-next-list project-next-list-tight" start={3}>
                              <li>Open a PR and share its Vercel preview URL for group review.</li>
                            </ol>
                            <div className="project-next-actions">
                              <a className="project-link-button" href={repoLinks.newPullRequestUrl} target="_blank" rel="noreferrer">
                                Open New PR
                              </a>
                              <a className="project-link-button" href={repoLinks.pullRequestsUrl} target="_blank" rel="noreferrer">
                                View Pull Requests
                              </a>
                            </div>
                            {copyMessage?.projectId === project.id ? (
                              <p className="status" role="status">{copyMessage.message}</p>
                            ) : null}
                          </div>
                        </details>
                      ) : null}
                    </div>

                    <div className="project-item-actions">
                      {project.githubRepoFullName ? (
                        <Link
                          className="project-link-button"
                          to="/project/$projectId/activity"
                          params={{ projectId: project.id }}
                        >
                          Activity
                        </Link>
                      ) : null}
                      <button
                        className="project-primary-button"
                        type="button"
                        onClick={() => handleExport(project.id)}
                        disabled={
                          exportMutation.isPending ||
                          !project.githubRepoFullName ||
                          (project.status !== "active" && project.status !== "deleting")
                        }
                      >
                        {exportMutation.isPending ? "Exporting..." : "Export ZIP"}
                      </button>
                      <button
                        className="project-end-button"
                        type="button"
                        onClick={() => handleEndSession(project.id, project.name)}
                        disabled={endSessionMutation.isPending || project.status !== "active"}
                      >
                        {endSessionMutation.isPending ? "Ending..." : "End Session"}
                      </button>
                    </div>
                  </li>
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

function getErrorMessage(error: unknown): string | null {
  if (error instanceof Error) return error.message;
  return null;
}

function startDownload(downloadUrl: string) {
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.rel = "noopener noreferrer";
  link.target = "_blank";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function createBranchName(projectName: string): string {
  const slug = projectName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 32) || "project";

  return `feature/${slug}`;
}

function getRepoLinks(repoFullName: string, branchName: string): {
  repoUrl: string;
  pullRequestsUrl: string;
  newPullRequestUrl: string;
} {
  const base = `https://github.com/${repoFullName}`;
  const encodedBranch = encodeURIComponent(branchName);

  return {
    repoUrl: base,
    pullRequestsUrl: `${base}/pulls`,
    newPullRequestUrl: `${base}/compare/main...${encodedBranch}?expand=1`,
  };
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
