import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";

const GITHUB_API_URL = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const GITHUB_MAX_RETRIES = 2;
const GITHUB_RETRY_BASE_DELAY_MS = 350;

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

export interface GitHubResponseMeta {
  status: number;
  requestId: string | null;
  rateLimitRemaining: string | null;
  rateLimitReset: string | null;
  retryAfter: string | null;
}

export class GitHubApiError extends Error {
  readonly operation: string;
  readonly status: number;
  readonly errorBody: string;
  readonly meta: GitHubResponseMeta;

  constructor(args: {
    operation: string;
    status: number;
    message: string;
    errorBody: string;
    meta: GitHubResponseMeta;
  }) {
    super(args.message);
    this.name = "GitHubApiError";
    this.operation = args.operation;
    this.status = args.status;
    this.errorBody = args.errorBody;
    this.meta = args.meta;
  }
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
): Promise<{ repo: GitHubRepo; meta: GitHubResponseMeta }> {
  const templateOwner = getRequiredEnv("GITHUB_TEMPLATE_OWNER");
  const templateRepo = getRequiredEnv("GITHUB_TEMPLATE_REPO");
  const targetOwner = getRequiredEnv("GITHUB_OWNER");

  const { response, meta } = await githubRequest(
    `/repos/${templateOwner}/${templateRepo}/generate`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        owner: targetOwner,
        name: repoName,
        private: true,
        include_all_branches: false,
      }),
    },
    `Create repo from template ${templateOwner}/${templateRepo}`,
  );

  const repo = await response.json() as GitHubRepo;
  return { repo, meta };
}

export async function githubDeleteRepoByFullName(fullName: string): Promise<GitHubResponseMeta> {
  const { meta } = await githubRequest(
    `/repos/${fullName}`,
    {
      method: "DELETE",
    },
    `Delete repo ${fullName}`,
    { acceptStatuses: [204, 404] },
  );

  return meta;
}

export async function githubDownloadRepoArchive(fullName: string): Promise<Uint8Array> {
  const { response } = await githubRequest(
    `/repos/${fullName}/zipball`,
    {
      method: "GET",
      redirect: "follow",
    },
    `Download archive ${fullName}`,
  );

  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

export async function githubGetJson<T>(path: string, operation: string): Promise<{
  data: T;
  meta: GitHubResponseMeta;
}> {
  const { response, meta } = await githubRequest(path, { method: "GET" }, operation);
  const data = await response.json() as T;
  return { data, meta };
}

export function mapGitHubErrorToHttp(error: unknown): {
  status: number;
  message: string;
  details?: Record<string, unknown>;
} {
  if (!(error instanceof GitHubApiError)) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    return { status: 500, message };
  }

  const baseDetails = {
    operation: error.operation,
    githubStatus: error.status,
    githubRequestId: error.meta.requestId,
    rateLimitRemaining: error.meta.rateLimitRemaining,
    rateLimitReset: error.meta.rateLimitReset,
    retryAfter: error.meta.retryAfter,
    githubMessage: error.message,
  };

  if (error.status === 401 || error.status === 403) {
    return {
      status: 502,
      message: "GitHub authentication or permissions are not configured correctly.",
      details: baseDetails,
    };
  }

  if (error.status === 404) {
    return {
      status: 502,
      message: "GitHub repository or template was not found.",
      details: baseDetails,
    };
  }

  if (error.status === 422) {
    return {
      status: 409,
      message: "GitHub rejected repository creation. The generated repo name may already exist.",
      details: baseDetails,
    };
  }

  if (error.status === 429 || error.status >= 500) {
    return {
      status: 503,
      message: "GitHub is temporarily unavailable. Please retry shortly.",
      details: baseDetails,
    };
  }

  return {
    status: 502,
    message: "GitHub request failed.",
    details: baseDetails,
  };
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

function buildGitHubHeaders(token: string, initHeaders?: HeadersInit): Headers {
  const headers = new Headers(initHeaders);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/vnd.github+json");
  headers.set("X-GitHub-Api-Version", GITHUB_API_VERSION);
  return headers;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function parseRetryAfterMs(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (!Number.isNaN(seconds) && seconds > 0) {
    return seconds * 1000;
  }
  return null;
}

function backoffMs(attempt: number): number {
  return GITHUB_RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
}

function toGitHubMeta(response: Response): GitHubResponseMeta {
  return {
    status: response.status,
    requestId: response.headers.get("x-github-request-id"),
    rateLimitRemaining: response.headers.get("x-ratelimit-remaining"),
    rateLimitReset: response.headers.get("x-ratelimit-reset"),
    retryAfter: response.headers.get("retry-after"),
  };
}

function parseGitHubMessage(rawBody: string): string {
  if (!rawBody) return "GitHub request failed.";

  try {
    const parsed = JSON.parse(rawBody) as { message?: string; errors?: unknown };
    const msg = parsed.message?.trim();
    if (msg) return msg;
  } catch {
    // keep raw body fallback below
  }

  return rawBody.slice(0, 400);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function githubRequest(
  path: string,
  init: RequestInit,
  operation: string,
  options?: { acceptStatuses?: number[] },
): Promise<{ response: Response; meta: GitHubResponseMeta }> {
  const token = getRequiredEnv("GITHUB_TOKEN");
  const acceptStatuses = options?.acceptStatuses ?? [];
  const url = path.startsWith("http") ? path : `${GITHUB_API_URL}${path}`;

  for (let attempt = 0; attempt <= GITHUB_MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        headers: buildGitHubHeaders(token, init.headers),
      });
      const meta = toGitHubMeta(response);

      if (response.ok || acceptStatuses.includes(response.status)) {
        return { response, meta };
      }

      const errorText = await safeReadBody(response);

      if (attempt < GITHUB_MAX_RETRIES && isRetryableStatus(response.status)) {
        const retryAfterMs = parseRetryAfterMs(meta.retryAfter);
        await sleep(retryAfterMs ?? backoffMs(attempt));
        continue;
      }

      throw new GitHubApiError({
        operation,
        status: response.status,
        message: parseGitHubMessage(errorText),
        errorBody: errorText,
        meta,
      });
    } catch (error) {
      if (error instanceof GitHubApiError) {
        throw error;
      }

      if (attempt < GITHUB_MAX_RETRIES) {
        await sleep(backoffMs(attempt));
        continue;
      }

      const message = error instanceof Error ? error.message : "Unknown GitHub request error.";
      throw new Error(`${operation} failed: ${message}`);
    }
  }

  throw new Error(`${operation} failed: exhausted retries.`);
}
