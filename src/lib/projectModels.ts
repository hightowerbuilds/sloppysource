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
