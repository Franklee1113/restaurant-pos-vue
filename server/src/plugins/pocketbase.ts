import PocketBase from 'pocketbase'
import { config } from '../config'

let pb: PocketBase | null = null
let adminToken: string | null = null

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
 * 服务账号认证（Admin）
 * 使用手动 fetch 调用，避免 SDK 版本兼容问题
 */
export async function authenticateServiceAccount(): Promise<void> {
  try {
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

    // 设置 SDK 实例的 authStore
    const client = getPocketBase()
    client.authStore.save(adminToken!, data.admin)

    console.log('✅ PocketBase 服务账号认证成功')
  } catch (err) {
    console.error('❌ PocketBase 服务账号认证失败:', err)
    throw new Error('无法连接到数据库服务')
  }
}

/**
 * 健康检查：验证 PocketBase 连接状态
 */
export async function checkPocketBaseHealth(): Promise<boolean> {
  try {
    const client = getPocketBase()
    // 尝试获取 settings 集合验证连接
    await client.collection('settings').getList(1, 1)
    return true
  } catch {
    return false
  }
}
