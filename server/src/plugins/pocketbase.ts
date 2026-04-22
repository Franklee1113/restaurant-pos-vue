import PocketBase from 'pocketbase'
import { config } from '../config'
import { decodeJwtPayload, isTokenExpiringSoon } from '../utils/pocketbase'

let pb: PocketBase | null = null
let adminToken: string | null = null
let tokenExpiresAt: number | null = null
let refreshTimer: ReturnType<typeof setInterval> | null = null

/** 定时检查间隔：6 小时 */
const REFRESH_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
/** 提前刷新阈值：24 小时 */
const TOKEN_REFRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000

/**
 * 获取 PocketBase 实例（单例）
 */
export function getPocketBase(): PocketBase {
  if (!pb) {
    pb = new PocketBase(config.PB_URL)
  }
  return pb
}

/**
 * 获取 Admin Token
 */
export function getAdminToken(): string | null {
  return adminToken
}

/**
 * 获取 Token 过期时间（Unix 时间戳，毫秒）
 */
export function getTokenExpiresAt(): number | null {
  return tokenExpiresAt
}

/* ------------------------------------------------------------------ */
/* 认证与刷新逻辑                                                        */
/* ------------------------------------------------------------------ */

async function performAuth(): Promise<void> {
  const res = await fetch(`${config.PB_URL}/api/admins/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identity: config.PB_ADMIN_EMAIL,
      password: config.PB_ADMIN_PASSWORD,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `HTTP ${res.status}`)
  }

  const data = await res.json()
  adminToken = data.token

  // 解析 JWT 记录过期时间
  const payload = decodeJwtPayload(adminToken!)
  if (payload && typeof payload.exp === 'number') {
    tokenExpiresAt = payload.exp * 1000
  } else {
    tokenExpiresAt = null
  }

  // 设置 SDK 实例的 authStore
  const client = getPocketBase()
  client.authStore.save(adminToken!, data.admin)
}

/**
 * 服务账号认证（Admin）
 * 使用手动 fetch 调用，避免 SDK 版本兼容问题
 */
export async function authenticateServiceAccount(): Promise<void> {
  try {
    await performAuth()
    setupRefreshTimer()
    console.log('✅ PocketBase 服务账号认证成功')
  } catch (err) {
    console.error('❌ PocketBase 服务账号认证失败:', err)
    throw new Error('无法连接到数据库服务')
  }
}

/**
 * 在需要时刷新 Admin Token
 * @returns 是否执行了刷新
 */
export async function refreshAdminTokenIfNeeded(): Promise<boolean> {
  if (!adminToken) {
    await performAuth()
    return true
  }

  if (isTokenExpiringSoon(adminToken, TOKEN_REFRESH_THRESHOLD_MS)) {
    console.log('🔄 Admin Token 即将过期，执行刷新...')
    await performAuth()
    return true
  }

  return false
}

function setupRefreshTimer(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }

  refreshTimer = setInterval(() => {
    refreshAdminTokenIfNeeded().catch((err) => {
      console.error('⏰ 定时刷新 Admin Token 失败:', err)
    })
  }, REFRESH_CHECK_INTERVAL_MS)
}

/**
 * 停止定时刷新（用于优雅关闭）
 */
export function stopRefreshTimer(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

/* ------------------------------------------------------------------ */
/* 健康检查                                                            */
/* ------------------------------------------------------------------ */

/**
 * 健康检查：验证 PocketBase 连接状态
 * 若检测到 Token 过期（401），会尝试自动刷新一次
 */
export async function checkPocketBaseHealth(): Promise<boolean> {
  try {
    const client = getPocketBase()
    // 尝试获取 settings 集合验证连接
    await client.collection('settings').getList(1, 1)
    return true
  } catch (err) {
    const status = (err as { status?: number }).status
    if (status === 401) {
      console.warn('⚠️ PocketBase 健康检查返回 401，尝试刷新 Token...')
      try {
        await performAuth()
        // 重试一次
        const client = getPocketBase()
        await client.collection('settings').getList(1, 1)
        return true
      } catch {
        return false
      }
    }
    return false
  }
}
