import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  createServiceClient,
  errorResponse,
  githubDownloadRepoArchive,
  jsonResponse,
  preflightResponse,
  requireProjectUser,
  writeProjectAuditLog,
} from "../_shared/projectRuntime.ts";

interface ExportZipBody {
  projectId?: string;
}

const EXPORT_BUCKET = "project-exports";
const EXPORT_URL_TTL_SECONDS = 300;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return preflightResponse();
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed.", 405);
  }

  try {
    const { supabase, user } = await requireProjectUser(req);
    const adminSupabase = createServiceClient();
    const body = await req.json() as ExportZipBody;
    const projectId = body.projectId?.trim() ?? "";

    if (!projectId) return errorResponse("projectId is required.", 400);

    const { data: projectRow, error: projectError } = await supabase
      .from("projects")
      .select("id, name, github_repo_full_name")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (projectError) throw new Error(projectError.message);
    if (!projectRow) return errorResponse("Project not found.", 404);

    const repoFullName = projectRow.github_repo_full_name as string | null;
    if (!repoFullName) {
      return errorResponse("Project does not have a linked GitHub repository.", 400);
    }

    const archive = await githubDownloadRepoArchive(repoFullName);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safeName = ((projectRow.name as string) || "project")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "project";

    const filePath = `${user.id}/${projectId}/${safeName}-${stamp}.zip`;

    const { error: uploadError } = await adminSupabase.storage
      .from(EXPORT_BUCKET)
      .upload(filePath, archive, {
        contentType: "application/zip",
        upsert: true,
      });

    if (uploadError) throw new Error(uploadError.message);

    const { data: signedData, error: signedError } = await adminSupabase.storage
      .from(EXPORT_BUCKET)
      .createSignedUrl(filePath, EXPORT_URL_TTL_SECONDS);

    if (signedError || !signedData?.signedUrl) {
      throw new Error(signedError?.message ?? "Unable to create signed export URL.");
    }

    const expiresAt = new Date(Date.now() + EXPORT_URL_TTL_SECONDS * 1000).toISOString();

    await writeProjectAuditLog({
      supabase,
      projectId,
      userId: user.id,
      action: "project-export-zip",
      result: "success",
      details: {
        filePath,
      },
    });

    return jsonResponse({
      downloadUrl: signedData.signedUrl,
      expiresAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Project export failed.";
    return errorResponse(message, 500);
  }
});
