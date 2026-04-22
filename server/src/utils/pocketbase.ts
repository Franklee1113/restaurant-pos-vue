/**
 * PocketBase 通用工具函数
 */

/**
 * 转义 PocketBase filter 字符串中的特殊字符
 * PocketBase filter 语法类似 SQL WHERE，使用单引号包裹字符串字面量。
 * 注入风险主要来自单引号闭合以及逻辑操作符（||、&&、~、# 等）。
 */
export function escapePbString(value: string): string {
  if (typeof value !== 'string') return ''
  // 先移除可能被用于注入的操作符字符
  value = value.replace(/[|&<>#~]/g, '')
  // SQL 风格单引号转义（PocketBase 底层使用 SQLite）
  return value.replace(/'/g, "''")
}

/**
 * 验证 PocketBase 记录 ID 格式
 * PocketBase ID 为 15 个字符，仅包含 a-zA-Z0-9_
 */
export function isValidPbId(id: string): boolean {
  return /^[a-zA-Z0-9_]{15}$/.test(id)
}

/**
 * 批量验证 PB ID，返回有效的 ID 列表
 */
export function filterValidPbIds(ids: string[]): string[] {
  return ids.filter(isValidPbId)
}

/* ------------------------------------------------------------------ */
/* JWT 工具（用于 Admin Token 生命周期管理）                              */
/* ------------------------------------------------------------------ */

/**
 * 解码 JWT payload（不验证签名）
 */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const payload = parts[1]
    // base64url → base64 → string
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      '=',
    )
    const decoded = Buffer.from(padded, 'base64').toString('utf-8')
    return JSON.parse(decoded) as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * 检查 JWT 是否即将过期或已经过期
 * @param token JWT 字符串
 * @param thresholdMs 提前多久视为即将过期（默认 24 小时）
 */
export function isTokenExpiringSoon(token: string, thresholdMs = 24 * 60 * 60 * 1000): boolean {
  const payload = decodeJwtPayload(token)
  if (!payload || typeof payload.exp !== 'number') return true
  return Date.now() >= payload.exp * 1000 - thresholdMs
}
