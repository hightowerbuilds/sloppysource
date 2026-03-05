import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  errorResponse,
  githubDeleteRepoByFullName,
  jsonResponse,
  preflightResponse,
  requireProjectUser,
  writeProjectAuditLog,
} from "../_shared/projectRuntime.ts";

interface EndSessionBody {
  projectId?: string;
  sessionId?: string;
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
    const body = await req.json() as EndSessionBody;

    const projectId = body.projectId?.trim() ?? "";
    if (!projectId) return errorResponse("projectId is required.", 400);

    const { data: projectRow, error: projectError } = await supabase
      .from("projects")
      .select("id, status, github_repo_full_name")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (projectError) throw new Error(projectError.message);
    if (!projectRow) return errorResponse("Project not found.", 404);

    if (projectRow.status === "deleted") {
      return jsonResponse({ projectId, status: "deleted" });
    }

    const sessionId = body.sessionId?.trim() ?? "";

    if (sessionId) {
      const { error: sessionUpdateError } = await supabase
        .from("project_sessions")
        .update({
          state: "ended",
          ended_at: new Date().toISOString(),
          delete_scheduled_at: new Date().toISOString(),
        })
        .eq("id", sessionId)
        .eq("project_id", projectId)
        .eq("user_id", user.id)
        .eq("state", "active");

      if (sessionUpdateError) throw new Error(sessionUpdateError.message);
    } else {
      const { error: activeSessionUpdateError } = await supabase
        .from("project_sessions")
        .update({
          state: "ended",
          ended_at: new Date().toISOString(),
          delete_scheduled_at: new Date().toISOString(),
        })
        .eq("project_id", projectId)
        .eq("user_id", user.id)
        .eq("state", "active");

      if (activeSessionUpdateError) throw new Error(activeSessionUpdateError.message);
    }

    const nowIso = new Date().toISOString();

    const { error: deletingUpdateError } = await supabase
      .from("projects")
      .update({
        status: "deleting",
        ended_at: nowIso,
        last_error: null,
      })
      .eq("id", projectId)
      .eq("user_id", user.id);

    if (deletingUpdateError) throw new Error(deletingUpdateError.message);

    try {
      const fullName = projectRow.github_repo_full_name as string | null;
      if (fullName) {
        await githubDeleteRepoByFullName(fullName);
      }

      const { error: deletedUpdateError } = await supabase
        .from("projects")
        .update({
          status: "deleted",
          ended_at: nowIso,
          last_error: null,
        })
        .eq("id", projectId)
        .eq("user_id", user.id);

      if (deletedUpdateError) throw new Error(deletedUpdateError.message);

      await writeProjectAuditLog({
        supabase,
        projectId,
        userId: user.id,
        action: "project-end-session",
        result: "success",
      });

      return jsonResponse({ projectId, status: "deleted" });
    } catch (deleteError) {
      const message = deleteError instanceof Error
        ? deleteError.message
        : "GitHub deletion failed.";

      await supabase
        .from("projects")
        .update({
          status: "error",
          ended_at: nowIso,
          last_error: message,
        })
        .eq("id", projectId)
        .eq("user_id", user.id);

      await writeProjectAuditLog({
        supabase,
        projectId,
        userId: user.id,
        action: "project-end-session",
        result: "error",
        details: {
          message,
        },
      });

      return errorResponse(message, 500);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to end project session.";
    return errorResponse(message, 500);
  }
});
