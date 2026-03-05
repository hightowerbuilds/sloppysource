import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  errorResponse,
  githubCreateRepoFromTemplate,
  githubDeleteRepoByFullName,
  jsonResponse,
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

    const repoName = resolveProjectRepoName(name);
    const repo = await githubCreateRepoFromTemplate(repoName);

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
      await githubDeleteRepoByFullName(repo.full_name);
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
      try {
        await githubDeleteRepoByFullName(repo.full_name);
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
      },
    });

    return jsonResponse({
      projectId: projectRow.id,
      sessionId: sessionRow.id,
      repoFullName: repo.full_name,
      status: projectRow.status,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Project creation failed.";
    return errorResponse(message, 500);
  }
});
