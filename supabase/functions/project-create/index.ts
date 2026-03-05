import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  errorResponse,
  githubCreateRepoFromTemplate,
  githubDeleteRepoByFullName,
  jsonResponse,
  mapGitHubErrorToHttp,
  preflightResponse,
  requireProjectUser,
  resolveProjectRepoName,
  writeProjectAuditLog,
} from "../_shared/projectRuntime.ts";

interface CreateProjectBody {
  name?: string;
  sessionKey?: string;
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

    const body = await req.json() as CreateProjectBody;
    const name = body.name?.trim() ?? "";
    const sessionKey = body.sessionKey?.trim() ?? "";

    if (!name) return errorResponse("Project name is required.", 400);
    if (!sessionKey) return errorResponse("Session key is required.", 400);

    const { data: existingSessionRow, error: existingSessionError } = await supabase
      .from("project_sessions")
      .select("id, project_id")
      .eq("user_id", user.id)
      .eq("session_key", sessionKey)
      .eq("state", "active")
      .maybeSingle();

    if (existingSessionError) throw new Error(existingSessionError.message);

    if (existingSessionRow?.project_id) {
      const existingProjectId = existingSessionRow.project_id as string;
      const { data: existingProjectRow, error: existingProjectError } = await supabase
        .from("projects")
        .select("id, status, github_repo_full_name")
        .eq("id", existingProjectId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existingProjectError) throw new Error(existingProjectError.message);

      const existingRepoFullName = existingProjectRow?.github_repo_full_name as string | null | undefined;
      if (existingProjectRow && existingRepoFullName) {
        await writeProjectAuditLog({
          supabase,
          projectId: existingProjectId,
          userId: user.id,
          action: "project-create",
          result: "reused",
          details: {
            sessionKey,
            repoFullName: existingRepoFullName,
          },
        });

        return jsonResponse({
          projectId: existingProjectId,
          sessionId: existingSessionRow.id as string,
          repoFullName: existingRepoFullName,
          status: existingProjectRow.status as string,
        });
      }
    }

    const repoName = resolveProjectRepoName(name);
    let repo: { id: number; full_name: string };
    let githubCreateMeta: Record<string, unknown> | null = null;

    try {
      const created = await githubCreateRepoFromTemplate(repoName);
      repo = created.repo;
      githubCreateMeta = {
        githubRequestId: created.meta.requestId,
        rateLimitRemaining: created.meta.rateLimitRemaining,
        rateLimitReset: created.meta.rateLimitReset,
      };
    } catch (error) {
      const mapped = mapGitHubErrorToHttp(error);
      await writeProjectAuditLog({
        supabase,
        userId: user.id,
        action: "project-create",
        result: "error",
        details: {
          phase: "github-create",
          sessionKey,
          repoName,
          ...(mapped.details ?? {}),
        },
      });
      return errorResponse(mapped.message, mapped.status);
    }

    const { data: projectRow, error: projectError } = await supabase
      .from("projects")
      .insert({
        user_id: user.id,
        name,
        github_repo_full_name: repo.full_name,
        github_repo_id: repo.id,
        status: "active",
        last_error: null,
      })
      .select("id, status")
      .single();

    if (projectError || !projectRow) {
      let rollbackMeta: Record<string, unknown> | null = null;
      try {
        const rollback = await githubDeleteRepoByFullName(repo.full_name);
        rollbackMeta = {
          githubRequestId: rollback.requestId,
          rateLimitRemaining: rollback.rateLimitRemaining,
        };
      } catch {
        // best effort rollback
      }

      await writeProjectAuditLog({
        supabase,
        userId: user.id,
        action: "project-create",
        result: "error",
        details: {
          phase: "project-row-insert",
          sessionKey,
          repoFullName: repo.full_name,
          dbError: projectError?.message ?? "Failed to insert project row.",
          rollbackMeta,
        },
      });

      throw new Error(projectError?.message ?? "Failed to create project record.");
    }

    const { data: sessionRow, error: sessionError } = await supabase
      .from("project_sessions")
      .insert({
        project_id: projectRow.id,
        user_id: user.id,
        session_key: sessionKey,
        state: "active",
      })
      .select("id")
      .single();

    if (sessionError || !sessionRow) {
      let rollbackMeta: Record<string, unknown> | null = null;
      try {
        const rollback = await githubDeleteRepoByFullName(repo.full_name);
        rollbackMeta = {
          githubRequestId: rollback.requestId,
          rateLimitRemaining: rollback.rateLimitRemaining,
        };
      } catch {
        // best effort rollback; keep project row for diagnostics if deletion fails
      }

      await supabase
        .from("projects")
        .update({
          status: "error",
          last_error: sessionError?.message ?? "Session create failed.",
        })
        .eq("id", projectRow.id)
        .eq("user_id", user.id);

      await writeProjectAuditLog({
        supabase,
        projectId: projectRow.id as string,
        userId: user.id,
        action: "project-create",
        result: "error",
        details: {
          phase: "session-row-insert",
          sessionKey,
          repoFullName: repo.full_name,
          dbError: sessionError?.message ?? "Failed to create project session.",
          rollbackMeta,
        },
      });

      throw new Error(sessionError?.message ?? "Failed to create project session.");
    }

    await writeProjectAuditLog({
      supabase,
      projectId: projectRow.id as string,
      userId: user.id,
      action: "project-create",
      result: "success",
      details: {
        repoFullName: repo.full_name,
        sessionKey,
        githubCreateMeta,
      },
    });

    return jsonResponse({
      projectId: projectRow.id,
      sessionId: sessionRow.id,
      repoFullName: repo.full_name,
      status: projectRow.status,
    });
  } catch (error) {
    const mapped = mapGitHubErrorToHttp(error);
    return errorResponse(mapped.message, mapped.status);
  }
});
