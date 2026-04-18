import { PB_URL } from '@/api/pocketbase'

export function getFileUrl(
  collection: string,
  recordId: string | undefined,
  filename: string | undefined,
): string | null {
  if (!recordId || !filename) return null
  return `${PB_URL}/files/${collection}/${recordId}/${filename}`
}
