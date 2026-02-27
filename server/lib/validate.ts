import path from 'node:path'

export const MAX_MARKDOWN_BYTES = 100 * 1024 * 1024
const ALLOWED_EXTENSIONS = new Set(['.md', '.markdown'])

export interface ValidationError {
  status: number
  message: string
}

export function validateMarkdownUpload(file: File): ValidationError | null {
  const extension = path.extname(file.name).toLowerCase()

  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return {
      status: 400,
      message: 'Only .md and .markdown files are supported.',
    }
  }

  if (file.size === 0) {
    return {
      status: 400,
      message: 'File is empty. Upload a markdown document with content.',
    }
  }

  if (file.size > MAX_MARKDOWN_BYTES) {
    return {
      status: 413,
      message: 'File exceeds the 100MB limit.',
    }
  }

  return null
}
