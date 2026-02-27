export interface DocMeta {
  id: string
  name: string
  sizeBytes: number
  createdAt: string
  updatedAt: string
}

export interface DocDetail extends DocMeta {
  markdown: string
}

export interface StoredDocMeta extends DocMeta {
  fileName: string
}
