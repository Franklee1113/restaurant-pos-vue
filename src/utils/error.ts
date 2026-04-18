export function getErrorMessage(err: unknown, fallback = '未知错误'): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return fallback
}
