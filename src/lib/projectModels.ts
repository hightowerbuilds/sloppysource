export type ProjectStatus = "active" | "archived" | "deleting" | "deleted" | "error";

export interface ProjectSummary {
  id: string;
  name: string;
  githubRepoFullName: string | null;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  endedAt: string | null;
  lastError: string | null;
}

export interface CreateProjectInput {
  name: string;
  sessionKey: string;
}

export interface CreateProjectResponse {
  projectId: string;
  sessionId: string;
  repoFullName: string;
  status: ProjectStatus;
}

export interface ExportProjectZipResponse {
  downloadUrl: string;
  expiresAt: string;
}

export interface EndProjectSessionResponse {
  projectId: string;
  status: ProjectStatus;
}

export interface ProjectActivityPullRequest {
  id: number;
  number: number;
  title: string;
  state: string;
  draft: boolean;
  mergedAt: string | null;
  updatedAt: string;
  authorLogin: string | null;
  headRef: string;
  baseRef: string;
  url: string;
}

export interface ProjectActivityCheck {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  event: string;
  branch: string | null;
  createdAt: string;
  updatedAt: string;
  url: string;
}

export interface ProjectActivityCommit {
  sha: string;
  shortSha: string;
  message: string;
  authorName: string | null;
  authorLogin: string | null;
  committedAt: string | null;
  url: string;
}

export interface ProjectActivityAuditEvent {
  id: string;
  action: string;
  result: string;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface ProjectActivityMarkdownFile {
  name: string;
  path: string;
  htmlUrl: string;
  size: number;
}

export interface ProjectGitHubMeta {
  status: number;
  requestId: string | null;
  rateLimitRemaining: string | null;
  rateLimitReset: string | null;
  retryAfter: string | null;
}

export interface ProjectGitHubActivityResponse {
  projectId: string;
  repoFullName: string;
  pulledAt: string;
  pullRequests: ProjectActivityPullRequest[];
  checks: ProjectActivityCheck[];
  commits: ProjectActivityCommit[];
  auditEvents: ProjectActivityAuditEvent[];
  markdownFiles: ProjectActivityMarkdownFile[];
  githubMeta: {
    pulls: ProjectGitHubMeta;
    commits: ProjectGitHubMeta;
    checks: ProjectGitHubMeta;
    markdownFiles: ProjectGitHubMeta | null;
  };
}

export interface ProjectMarkdownFileContentResponse {
  projectId: string;
  repoFullName: string;
  path: string;
  name: string;
  htmlUrl: string;
  content: string;
  encoding: string;
  pulledAt: string;
  githubMeta: ProjectGitHubMeta;
}
