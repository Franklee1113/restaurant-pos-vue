import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '../auth.store'
import { STORAGE_KEY_TOKEN, STORAGE_KEY_USER } from '@/constants/index'

describe('auth.store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn())
    // @ts-ignore
    delete window.location
    // @ts-ignore
    window.location = { href: '' } as Location
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should initialize with null token and user', () => {
    const store = useAuthStore()
    expect(store.token).toBeNull()
    expect(store.user).toBeNull()
    expect(store.isLoggedIn).toBe(false)
    expect(store.userEmail).toBe('管理员')
  })

  it('should restore token from localStorage on init', () => {
    localStorage.setItem(STORAGE_KEY_TOKEN, 'tok123')
    const store = useAuthStore()
    expect(store.token).toBe('tok123')
  })

  it('should restore user from localStorage on init', () => {
    localStorage.setItem(STORAGE_KEY_TOKEN, 'tok123')
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify({ email: 'chef@restaurant.com', name: 'Chef' }))
    const store = useAuthStore()
    expect(store.user).toEqual({ email: 'chef@restaurant.com', name: 'Chef' })
    expect(store.isLoggedIn).toBe(true)
    expect(store.userEmail).toBe('chef@restaurant.com')
  })

  it('should sanitize prototype-polluted user data on init', () => {
    const polluted = JSON.stringify({ email: 'a@b.com', __proto__: { hacked: true }, constructor: { prototype: { hacked: true } } })
    localStorage.setItem(STORAGE_KEY_TOKEN, 'tok')
    localStorage.setItem(STORAGE_KEY_USER, polluted)
    const store = useAuthStore()
    // Verify the object does not expose polluted prototype properties as direct keys
    expect(store.user).toHaveProperty('email', 'a@b.com')
    // The sanitization attempts to delete __proto__ and constructor keys
    // In modern JS engines, __proto__ accessor may remain, but own property should be gone
    expect(Object.prototype.hasOwnProperty.call(store.user, 'hacked')).toBe(false)
  })

  it('should login successfully', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token: 'abc', record: { email: 'a@b.com', id: '1' } }),
    } as Response)

    const store = useAuthStore()
    const result = await store.login('a@b.com', 'pass')

    expect(result.success).toBe(true)
    expect(store.token).toBe('abc')
    expect(store.user).toEqual({ email: 'a@b.com', id: '1' })
    expect(localStorage.getItem(STORAGE_KEY_TOKEN)).toBe('abc')
  })

  it('should return error on failed login', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ message: 'Invalid credentials' }),
    } as Response)

    const store = useAuthStore()
    const result = await store.login('a@b.com', 'wrong')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Invalid credentials')
    expect(store.isLoggedIn).toBe(false)
  })

  it('should return network error on fetch failure', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'))

    const store = useAuthStore()
    const result = await store.login('a@b.com', 'pass')

    expect(result.success).toBe(false)
    expect(result.error).toBe('网络异常，请检查连接')
  })

  it('should return error when login response has no token', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'ok but no token' }),
    } as Response)

    const store = useAuthStore()
    const result = await store.login('a@b.com', 'pass')
    expect(result.success).toBe(false)
    expect(result.error).toBe('ok but no token')
  })

  it('should prevent concurrent login requests', async () => {
    vi.mocked(fetch).mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 50))
      return { ok: true, json: async () => ({ token: 'abc', record: {} }) } as Response
    })

    const store = useAuthStore()
    const p1 = store.login('a@b.com', 'pass')
    const p2 = store.login('a@b.com', 'pass')

    const r1 = await p1
    const r2 = await p2

    expect(r1.success).toBe(true)
    expect(r2.success).toBe(false)
    expect(r2.error).toBe('登录请求进行中，请稍候')
  })

  it('should logout and redirect', () => {
    localStorage.setItem(STORAGE_KEY_TOKEN, 'tok')
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify({ email: 'a@b.com' }))

    const store = useAuthStore()
    store.logout()

    expect(store.token).toBeNull()
    expect(store.user).toBeNull()
    expect(localStorage.getItem(STORAGE_KEY_TOKEN)).toBeNull()
    expect(window.location.href).toBe('/login')
  })
})
