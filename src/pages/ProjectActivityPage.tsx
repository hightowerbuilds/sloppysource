import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createLazyRoute } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { formatDate } from "../lib/format.ts";
import {
  projectActivityQueryKey,
  projectMarkdownFileQueryKey,
  projectsQueryKey,
} from "../lib/queryKeys.ts";
import {
  endProjectSession,
  exportProjectZip,
  getProjectGitHubActivity,
  getProjectMarkdownFile,
  listProjects,
} from "../lib/projectsDb.ts";
import { useAuthUser } from "../lib/useAuthUser.ts";
import "./ProjectActivityPage.css";

export const Route = createLazyRoute("/project/$projectId/activity")({
  component: ProjectActivityPage,
});

type ActivityWindow = "next-steps" | "pull-requests" | "checks" | "lifecycle-events";
const markdownRemarkPlugins = [remarkGfm];

function ProjectActivityPage() {
  const { projectId } = Route.useParams();
  const user = useAuthUser();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [activeWindow, setActiveWindow] = useState<ActivityWindow>("next-steps");
  const [isCommitsCollapsed, setIsCommitsCollapsed] = useState(true);
  const [isMoreGithubCollapsed, setIsMoreGithubCollapsed] = useState(false);
  const [isWorkspaceCollapsed, setIsWorkspaceCollapsed] = useState(true);
  const [isMarkdownCollapsed, setIsMarkdownCollapsed] = useState(true);
  const [selectedMarkdownPath, setSelectedMarkdownPath] = useState<string | null>(null);

  const activityQuery = useQuery({
    queryKey: projectActivityQueryKey(userId, projectId),
    queryFn: () => getProjectGitHubActivity(projectId),
    staleTime: 15_000,
    enabled: !!userId,
  });

  const projectsQuery = useQuery({
    queryKey: projectsQueryKey(userId),
    queryFn: listProjects,
    staleTime: 15_000,
    enabled: !!userId,
  });

  const activity = activityQuery.data;
  const mostRecentCommitTimestamp = useMemo(() => {
    const commits = activity?.commits ?? [];
    if (commits.length === 0) return null;

    let latestCommittedAt: string | null = null;
    let latestCommitMs = -Infinity;

    for (const commit of commits) {
      if (!commit.committedAt) continue;
      const commitMs = Date.parse(commit.committedAt);
      if (Number.isNaN(commitMs)) continue;
      if (commitMs > latestCommitMs) {
        latestCommitMs = commitMs;
        latestCommittedAt = commit.committedAt;
      }
    }

    if (latestCommittedAt) return formatDate(latestCommittedAt);
    return "Unknown time";
  }, [activity?.commits]);

  const markdownFiles = useMemo(() => {
    const files = [...(activity?.markdownFiles ?? [])];
    files.sort((left, right) => {
      const leftIsReadme = left.name.toLowerCase() === "readme.md";
      const rightIsReadme = right.name.toLowerCase() === "readme.md";
      if (leftIsReadme && !rightIsReadme) return -1;
      if (!leftIsReadme && rightIsReadme) return 1;
      return left.name.localeCompare(right.name);
    });
    return files;
  }, [activity?.markdownFiles]);
  const resolvedMarkdownPath = useMemo(() => {
    if (markdownFiles.length === 0) return null;
    if (selectedMarkdownPath && markdownFiles.some((item) => item.path === selectedMarkdownPath)) {
      return selectedMarkdownPath;
    }
    const preferred = markdownFiles.find((item) => item.name.toLowerCase() === "readme.md");
    return preferred?.path ?? markdownFiles[0].path;
  }, [markdownFiles, selectedMarkdownPath]);
  const resolvedMarkdownFile = useMemo(
    () => markdownFiles.find((item) => item.path === resolvedMarkdownPath) ?? null,
    [markdownFiles, resolvedMarkdownPath],
  );
  const markdownFileQuery = useQuery({
    queryKey: projectMarkdownFileQueryKey(userId, projectId, resolvedMarkdownPath),
    queryFn: () => getProjectMarkdownFile(projectId, resolvedMarkdownPath ?? ""),
    staleTime: 120_000,
    enabled: !!userId && !!resolvedMarkdownPath,
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
      await queryClient.invalidateQueries({
        queryKey: projectActivityQueryKey(userId, projectId),
      });
    },
  });

  const project = useMemo(
    () => (projectsQuery.data ?? []).find((item) => item.id === projectId) ?? null,
    [projectId, projectsQuery.data],
  );

  const repoFullName = project?.githubRepoFullName ?? activity?.repoFullName ?? null;
  const workflowBranchName = createBranchName(project?.name ?? "project");
  const repoLinks = repoFullName
    ? getRepoLinks(repoFullName, workflowBranchName)
    : null;
  const deadline = getDeadlineInfo(project?.createdAt ?? null, currentTime);
  const cloneCommands = repoFullName
    ? `git clone https://github.com/${repoFullName}.git
cd ${repoFullName.split("/")[1] ?? "project"}
bun install
bun run dev`
    : "";
  const branchCommands = repoFullName
    ? `git checkout -b ${workflowBranchName}
# make your changes
git add .
git commit -m "feat: describe your update"
git push -u origin ${workflowBranchName}`
    : "";

  useEffect(() => {
    const interval = window.setInterval(() => setCurrentTime(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!copyMessage) return undefined;

    const timeout = window.setTimeout(() => setCopyMessage(null), 2_500);
    return () => window.clearTimeout(timeout);
  }, [copyMessage]);

  function handleExport() {
    exportMutation.mutate(projectId, {
      onError: (error) => setActionError(error.message),
    });
  }

  function handleEndSession() {
    const label = project?.name ?? "this project";
    const shouldEnd = window.confirm(
      `End session for "${label}"? This triggers auto-delete of the project repo.`,
    );
    if (!shouldEnd) return;

    endSessionMutation.mutate(projectId, {
      onError: (error) => setActionError(error.message),
    });
  }

  async function handleCopy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyMessage(`${label} copied.`);
    } catch {
      setActionError(`Unable to copy ${label.toLowerCase()}.`);
    }
  }

  const displayedActionError = actionError ?? getErrorMessage(projectsQuery.error);
  const activityErrorMessage = activityQuery.error instanceof Error ? activityQuery.error.message : null;
  const selectedWindow: ActivityWindow = activeWindow === "next-steps" && !repoLinks
    ? "pull-requests"
    : activeWindow;
  const windowItems: Array<{
    id: ActivityWindow;
    label: string;
    count: number | null;
    disabled: boolean;
  }> = [
    {
      id: "next-steps",
      label: "Next Steps",
      count: null,
      disabled: !repoLinks,
    },
    {
      id: "pull-requests",
      label: "Pull Requests",
      count: activity?.pullRequests.length ?? null,
      disabled: false,
    },
    {
      id: "checks",
      label: "Checks",
      count: activity?.checks.length ?? null,
      disabled: false,
    },
    {
      id: "lifecycle-events",
      label: "Lifecycle",
      count: activity?.auditEvents.length ?? null,
      disabled: false,
    },
  ];

  return (
    <section className="workspace">
      <article className="project-activity-page">
        <header className="project-activity-header">
          <div>
            {project?.name ? <h1 className="project-activity-title">{project.name}</h1> : null}
          </div>
          <div className="project-activity-header-actions">
            <Link className="project-activity-link-button" to="/project">
              Back to Projects
            </Link>
            <button
              className="project-activity-primary-button"
              type="button"
              onClick={() => void activityQuery.refetch()}
              disabled={activityQuery.isFetching}
            >
              {activityQuery.isFetching ? "Refreshing..." : "Refresh Activity"}
            </button>
          </div>
        </header>

        {displayedActionError ? (
          <p className="status error" role="status">{displayedActionError}</p>
        ) : null}

        {activityErrorMessage ? (
          <p className="status error" role="status">{activityErrorMessage}</p>
        ) : null}

        {projectsQuery.isPending ? <p className="empty">Loading project...</p> : null}

        {project ? (
          <section className="project-activity-current-card" aria-label="Current project">
            <div className="project-activity-current-top">
              <p className={`project-status project-status-${project.status}`}>
                {project.status}
              </p>
              <p
                className={`project-activity-clock${
                  deadline ? ` project-activity-clock-${deadline.status}` : ""
                }`}
              >
                {deadline?.label ?? "Clock unavailable"}
              </p>
            </div>
            <p className="project-activity-current-title">{project.name}</p>
            <p className="project-activity-current-repo">
              {repoFullName ? (
                <a href={`https://github.com/${repoFullName}`} target="_blank" rel="noreferrer">
                  {`github.com/${repoFullName}`}
                </a>
              ) : (
                "No repo linked"
              )}
            </p>
            {project.lastError ? (
              <p className="project-activity-current-error">{project.lastError}</p>
            ) : null}

            <div className="project-activity-current-actions">
              <button
                className="project-activity-primary-button"
                type="button"
                onClick={handleExport}
                disabled={
                  exportMutation.isPending ||
                  !repoFullName ||
                  (project.status !== "active" && project.status !== "deleting")
                }
              >
                {exportMutation.isPending ? "Exporting..." : "Export ZIP"}
              </button>
              <button
                className="project-activity-end-button"
                type="button"
                onClick={handleEndSession}
                disabled={endSessionMutation.isPending || project.status !== "active"}
              >
                {endSessionMutation.isPending ? "Ending..." : "End Session"}
              </button>
            </div>
          </section>
        ) : null}

        {activityQuery.isPending ? <p className="empty">Loading activity...</p> : null}

        <section className="project-activity-summary">
          <p className="project-activity-summary-line">
            Last pull: {activity ? formatDate(activity.pulledAt) : "Not pulled yet"}
          </p>
          <p className="project-activity-summary-line">
            Remaining API budget: {activity?.githubMeta.checks.rateLimitRemaining ?? "unknown"}
          </p>
        </section>

        {activity ? (
          <section className="project-activity-panel project-activity-panel-fit">
            <div className="project-activity-panel-head">
              <button
                className="project-activity-panel-title-toggle"
                type="button"
                onClick={() => setIsCommitsCollapsed((value) => !value)}
                aria-expanded={!isCommitsCollapsed}
                aria-controls="recent-commits-content"
              >
                <span className="project-activity-panel-toggle-symbol" aria-hidden="true">
                  {isCommitsCollapsed ? "+" : "-"}
                </span>
                <span>Recent Commits</span>
                {isCommitsCollapsed ? (
                  <span className="project-activity-collapsed-preview-text">
                    {mostRecentCommitTimestamp ? `Latest: ${mostRecentCommitTimestamp}` : "No commits yet"}
                  </span>
                ) : null}
              </button>
            </div>
            <div id="recent-commits-content" hidden={isCommitsCollapsed}>
              {activity.commits.length === 0 ? (
                <p className="empty">No commits found.</p>
              ) : (
                <ul className="project-activity-list">
                  {activity.commits.map((item) => (
                    <li key={item.sha} className="project-activity-item">
                      <p className="project-activity-meta project-activity-commit-line">
                        <a href={item.url} target="_blank" rel="noreferrer">
                          {item.shortSha}
                        </a>{" "}
                        · {item.committedAt ? formatDate(item.committedAt) : "Unknown time"}
                      </p>
                      <p className="project-activity-commit-message">{item.message}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        ) : null}

        <section className="project-activity-panel project-activity-panel-fit project-activity-workspace-wrap">
          <div className="project-activity-panel-head">
            <button
              className="project-activity-panel-title-toggle"
              type="button"
              onClick={() => setIsWorkspaceCollapsed((value) => !value)}
              aria-expanded={!isWorkspaceCollapsed}
              aria-controls="activity-workspace-content"
            >
              <span className="project-activity-panel-toggle-symbol" aria-hidden="true">
                {isWorkspaceCollapsed ? "+" : "-"}
              </span>
              <span>Activity Windows</span>
            </button>
          </div>

          <div id="activity-workspace-content" hidden={isWorkspaceCollapsed}>
            <section className="project-activity-workspace" aria-label="Activity workspace">
              <aside className="project-activity-sidebar" aria-label="Activity windows">
                <ul className="project-activity-window-list">
                  {windowItems.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={`project-activity-window-button${
                          selectedWindow === item.id ? " is-active" : ""
                        }`}
                        onClick={() => setActiveWindow(item.id)}
                        disabled={item.disabled}
                      >
                        <span>{item.label}</span>
                        {item.count !== null ? (
                          <span className="project-activity-window-count">{item.count}</span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              </aside>

              <div className="project-activity-main">
                {selectedWindow === "next-steps" ? (
                  <section className={`project-activity-panel${isMoreGithubCollapsed ? " is-collapsed" : ""}`}>
                    <div className="project-activity-panel-head">
                      <button
                        className="project-activity-panel-title-toggle"
                        type="button"
                        onClick={() => setIsMoreGithubCollapsed((value) => !value)}
                        aria-expanded={!isMoreGithubCollapsed}
                        aria-controls="more-github-content"
                      >
                        Next Steps
                      </button>
                      {deadline ? (
                        <span className={`project-deadline-pill project-deadline-pill-${deadline.status}`}>
                          {deadline.label}
                        </span>
                      ) : null}
                    </div>
                    <div id="more-github-content" hidden={isMoreGithubCollapsed}>
                      {repoLinks ? (
                        <div className="project-next-body">
                          <ol className="project-next-list">
                            <li>Pull the codebase into your editor and run locally.</li>
                          </ol>
                          <pre className="project-next-code">
                            <code>{cloneCommands}</code>
                          </pre>
                          <div className="project-next-actions">
                            <button
                              className="project-activity-primary-button"
                              type="button"
                              onClick={() => void handleCopy(cloneCommands, "Clone commands")}
                            >
                              Copy Clone Steps
                            </button>
                            <a className="project-activity-link-button" href={repoLinks.repoUrl} target="_blank" rel="noreferrer">
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
                              className="project-activity-primary-button"
                              type="button"
                              onClick={() => void handleCopy(branchCommands, "Branch workflow")}
                            >
                              Copy Branch Steps
                            </button>
                          </div>

                          <ol className="project-next-list project-next-list-tight" start={3}>
                            <li>Open a PR and share its Vercel preview URL for group review.</li>
                          </ol>
                          <div className="project-next-actions">
                            <a className="project-activity-link-button" href={repoLinks.newPullRequestUrl} target="_blank" rel="noreferrer">
                              Open New PR
                            </a>
                            <a className="project-activity-link-button" href={repoLinks.pullRequestsUrl} target="_blank" rel="noreferrer">
                              View Pull Requests
                            </a>
                          </div>

                          {copyMessage ? (
                            <p className="status" role="status">{copyMessage}</p>
                          ) : null}
                        </div>
                      ) : (
                        <p className="empty">No repo linked for next-step workflow yet.</p>
                      )}
                    </div>
                  </section>
                ) : null}

                {selectedWindow === "pull-requests" ? (
                  <section className="project-activity-panel">
                    <h2 className="project-activity-panel-title">Pull Requests</h2>
                    {!activity ? (
                      <p className="empty">Loading pull requests...</p>
                    ) : activity.pullRequests.length === 0 ? (
                      <p className="empty">No pull requests found.</p>
                    ) : (
                      <ul className="project-activity-list">
                        {activity.pullRequests.map((item) => (
                          <li key={item.id} className="project-activity-item">
                            <a href={item.url} target="_blank" rel="noreferrer">
                              #{item.number} {item.title}
                            </a>
                            <p className="project-activity-meta">
                              {item.state}{item.draft ? " · draft" : ""} · {item.headRef} → {item.baseRef}
                            </p>
                            <p className="project-activity-meta">Updated {formatDate(item.updatedAt)}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                ) : null}

                {selectedWindow === "checks" ? (
                  <section className="project-activity-panel">
                    <h2 className="project-activity-panel-title">Checks / Workflow Runs</h2>
                    {!activity ? (
                      <p className="empty">Loading checks...</p>
                    ) : activity.checks.length === 0 ? (
                      <p className="empty">No workflow runs found.</p>
                    ) : (
                      <ul className="project-activity-list">
                        {activity.checks.map((item) => (
                          <li key={item.id} className="project-activity-item">
                            <a href={item.url} target="_blank" rel="noreferrer">
                              {item.name || "workflow run"}
                            </a>
                            <p className="project-activity-meta">
                              {item.status}{item.conclusion ? ` · ${item.conclusion}` : ""} · {item.event}
                            </p>
                            <p className="project-activity-meta">Updated {formatDate(item.updatedAt)}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                ) : null}

                {selectedWindow === "lifecycle-events" ? (
                  <section className="project-activity-panel">
                    <h2 className="project-activity-panel-title">Lifecycle Events</h2>
                    {!activity ? (
                      <p className="empty">Loading lifecycle events...</p>
                    ) : activity.auditEvents.length === 0 ? (
                      <p className="empty">No local lifecycle events yet.</p>
                    ) : (
                      <ul className="project-activity-list">
                        {activity.auditEvents.map((item) => (
                          <li key={item.id} className="project-activity-item">
                            <p className="project-activity-meta">
                              {item.action} · {item.result}
                            </p>
                            <p className="project-activity-meta">{formatDate(item.createdAt)}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                ) : null}
              </div>
            </section>
          </div>
        </section>

        <section className="project-activity-panel project-activity-panel-fit project-activity-markdown-wrap">
          <div className="project-activity-panel-head">
            <button
              className="project-activity-panel-title-toggle project-activity-markdown-toggle"
              type="button"
              onClick={() => setIsMarkdownCollapsed((value) => !value)}
              aria-expanded={!isMarkdownCollapsed}
              aria-controls="activity-markdown-content"
            >
              <span className="project-activity-panel-toggle-symbol" aria-hidden="true">
                {isMarkdownCollapsed ? "+" : "-"}
              </span>
              <span>Markdown Display</span>
              {isMarkdownCollapsed ? (
                activityQuery.isPending ? (
                  <span className="project-activity-collapsed-preview-text">Loading markdown files...</span>
                ) : markdownFiles.length === 0 ? (
                  <span className="project-activity-collapsed-preview-text">No root .md files found</span>
                ) : (
                  <span className="project-activity-markdown-collapsed-list">
                    {markdownFiles.map((item) => (
                      <span key={item.path} className="project-activity-markdown-collapsed-item">
                        {item.name}
                      </span>
                    ))}
                  </span>
                )
              ) : null}
            </button>
          </div>

          <div id="activity-markdown-content" hidden={isMarkdownCollapsed}>
            {activityQuery.isPending ? (
              <p className="empty">Loading markdown files...</p>
            ) : markdownFiles.length === 0 ? (
              <p className="empty">No root-level .md files found in this repository.</p>
            ) : (
              <>
                <div className="project-activity-markdown-tabs" role="tablist" aria-label="Markdown files">
                  {markdownFiles.map((item) => (
                    <button
                      key={item.path}
                      type="button"
                      role="tab"
                      aria-selected={resolvedMarkdownPath === item.path}
                      className={`project-activity-markdown-tab${
                        resolvedMarkdownPath === item.path ? " is-active" : ""
                      }`}
                      onClick={() => setSelectedMarkdownPath(item.path)}
                    >
                      {item.name}
                    </button>
                  ))}
                </div>

                <div className="project-activity-markdown-frame">
                  {resolvedMarkdownFile ? (
                    <p className="project-activity-markdown-meta">
                      {resolvedMarkdownFile.path} ·{" "}
                      <a href={resolvedMarkdownFile.htmlUrl} target="_blank" rel="noreferrer">
                        Open on GitHub
                      </a>
                    </p>
                  ) : null}

                  {markdownFileQuery.isPending ? (
                    <p className="empty">Loading markdown...</p>
                  ) : markdownFileQuery.error instanceof Error ? (
                    <p className="status error" role="status">{markdownFileQuery.error.message}</p>
                  ) : markdownFileQuery.data ? (
                    <div className="project-activity-markdown-body">
                      <ReactMarkdown remarkPlugins={markdownRemarkPlugins}>
                        {markdownFileQuery.data.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="empty">Select a markdown file to view its contents.</p>
                  )}
                </div>
              </>
            )}
          </div>
        </section>
      </article>
    </section>
  );
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
