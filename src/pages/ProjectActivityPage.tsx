import { Link, createLazyRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { formatDate } from "../lib/format.ts";
import { getProjectGitHubActivity } from "../lib/projectsDb.ts";
import { projectActivityQueryKey } from "../lib/queryKeys.ts";
import { useAuthUser } from "../lib/useAuthUser.ts";
import "./ProjectActivityPage.css";

export const Route = createLazyRoute("/project/$projectId/activity")({
  component: ProjectActivityPage,
});

function ProjectActivityPage() {
  const { projectId } = Route.useParams();
  const user = useAuthUser();
  const userId = user?.id ?? null;

  const activityQuery = useQuery({
    queryKey: projectActivityQueryKey(userId, projectId),
    queryFn: () => getProjectGitHubActivity(projectId),
    staleTime: 15_000,
    enabled: !!userId,
  });

  const activity = activityQuery.data;
  const errorMessage = activityQuery.error instanceof Error ? activityQuery.error.message : null;

  return (
    <section className="workspace">
      <article className="project-activity-page">
        <header className="project-activity-header">
          <div>
            <p className="section-title">Project</p>
            <h1 className="project-activity-title">GitHub Activity</h1>
            <p className="project-activity-subtitle">
              Pull requests, checks, commits, and lifecycle events.
            </p>
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

        {errorMessage ? (
          <p className="status error" role="status">{errorMessage}</p>
        ) : null}

        {activityQuery.isPending ? <p className="empty">Loading activity...</p> : null}

        {activity ? (
          <>
            <section className="project-activity-summary">
              <p className="project-activity-summary-line">
                Repo:{" "}
                <a
                  href={`https://github.com/${activity.repoFullName}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {activity.repoFullName}
                </a>
              </p>
              <p className="project-activity-summary-line">
                Last pull: {formatDate(activity.pulledAt)}
              </p>
              <p className="project-activity-summary-line">
                Remaining API budget: {activity.githubMeta.checks.rateLimitRemaining ?? "unknown"}
              </p>
            </section>

            <div className="project-activity-grid">
              <section className="project-activity-panel">
                <h2 className="project-activity-panel-title">Pull Requests</h2>
                {activity.pullRequests.length === 0 ? (
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

              <section className="project-activity-panel">
                <h2 className="project-activity-panel-title">Checks / Workflow Runs</h2>
                {activity.checks.length === 0 ? (
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

              <section className="project-activity-panel">
                <h2 className="project-activity-panel-title">Recent Commits</h2>
                {activity.commits.length === 0 ? (
                  <p className="empty">No commits found.</p>
                ) : (
                  <ul className="project-activity-list">
                    {activity.commits.map((item) => (
                      <li key={item.sha} className="project-activity-item">
                        <a href={item.url} target="_blank" rel="noreferrer">
                          {item.shortSha}
                        </a>
                        <p className="project-activity-meta">{item.message}</p>
                        <p className="project-activity-meta">
                          {item.authorLogin ?? item.authorName ?? "Unknown author"} ·{" "}
                          {item.committedAt ? formatDate(item.committedAt) : "Unknown time"}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="project-activity-panel">
                <h2 className="project-activity-panel-title">Lifecycle Events</h2>
                {activity.auditEvents.length === 0 ? (
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
            </div>
          </>
        ) : null}
      </article>
    </section>
  );
}
