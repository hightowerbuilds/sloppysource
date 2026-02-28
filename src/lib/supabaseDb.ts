import { supabase } from './supabase.ts'

export interface StoredDocument {
  id: string
  name: string
  markdown: string
  sizeBytes: number
  createdAt: string
  updatedAt: string
}

export type DocumentMeta = Omit<StoredDocument, 'markdown'>

const MAX_USER_STORAGE_BYTES = 100 * 1024 * 1024 // 100 MB

export async function listDocuments(): Promise<DocumentMeta[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('id, name, size_bytes, created_at, updated_at')
    .order('updated_at', { ascending: false })

  if (error) throw new Error(error.message)

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    sizeBytes: Number(row.size_bytes),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }))
}

export async function getDocument(id: string): Promise<StoredDocument | null> {
  const { data, error } = await supabase
    .from('documents')
    .select('id, name, markdown, size_bytes, created_at, updated_at')
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null

  return {
    id: data.id as string,
    name: data.name as string,
    markdown: data.markdown as string,
    sizeBytes: Number(data.size_bytes),
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  }
}

export async function putDocument(document: StoredDocument): Promise<StoredDocument> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('You must be logged in to upload documents.')

  // Check storage quota (exclude this document in case of overwrite)
  const { data: usageData, error: usageError } = await supabase
    .from('documents')
    .select('size_bytes')
    .neq('id', document.id)

  if (usageError) throw new Error(usageError.message)

  const currentUsage = (usageData ?? []).reduce(
    (sum, row) => sum + Number(row.size_bytes),
    0,
  )

  if (currentUsage + document.sizeBytes > MAX_USER_STORAGE_BYTES) {
    const remainingMb = ((MAX_USER_STORAGE_BYTES - currentUsage) / (1024 * 1024)).toFixed(1)
    throw new Error(
      `Upload would exceed your 100 MB storage limit. You have ${remainingMb} MB remaining.`,
    )
  }

  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('documents')
    .upsert({
      id: document.id,
      user_id: user.id,
      name: document.name,
      markdown: document.markdown,
      size_bytes: document.sizeBytes,
      created_at: document.createdAt,
      updated_at: now,
    })
    .select('id, name, markdown, size_bytes, created_at, updated_at')
    .single()

  if (error) throw new Error(error.message)

  return {
    id: data.id as string,
    name: data.name as string,
    markdown: data.markdown as string,
    sizeBytes: Number(data.size_bytes),
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  }
}

export async function deleteDocument(id: string): Promise<void> {
  const { error } = await supabase
    .from('documents')
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message)
}

export async function clearDocuments(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('You must be logged in.')

  const { error } = await supabase
    .from('documents')
    .delete()
    .eq('user_id', user.id)

  if (error) throw new Error(error.message)
}

export async function getUserStorageUsage(): Promise<{ usedBytes: number; limitBytes: number }> {
  const { data, error } = await supabase
    .from('documents')
    .select('size_bytes')

  if (error) throw new Error(error.message)

  const usedBytes = (data ?? []).reduce(
    (sum, row) => sum + Number(row.size_bytes),
    0,
  )

  return { usedBytes, limitBytes: MAX_USER_STORAGE_BYTES }
}
