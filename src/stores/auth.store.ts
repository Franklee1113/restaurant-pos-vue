import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

const TOKEN_KEY = 'pb_token'
const USER_KEY = 'pb_user'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY))
  const user = ref<Record<string, unknown> | null>(null)
  const isLoggingIn = ref(false)

  try {
    const raw = localStorage.getItem(USER_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      // 防止原型链污染
      delete (parsed as any).__proto__
      delete (parsed as any).constructor
      user.value = parsed
    }
  } catch {
    user.value = null
  }

  const isLoggedIn = computed(() => !!token.value && !!user.value)
  const userEmail = computed(() => user.value?.email || '管理员')

  function saveAuth(newToken: string, newUser: Record<string, unknown>) {
    delete (newUser as any).__proto__
    delete (newUser as any).constructor
    token.value = newToken
    user.value = newUser
    localStorage.setItem(TOKEN_KEY, newToken)
    localStorage.setItem(USER_KEY, JSON.stringify(newUser))
  }

  function clearAuth() {
    token.value = null
    user.value = null
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }

  async function login(email: string, password: string) {
    if (isLoggingIn.value) {
      return { success: false, error: '登录请求进行中，请稍候' }
    }
    isLoggingIn.value = true
    try {
      const res = await fetch('/api/collections/users/auth-with-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: email, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        return { success: false, error: data.message || `登录失败 (${res.status})` }
      }
      if (data.token) {
        saveAuth(data.token, data.record)
        return { success: true }
      }
      return { success: false, error: data.message || '登录失败' }
    } catch {
      return { success: false, error: '网络异常，请检查连接' }
    } finally {
      isLoggingIn.value = false
    }
  }

  function logout() {
    clearAuth()
    window.location.href = '/login'
  }

  return {
    token,
    user,
    isLoggedIn,
    userEmail,
    login,
    logout,
  }
})
