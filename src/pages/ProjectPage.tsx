import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createLazyRoute } from "@tanstack/react-router";
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

  const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data]);
  const activeCount = projects.filter((project) => project.status === "active").length;

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
              {projects.map((project) => (
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
                  </div>

                  <div className="project-item-actions">
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
              ))}
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
