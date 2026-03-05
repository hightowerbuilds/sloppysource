import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";

const GITHUB_API_URL = "https://api.github.com";

interface GitHubRepo {
  id: number;
  full_name: string;
  name: string;
  owner: {
    login: string;
  };
}

export interface ProjectUser {
  id: string;
  email: string | null;
}

const CORS_HEADERS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cleanup-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

export function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

export function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

export function preflightResponse(): Response {
  return new Response("ok", {
    status: 200,
    headers: CORS_HEADERS,
  });
}

export function createServiceClient(authHeader?: string): SupabaseClient {
  return createClient(
    getRequiredEnv("SUPABASE_URL"),
    getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      global: authHeader
        ? {
            headers: {
              Authorization: authHeader,
            },
          }
        : undefined,
      auth: {
        persistSession: false,
      },
    },
  );
}

export async function requireProjectUser(req: Request): Promise<{
  supabase: SupabaseClient;
  user: ProjectUser;
}> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) {
    throw new Error("Missing Authorization header.");
  }

  const supabase = createServiceClient(authHeader);
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    throw new Error(error.message);
  }

  const user = mapUser(data.user);
  if (!user) {
    throw new Error("You must be authenticated.");
  }

  return { supabase, user };
}

function mapUser(user: User | null): ProjectUser | null {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email ?? null,
  };
}

export function resolveProjectRepoName(projectName: string): string {
  const prefix = Deno.env.get("GITHUB_REPO_PREFIX") ?? "sloppy-project";
  const slug = slugify(projectName) || "project";
  const random = crypto.randomUUID().split("-")[0] ?? "repo";
  const candidate = `${prefix}-${slug}-${random}`;

  return candidate.slice(0, 96);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 56);
}

export async function githubCreateRepoFromTemplate(
  repoName: string,
): Promise<GitHubRepo> {
  const token = getRequiredEnv("GITHUB_TOKEN");
  const templateOwner = getRequiredEnv("GITHUB_TEMPLATE_OWNER");
  const templateRepo = getRequiredEnv("GITHUB_TEMPLATE_REPO");
  const targetOwner = getRequiredEnv("GITHUB_OWNER");

  const response = await fetch(
    `${GITHUB_API_URL}/repos/${templateOwner}/${templateRepo}/generate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        owner: targetOwner,
        name: repoName,
        private: true,
        include_all_branches: false,
      }),
    },
  );

  if (!response.ok) {
    const errorText = await safeReadBody(response);
    throw new Error(`GitHub template generation failed: ${errorText}`);
  }

  return await response.json() as GitHubRepo;
}

export async function githubDeleteRepoByFullName(fullName: string): Promise<void> {
  const token = getRequiredEnv("GITHUB_TOKEN");

  const response = await fetch(`${GITHUB_API_URL}/repos/${fullName}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (response.status === 204 || response.status === 404) {
    return;
  }

  const errorText = await safeReadBody(response);
  throw new Error(`GitHub repo delete failed: ${errorText}`);
}

export async function githubDownloadRepoArchive(fullName: string): Promise<Uint8Array> {
  const token = getRequiredEnv("GITHUB_TOKEN");

  const response = await fetch(`${GITHUB_API_URL}/repos/${fullName}/zipball`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    const errorText = await safeReadBody(response);
    throw new Error(`GitHub archive download failed: ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

export async function safeReadBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text || `status ${response.status}`;
  } catch {
    return `status ${response.status}`;
  }
}

export async function writeProjectAuditLog(args: {
  supabase: SupabaseClient;
  projectId?: string;
  userId?: string;
  action: string;
  result: string;
  details?: Record<string, unknown>;
}) {
  await args.supabase.from("project_audit_logs").insert({
    project_id: args.projectId ?? null,
    user_id: args.userId ?? null,
    action: args.action,
    result: args.result,
    details: args.details ?? null,
  });
}
