import { supabase } from "./supabase.ts";
import type {
  CreateProjectInput,
  CreateProjectResponse,
  EndProjectSessionResponse,
  ExportProjectZipResponse,
  ProjectGitHubActivityResponse,
  ProjectSummary,
} from "./projectModels.ts";

async function requireAuthenticatedUserId(errorMessage: string): Promise<string> {
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error) throw new Error(error.message);
  if (!user) throw new Error(errorMessage);

  return user.id;
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
  const { data, error } = await supabase.functions.invoke<CreateProjectResponse>(
    "project-create",
    {
      body: input,
    },
  );

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Project creation failed.");

  return data;
}

export async function exportProjectZip(projectId: string): Promise<ExportProjectZipResponse> {
  const { data, error } = await supabase.functions.invoke<ExportProjectZipResponse>(
    "project-export-zip",
    {
      body: { projectId },
    },
  );

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Project export failed.");

  return data;
}

export async function endProjectSession(
  projectId: string,
): Promise<EndProjectSessionResponse> {
  const { data, error } = await supabase.functions.invoke<EndProjectSessionResponse>(
    "project-end-session",
    {
      body: { projectId },
    },
  );

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Ending project session failed.");

  return data;
}

export async function getProjectGitHubActivity(
  projectId: string,
): Promise<ProjectGitHubActivityResponse> {
  const { data, error } = await supabase.functions.invoke<ProjectGitHubActivityResponse>(
    "project-github-activity",
    {
      body: { projectId },
    },
  );

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Fetching project activity failed.");

  return data;
}
