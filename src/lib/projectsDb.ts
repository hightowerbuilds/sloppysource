import { supabase } from "./supabase.ts";
import type {
  CreateProjectInput,
  CreateProjectResponse,
  EndProjectSessionResponse,
  ExportProjectZipResponse,
  ProjectGitHubActivityResponse,
  ProjectMarkdownFileContentResponse,
  ProjectSummary,
} from "./projectModels.ts";

async function requireAuthenticatedUserId(errorMessage: string): Promise<string> {
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error) throw new Error(error.message);
  if (!user) throw new Error(errorMessage);

  return user.id;
}

async function requireAuthenticatedAccessToken(errorMessage: string): Promise<string> {
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError) throw new Error(userError.message);
  if (!user) throw new Error(errorMessage);

  const initialSessionResult = await supabase.auth.getSession();
  if (initialSessionResult.error) throw new Error(initialSessionResult.error.message);
  let session = initialSessionResult.data.session;

  const expiresAtMs = (session?.expires_at ?? 0) * 1000;
  const shouldRefresh = !session?.access_token || expiresAtMs <= Date.now() + 30_000;

  if (shouldRefresh) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) throw new Error(refreshError.message);
    session = refreshed.session;
  }

  if (!session?.access_token) throw new Error(errorMessage);

  return session.access_token;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const userId = await requireAuthenticatedUserId("You must be logged in to view projects.");

  const { data, error } = await supabase
    .from("projects")
    .select("id, name, github_repo_full_name, status, created_at, updated_at, ended_at, last_error")
    .eq("user_id", userId)
    .neq("status", "deleted")
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    githubRepoFullName: (row.github_repo_full_name as string | null) ?? null,
    status: row.status as ProjectSummary["status"],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    endedAt: (row.ended_at as string | null) ?? null,
    lastError: (row.last_error as string | null) ?? null,
  }));
}

export async function createProject(
  input: CreateProjectInput,
): Promise<CreateProjectResponse> {
  const accessToken = await requireAuthenticatedAccessToken(
    "You must be logged in to create a project.",
  );

  const { data, error } = await supabase.functions.invoke<CreateProjectResponse>(
    "project-create",
    {
      body: input,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Project creation failed.");

  return data;
}

export async function exportProjectZip(projectId: string): Promise<ExportProjectZipResponse> {
  const accessToken = await requireAuthenticatedAccessToken(
    "You must be logged in to export this project.",
  );

  const { data, error } = await supabase.functions.invoke<ExportProjectZipResponse>(
    "project-export-zip",
    {
      body: { projectId },
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Project export failed.");

  return data;
}

export async function endProjectSession(
  projectId: string,
): Promise<EndProjectSessionResponse> {
  const accessToken = await requireAuthenticatedAccessToken(
    "You must be logged in to end this project session.",
  );

  const { data, error } = await supabase.functions.invoke<EndProjectSessionResponse>(
    "project-end-session",
    {
      body: { projectId },
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Ending project session failed.");

  return data;
}

export async function getProjectGitHubActivity(
  projectId: string,
): Promise<ProjectGitHubActivityResponse> {
  const accessToken = await requireAuthenticatedAccessToken(
    "Your session expired. Please log in again to load project activity.",
  );

  const { data, error } = await supabase.functions.invoke<ProjectGitHubActivityResponse>(
    "project-github-activity",
    {
      body: { projectId },
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Fetching project activity failed.");

  return data;
}

export async function getProjectMarkdownFile(
  projectId: string,
  path: string,
): Promise<ProjectMarkdownFileContentResponse> {
  const accessToken = await requireAuthenticatedAccessToken(
    "Your session expired. Please log in again to load markdown files.",
  );

  const { data, error } = await supabase.functions.invoke<ProjectMarkdownFileContentResponse>(
    "project-github-markdown-file",
    {
      body: { projectId, path },
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Fetching project markdown file failed.");

  return data;
}
