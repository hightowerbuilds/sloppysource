import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  createServiceClient,
  errorResponse,
  getRequiredEnv,
  githubDeleteRepoByFullName,
  jsonResponse,
  preflightResponse,
  writeProjectAuditLog,
} from "../_shared/projectRuntime.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return preflightResponse();
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed.", 405);
  }

  try {
    const providedSecret = req.headers.get("x-cleanup-secret") ?? "";
    const expectedSecret = getRequiredEnv("PROJECT_CLEANUP_SECRET");

    if (!providedSecret || providedSecret !== expectedSecret) {
      return errorResponse("Unauthorized.", 401);
    }

    const supabase = createServiceClient();
    const { data: candidates, error: candidateError } = await supabase
      .from("projects")
      .select("id, user_id, github_repo_full_name")
      .in("status", ["deleting", "error"])
      .limit(200);

    if (candidateError) throw new Error(candidateError.message);

    let deleted = 0;
    let failed = 0;

    for (const candidate of candidates ?? []) {
      const projectId = candidate.id as string;
      const userId = candidate.user_id as string | undefined;
      const repoFullName = candidate.github_repo_full_name as string | null;

      try {
        if (repoFullName) {
          await githubDeleteRepoByFullName(repoFullName);
        }

        const { error: updateError } = await supabase
          .from("projects")
          .update({
            status: "deleted",
            ended_at: new Date().toISOString(),
            last_error: null,
          })
          .eq("id", projectId);

        if (updateError) throw new Error(updateError.message);

        deleted += 1;

        await writeProjectAuditLog({
          supabase,
          projectId,
          userId,
          action: "project-cleanup",
          result: "success",
        });
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : "Cleanup failed.";

        await supabase
          .from("projects")
          .update({
            status: "error",
            last_error: message,
          })
          .eq("id", projectId);

        await writeProjectAuditLog({
          supabase,
          projectId,
          userId,
          action: "project-cleanup",
          result: "error",
          details: {
            message,
          },
        });
      }
    }

    return jsonResponse({
      scanned: (candidates ?? []).length,
      deleted,
      failed,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cleanup failed.";
    return errorResponse(message, 500);
  }
});
