import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  errorResponse,
  githubGetJson,
  jsonResponse,
  mapGitHubErrorToHttp,
  preflightResponse,
  requireProjectUser,
  writeProjectAuditLog,
} from "../_shared/projectRuntime.ts";

interface ActivityBody {
  projectId?: string;
  branch?: string;
  limit?: number;
}

interface GitHubPullRequestRow {
  id: number;
  number: number;
  title: string;
  state: string;
  html_url: string;
  updated_at: string;
  merged_at: string | null;
  draft: boolean;
  user: {
    login: string;
  } | null;
  head: {
    ref: string;
  };
  base: {
    ref: string;
  };
}

interface GitHubCommitRow {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: {
      name: string;
      date: string | null;
    } | null;
  };
  author: {
    login: string;
  } | null;
}

interface GitHubWorkflowRunRow {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  head_branch: string | null;
  event: string;
  created_at: string;
  updated_at: string;
}

interface GitHubWorkflowRunsResponse {
  workflow_runs: GitHubWorkflowRunRow[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return preflightResponse();
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed.", 405);
  }

  try {
    const { supabase, user } = await requireProjectUser(req);
    const body = await req.json() as ActivityBody;
    const projectId = body.projectId?.trim() ?? "";
    const branch = body.branch?.trim() ?? "";
    const limit = clampLimit(body.limit);

    if (!projectId) return errorResponse("projectId is required.", 400);

    const { data: projectRow, error: projectError } = await supabase
      .from("projects")
      .select("id, github_repo_full_name")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (projectError) throw new Error(projectError.message);
    if (!projectRow) return errorResponse("Project not found.", 404);

    const repoFullName = projectRow.github_repo_full_name as string | null;
    if (!repoFullName) {
      return errorResponse("Project does not have a linked GitHub repository.", 400);
    }

    try {
      const branchQuery = branch ? `&branch=${encodeURIComponent(branch)}` : "";

      const pullsResult = await githubGetJson<GitHubPullRequestRow[]>(
        `/repos/${repoFullName}/pulls?state=all&sort=updated&direction=desc&per_page=${limit}`,
        `List pull requests for ${repoFullName}`,
      );

      const commitsResult = await githubGetJson<GitHubCommitRow[]>(
        `/repos/${repoFullName}/commits?per_page=${limit}${branchQuery}`,
        `List commits for ${repoFullName}`,
      );

      const runsResult = await githubGetJson<GitHubWorkflowRunsResponse>(
        `/repos/${repoFullName}/actions/runs?per_page=${limit}${branchQuery}`,
        `List workflow runs for ${repoFullName}`,
      );

      const { data: auditRows, error: auditError } = await supabase
        .from("project_audit_logs")
        .select("id, action, result, details, created_at")
        .eq("project_id", projectId)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (auditError) throw new Error(auditError.message);

      await writeProjectAuditLog({
        supabase,
        projectId,
        userId: user.id,
        action: "project-github-activity",
        result: "success",
        details: {
          repoFullName,
          limit,
          branch: branch || null,
          githubRequestIds: {
            pulls: pullsResult.meta.requestId,
            commits: commitsResult.meta.requestId,
            runs: runsResult.meta.requestId,
          },
        },
      });

      return jsonResponse({
        projectId,
        repoFullName,
        pulledAt: new Date().toISOString(),
        pullRequests: pullsResult.data.map((row) => ({
          id: row.id,
          number: row.number,
          title: row.title,
          state: row.state,
          draft: row.draft,
          mergedAt: row.merged_at,
          updatedAt: row.updated_at,
          authorLogin: row.user?.login ?? null,
          headRef: row.head.ref,
          baseRef: row.base.ref,
          url: row.html_url,
        })),
        checks: (runsResult.data.workflow_runs ?? []).map((row) => ({
          id: row.id,
          name: row.name,
          status: row.status,
          conclusion: row.conclusion,
          event: row.event,
          branch: row.head_branch,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          url: row.html_url,
        })),
        commits: commitsResult.data.map((row) => ({
          sha: row.sha,
          shortSha: row.sha.slice(0, 8),
          message: row.commit.message.split("\n")[0] ?? row.commit.message,
          authorName: row.commit.author?.name ?? null,
          authorLogin: row.author?.login ?? null,
          committedAt: row.commit.author?.date ?? null,
          url: row.html_url,
        })),
        auditEvents: (auditRows ?? []).map((row) => ({
          id: String(row.id),
          action: row.action as string,
          result: row.result as string,
          details: (row.details as Record<string, unknown> | null) ?? null,
          createdAt: row.created_at as string,
        })),
        githubMeta: {
          pulls: pullsResult.meta,
          commits: commitsResult.meta,
          checks: runsResult.meta,
        },
      });
    } catch (error) {
      const mapped = mapGitHubErrorToHttp(error);
      await writeProjectAuditLog({
        supabase,
        projectId,
        userId: user.id,
        action: "project-github-activity",
        result: "error",
        details: {
          repoFullName,
          limit,
          branch: branch || null,
          ...(mapped.details ?? {}),
        },
      });
      return errorResponse(mapped.message, mapped.status);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch GitHub activity.";
    return errorResponse(message, 500);
  }
});

function clampLimit(value: number | undefined): number {
  const fallback = 10;
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.max(3, Math.min(25, Math.floor(value)));
}
