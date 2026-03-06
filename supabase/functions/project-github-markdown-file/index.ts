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

interface MarkdownBody {
  projectId?: string;
  path?: string;
}

interface GitHubContentFileRow {
  type: string;
  name: string;
  path: string;
  html_url: string | null;
  content?: string;
  encoding?: string;
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
    const body = await req.json() as MarkdownBody;
    const projectId = body.projectId?.trim() ?? "";
    const path = body.path?.trim() ?? "";

    if (!projectId) return errorResponse("projectId is required.", 400);
    if (!path) return errorResponse("path is required.", 400);
    if (!isValidRootMarkdownPath(path)) {
      return errorResponse("path must be a root-level .md file.", 400);
    }

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
      const markdownResult = await githubGetJson<GitHubContentFileRow>(
        `/repos/${repoFullName}/contents/${encodeURIComponent(path)}`,
        `Get markdown file ${path} for ${repoFullName}`,
      );

      const row = markdownResult.data;
      if (!isGitHubFileResponse(row)) {
        return errorResponse("Requested path is not a markdown file.", 400);
      }

      const rawContent = row.content ?? "";
      const encoding = (row.encoding ?? "base64").toLowerCase();
      const content = encoding === "base64" ? decodeBase64ToUtf8(rawContent) : rawContent;

      await writeProjectAuditLog({
        supabase,
        projectId,
        userId: user.id,
        action: "project-github-markdown-file",
        result: "success",
        details: {
          repoFullName,
          path: row.path,
          githubRequestId: markdownResult.meta.requestId,
        },
      });

      return jsonResponse({
        projectId,
        repoFullName,
        path: row.path,
        name: row.name,
        htmlUrl: row.html_url ?? `https://github.com/${repoFullName}/blob/HEAD/${row.path}`,
        content,
        encoding,
        pulledAt: new Date().toISOString(),
        githubMeta: markdownResult.meta,
      });
    } catch (error) {
      const mapped = mapGitHubErrorToHttp(error);
      await writeProjectAuditLog({
        supabase,
        projectId,
        userId: user.id,
        action: "project-github-markdown-file",
        result: "error",
        details: {
          repoFullName,
          path,
          ...(mapped.details ?? {}),
        },
      });
      return errorResponse(mapped.message, mapped.status);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch markdown file.";
    return errorResponse(message, 500);
  }
});

function isValidRootMarkdownPath(path: string): boolean {
  return (
    path.length > 0 &&
    !path.includes("/") &&
    !path.includes("\\") &&
    path.toLowerCase().endsWith(".md")
  );
}

function isGitHubFileResponse(value: unknown): value is GitHubContentFileRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<GitHubContentFileRow>;
  return row.type === "file" && typeof row.path === "string" && isValidRootMarkdownPath(row.path);
}

function decodeBase64ToUtf8(value: string): string {
  const normalized = value.replace(/\n/g, "");
  const binary = atob(normalized);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
