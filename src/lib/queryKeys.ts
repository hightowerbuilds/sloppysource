export function documentsQueryKey(userId: string | null) {
  return ["documents", userId] as const;
}

export function documentQueryKey(userId: string | null, docId: string | null) {
  return ["document", userId, docId] as const;
}

export function storageUsageQueryKey(userId: string | null) {
  return ["storage-usage", userId] as const;
}

export function projectsQueryKey(userId: string | null) {
  return ["projects", userId] as const;
}

export function projectActivityQueryKey(userId: string | null, projectId: string) {
  return ["project-activity", userId, projectId] as const;
}
