/**
 * PocketBase API 封装
 * 智能点菜系统 - 订单管理模块
 */

import {
  STORAGE_KEY_TOKEN,
  STORAGE_KEY_USER,
  COLLECTION_ORDERS,
  COLLECTION_DISHES,
  COLLECTION_SETTINGS,
  COLLECTION_TABLE_STATUS,
  ITEM_STATUS_PENDING,
  ITEM_STATUS_COOKING,
  ITEM_STATUS_COOKED,
  ITEM_STATUS_SERVED,
} from '@/constants/index'

export const PB_URL = import.meta.env.VITE_PB_URL || '/api'
const REQUEST_TIMEOUT = 30000 // 30秒超时

// P1-36: Sentry 异常上报（仅在生产环境且已配置 DSN 时生效）
function sentryCapture(err: Error, context?: Record<string, unknown>) {
  if (import.meta.env.PROD) {
    import('@sentry/vue')
      .then((Sentry) => Sentry.captureException(err, { extra: context }))
      .catch(() => { /* noop */ })
  }
}

export class APIError extends Error {
  constructor(
    message: string,
    public status?: number,
    public data?: unknown,
  ) {
    super(message)
    this.name = 'APIError'
  }
}

export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout = REQUEST_TIMEOUT,
): Promise<Response> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    clearTimeout(id)
    return response
  } catch (error: unknown) {
    clearTimeout(id)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new APIError('请求超时，请稍后重试', 408)
    }
    // P1-5: 统一包装非 AbortError 网络错误
    const apiErr = new APIError(error instanceof Error ? error.message : '网络请求失败', 0)
    sentryCapture(apiErr, { url, phase: 'fetch' })
    throw apiErr
  }
}

// P1-1: handleResponse 返回 T | null，不再用 null as T 欺骗类型系统
export async function handleResponse<T>(response: Response): Promise<T | null> {
  if (!response.ok) {
    let errorMessage = '请求失败'
    let errorData = null

    try {
      const errorJson = await response.json()
      errorMessage = errorJson.message || errorJson.error || `HTTP ${response.status}`
      errorData = errorJson
    } catch {
      errorMessage = `HTTP ${response.status}: ${response.statusText}`
    }

    if (response.status === 401) {
      const token = localStorage.getItem(STORAGE_KEY_TOKEN)
      if (token) {
        errorMessage = '登录已过期，请重新登录'
        localStorage.removeItem(STORAGE_KEY_TOKEN)
        localStorage.removeItem(STORAGE_KEY_USER)
        window.location.replace('/login')
      }
    }

    // P1-6: 增加 403 处理
    if (response.status === 403) {
      errorMessage = '权限不足，无法执行此操作'
    }

    const apiErr = new APIError(errorMessage, response.status, errorData)
    if (response.status >= 500) {
      sentryCapture(apiErr, { status: response.status, url: response.url })
    }
    throw apiErr
  }

  // P1-7: 兼容 204 No Content
  if (response.status === 204) {
    return null
  }

  return response.json()
}

// P1-8: Token 过期校验
function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1] || ''))
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      return true
    }
  } catch {
    // 解析失败视为未过期，由服务端最终校验
  }
  return false
}

async function getAdminToken(): Promise<string> {
  const token = localStorage.getItem(STORAGE_KEY_TOKEN) || ''
  if (token && isTokenExpired(token)) {
    localStorage.removeItem(STORAGE_KEY_TOKEN)
    localStorage.removeItem(STORAGE_KEY_USER)
    window.location.replace('/login')
    return ''
  }
  return token
}

// P1-9 / P1-10: 统一封装 privateRequest（必须认证）和 publicRequest（允许匿名）
async function privateRequest<T>(
  url: string,
  options: RequestInit = {},
): Promise<T | null> {
  const token = await getAdminToken()
  if (!token) {
    throw new APIError('未登录或登录已过期', 401)
  }

  const headers = new Headers(options.headers)
  headers.set('Authorization', `Bearer ${token}`)
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const res = await fetchWithTimeout(url, { ...options, headers })
  return handleResponse<T>(res)
}

async function publicRequest<T>(
  url: string,
  options: RequestInit = {},
): Promise<T | null> {
  const headers = new Headers(options.headers)
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const res = await fetchWithTimeout(url, { ...options, headers })
  return handleResponse<T>(res)
}

/**
 * PocketBase filter 字符串转义：防御 Filter 注入
 */
export function escapePbString(value: string): string {
  value = value.replace(/[|&<>#]/g, '')
  return value.replace(/'/g, "''")
}

function validateTableNo(tableNo: string): boolean {
  return /^[a-zA-Z0-9\u4e00-\u9fa5-]+$/.test(tableNo)
}

export interface ListResult<T> {
  page: number
  perPage: number
  totalItems: number
  totalPages: number
  items: T[]
}

export interface OrderItem {
  dishId: string
  name: string
  price: number
  quantity: number
  remark?: string
  status?: typeof ITEM_STATUS_PENDING | typeof ITEM_STATUS_COOKING | typeof ITEM_STATUS_COOKED | typeof ITEM_STATUS_SERVED
}

// P1-2: Order.status 改为联合类型
export type OrderStatusValue = 'pending' | 'cooking' | 'serving' | 'completed' | 'settled' | 'cancelled'

export interface Order {
  id: string
  orderNo: string
  tableNo: string
  guests: number
  status: OrderStatusValue
  items: OrderItem[]
  totalAmount: number
  discount: number
  discountType: 'amount' | 'percent'
  discountValue: number
  finalAmount: number
  waiter?: string
  remark?: string
  source?: 'staff' | 'customer'
  customerPhone?: string
  cutlery?: {
    type: 'free' | 'charged'
    quantity: number
    unitPrice: number
    totalPrice: number
  }
  created: string
  updated: string
}

// P1-3: 创建/更新订单专用 DTO，排除服务端生成字段
export interface CreateOrderPayload {
  orderNo?: string
  tableNo: string
  guests: number
  items: OrderItem[]
  status?: OrderStatusValue
  discountType?: 'amount' | 'percent'
  discountValue?: number
  totalAmount?: number
  discount?: number
  finalAmount?: number
  waiter?: string
  remark?: string
  source?: 'staff' | 'customer'
  customerPhone?: string
  cutlery?: {
    type: 'free' | 'charged'
    quantity: number
    unitPrice: number
    totalPrice: number
  }
}

export interface Dish {
  id: string
  name: string
  price: number
  category: string
  description?: string
}

export interface TableStatus {
  id: string
  tableNo: string
  status: 'idle' | 'dining' | 'pending_clear'
  currentOrderId?: string
  openedAt?: string
  updated?: string
}

export interface Settings {
  id: string
  restaurantName?: string
  address?: string
  phone?: string
  categories?: string[]
  tableNumbers?: string[]
  wechatPayQr?: string
  alipayQr?: string
}

// P1-37: 后端聚合统计响应
export interface StatsResponse {
  totalOrders: number
  totalRevenue: number
  settledOrders: number
  completedOrders: number
  cancelledOrders: number
  averageOrderValue: number
  daily: Array<{ date: string; revenue: number; count: number }>
  hourly: Array<{ hour: number; count: number; revenue: number }>
  status: Array<{ status: string; count: number }>
  tables: Array<{ tableNo: string; revenue: number; count: number }>
  dishes: Array<{ name: string; quantity: number; revenue: number }>
}

class MemoryCache {
  private store = new Map<string, { value: unknown; expiry: number }>()
  get<T>(key: string): T | undefined {
    const entry = this.store.get(key)
    if (!entry) return undefined
    if (Date.now() > entry.expiry) {
      this.store.delete(key)
      return undefined
    }
    return entry.value as T
  }
  set(key: string, value: unknown, ttlMs: number): void {
    this.store.set(key, { value, expiry: Date.now() + ttlMs })
  }
  clear(key?: string): void {
    if (key) this.store.delete(key)
    else this.store.clear()
  }
}
export const apiCache = new MemoryCache()

// P1-4: 提取 appendOrderItems 中的合并逻辑为公共纯函数
export function mergeOrderItems(existingItems: OrderItem[], newItems: OrderItem[]): OrderItem[] {
  const merged = [...existingItems]
  for (const item of newItems) {
    const existing = merged.find((i) => i.dishId === item.dishId)
    if (existing) {
      existing.quantity = Math.round((existing.quantity + item.quantity) * 10) / 10
      if (item.remark) existing.remark = item.remark
      // 追加的菜品需要重新制作，状态重置为 pending
      if (existing.status && existing.status !== ITEM_STATUS_PENDING) {
        existing.status = ITEM_STATUS_PENDING
      }
    } else {
      merged.push({ ...item })
    }
  }
  return merged
}

export const OrderAPI = {
  async getOrders(
    page = 1,
    perPage = 30,
    filter = '',
  ): Promise<ListResult<Order>> {
    let url = `${PB_URL}/collections/${COLLECTION_ORDERS}/records?page=${page}&perPage=${perPage}&sort=-created`
    if (filter) {
      url += `&filter=${encodeURIComponent(filter)}`
    }
    const res = await privateRequest<ListResult<Order>>(url)
    if (!res) throw new APIError('获取订单列表失败', 500)
    return res
  },

  async getOrder(id: string): Promise<Order> {
    const url = `${PB_URL}/collections/${COLLECTION_ORDERS}/records/${encodeURIComponent(id)}`
    const res = await privateRequest<Order>(url)
    if (!res) throw new APIError('获取订单详情失败', 500)
    return res
  },

  async createOrder(orderData: CreateOrderPayload): Promise<Order> {
    const res = await privateRequest<Order>(`${PB_URL}/collections/${COLLECTION_ORDERS}/records`, {
      method: 'POST',
      body: JSON.stringify(orderData),
    })
    if (!res) throw new APIError('创建订单失败', 500)
    return res
  },

  async updateOrder(id: string, orderData: Partial<CreateOrderPayload>): Promise<Order> {
    const url = `${PB_URL}/collections/${COLLECTION_ORDERS}/records/${encodeURIComponent(id)}`
    const res = await privateRequest<Order>(url, {
      method: 'PATCH',
      body: JSON.stringify(orderData),
    })
    if (!res) throw new APIError('更新订单失败', 500)
    return res
  },

  async updateOrderStatus(id: string, status: OrderStatusValue): Promise<Order> {
    return this.updateOrder(id, { status })
  },

  async updateOrderItemStatus(
    id: string,
    dishId: string,
    itemStatus: typeof ITEM_STATUS_PENDING | typeof ITEM_STATUS_COOKING | typeof ITEM_STATUS_COOKED | typeof ITEM_STATUS_SERVED,
  ): Promise<Order> {
    const order = await this.getOrder(id)

    if (order.status === 'completed' || order.status === 'cancelled' || order.status === 'settled') {
      throw new APIError('订单已结束，不能修改菜品状态', 400)
    }

    const items = (order.items || []).map((item) =>
      item.dishId === dishId ? { ...item, status: itemStatus } : item,
    )

    return this.updateOrder(id, { items })
  },

  async appendOrderItems(id: string, newItems: OrderItem[]): Promise<Order> {
    const order = await this.getOrder(id)

    if (order.status === 'completed' || order.status === 'cancelled' || order.status === 'settled') {
      throw new APIError('订单已结束，不能追加菜品', 400)
    }

    const mergedItems = mergeOrderItems(order.items || [], newItems)
    return this.updateOrder(id, { items: mergedItems })
  },

  async deleteOrder(id: string): Promise<boolean> {
    const url = `${PB_URL}/collections/${COLLECTION_ORDERS}/records/${encodeURIComponent(id)}`
    await privateRequest<unknown>(url, { method: 'DELETE' })
    return true
  },
}

export const DishAPI = {
  // 权限收紧后，dishes 查询需携带认证 token
  async getDishes(): Promise<ListResult<Dish>> {
    const cacheKey = 'dishes:all'
    const cached = apiCache.get<ListResult<Dish>>(cacheKey)
    if (cached) return cached

    const url = `${PB_URL}/collections/${COLLECTION_DISHES}/records?perPage=100&sort=name`
    const res = await privateRequest<ListResult<Dish>>(url)
    if (!res) throw new APIError('获取菜品列表失败', 500)
    apiCache.set(cacheKey, res, 60_000)
    return res
  },

  async getDishesByCategory(category: string): Promise<ListResult<Dish>> {
    const safeCategory = escapePbString(category)
    const filter = `category='${safeCategory}'`
    const url = `${PB_URL}/collections/${COLLECTION_DISHES}/records?filter=${encodeURIComponent(filter)}`
    const res = await privateRequest<ListResult<Dish>>(url)
    if (!res) throw new APIError('获取菜品分类失败', 500)
    return res
  },

  // 管理类接口必须认证
  async getDish(id: string): Promise<Dish> {
    const url = `${PB_URL}/collections/${COLLECTION_DISHES}/records/${encodeURIComponent(id)}`
    const res = await privateRequest<Dish>(url)
    if (!res) throw new APIError('获取菜品详情失败', 500)
    return res
  },

  async createDish(dishData: Partial<Dish>): Promise<Dish> {
    const res = await privateRequest<Dish>(`${PB_URL}/collections/${COLLECTION_DISHES}/records`, {
      method: 'POST',
      body: JSON.stringify(dishData),
    })
    if (!res) throw new APIError('创建菜品失败', 500)
    apiCache.clear('dishes:all')
    return res
  },

  async updateDish(id: string, dishData: Partial<Dish>): Promise<Dish> {
    const url = `${PB_URL}/collections/${COLLECTION_DISHES}/records/${encodeURIComponent(id)}`
    const res = await privateRequest<Dish>(url, {
      method: 'PATCH',
      body: JSON.stringify(dishData),
    })
    if (!res) throw new APIError('更新菜品失败', 500)
    apiCache.clear('dishes:all')
    return res
  },

  async deleteDish(id: string): Promise<boolean> {
    const url = `${PB_URL}/collections/${COLLECTION_DISHES}/records/${encodeURIComponent(id)}`
    await privateRequest<unknown>(url, { method: 'DELETE' })
    apiCache.clear('dishes:all')
    return true
  },
}

export const PublicOrderAPI = {
  async createOrder(orderData: CreateOrderPayload): Promise<Order> {
    const res = await publicRequest<Order>(`${PB_URL}/collections/${COLLECTION_ORDERS}/records`, {
      method: 'POST',
      body: JSON.stringify(orderData),
    })
    if (!res) throw new APIError('创建订单失败', 500)
    return res
  },

  async getOrder(id: string): Promise<Order> {
    const url = `${PB_URL}/collections/${COLLECTION_ORDERS}/records/${encodeURIComponent(id)}`
    const res = await publicRequest<Order>(url)
    if (!res) throw new APIError('获取订单详情失败', 500)
    return res
  },

  async getOrdersByTable(tableNo: string): Promise<Order[]> {
    if (!validateTableNo(tableNo)) {
      throw new APIError('无效的桌号格式', 400)
    }
    const safeTableNo = escapePbString(tableNo)
    const filter = `tableNo='${safeTableNo}' && status!='completed' && status!='cancelled'`
    const url = `${PB_URL}/collections/${COLLECTION_ORDERS}/records?filter=${encodeURIComponent(filter)}&sort=-created&perPage=1`
    const res = await publicRequest<ListResult<Order>>(url)
    return res?.items || []
  },

  async appendOrderItems(id: string, newItems: OrderItem[]): Promise<Order> {
    const orderRes = await publicRequest<Order>(
      `${PB_URL}/collections/${COLLECTION_ORDERS}/records/${encodeURIComponent(id)}`,
    )
    const order = orderRes
    if (!order) {
      throw new APIError('订单不存在', 404)
    }

    if (order.status === 'completed' || order.status === 'cancelled' || order.status === 'settled') {
      throw new APIError('订单已结束，不能追加菜品', 400)
    }

    const mergedItems = mergeOrderItems(order.items || [], newItems)

    const patchRes = await publicRequest<Order>(
      `${PB_URL}/collections/${COLLECTION_ORDERS}/records/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ items: mergedItems }),
      },
    )
    if (!patchRes) throw new APIError('追加菜品失败', 500)
    return patchRes
  },
}

export const TableStatusAPI = {
  async getTableStatus(tableNo: string): Promise<TableStatus | null> {
    if (!validateTableNo(tableNo)) {
      throw new APIError('无效的桌号格式', 400)
    }
    const safeTableNo = escapePbString(tableNo)
    const filter = `tableNo='${safeTableNo}'`
    const url = `${PB_URL}/collections/${COLLECTION_TABLE_STATUS}/records?filter=${encodeURIComponent(filter)}&perPage=1`
    const res = await privateRequest<ListResult<TableStatus>>(url)
    return res?.items?.[0] || null
  },

  async getAllTableStatuses(): Promise<TableStatus[]> {
    const url = `${PB_URL}/collections/${COLLECTION_TABLE_STATUS}/records?perPage=100`
    const res = await privateRequest<ListResult<TableStatus>>(url)
    return res?.items || []
  },

  async updateTableStatus(id: string, data: Partial<TableStatus>): Promise<TableStatus> {
    const url = `${PB_URL}/collections/${COLLECTION_TABLE_STATUS}/records/${encodeURIComponent(id)}`
    const res = await privateRequest<TableStatus>(url, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
    if (!res) throw new APIError('更新桌台状态失败', 500)
    return res
  },

  async createTableStatus(data: Partial<TableStatus>): Promise<TableStatus> {
    const res = await privateRequest<TableStatus>(`${PB_URL}/collections/${COLLECTION_TABLE_STATUS}/records`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
    if (!res) throw new APIError('创建桌台状态失败', 500)
    return res
  },
}

export const SettingsAPI = {
  async getSettings(): Promise<Settings | null> {
    const cacheKey = 'settings:all'
    const cached = apiCache.get<Settings>(cacheKey)
    if (cached) return cached

    const res = await privateRequest<ListResult<Settings>>(`${PB_URL}/collections/${COLLECTION_SETTINGS}/records`)
    const data = res?.items?.[0] || null
    if (data) {
      apiCache.set(cacheKey, data, 30_000)
    }
    return data
  },

  async updateSettings(id: string, settingsData: Partial<Settings>): Promise<Settings> {
    const url = `${PB_URL}/collections/${COLLECTION_SETTINGS}/records/${encodeURIComponent(id)}`
    const res = await privateRequest<Settings>(url, {
      method: 'PATCH',
      body: JSON.stringify(settingsData),
    })
    if (!res) throw new APIError('更新设置失败', 500)
    apiCache.clear('settings:all')
    return res
  },

  async updateSettingsFiles(id: string, formData: FormData): Promise<Settings> {
    const url = `${PB_URL}/collections/${COLLECTION_SETTINGS}/records/${encodeURIComponent(id)}`
    const res = await privateRequest<Settings>(url, {
      method: 'PATCH',
      body: formData,
    })
    if (!res) throw new APIError('更新设置文件失败', 500)
    apiCache.clear('settings:all')
    return res
  },

  async createSettings(settingsData: Partial<Settings>): Promise<Settings> {
    const res = await privateRequest<Settings>(`${PB_URL}/collections/${COLLECTION_SETTINGS}/records`, {
      method: 'POST',
      body: JSON.stringify(settingsData),
    })
    if (!res) throw new APIError('创建设置失败', 500)
    return res
  },
}

export async function subscribeToOrders(
  filter: string,
  onUpdate: (record: Order) => void,
): Promise<() => void> {
  if (typeof EventSource === 'undefined') {
    throw new Error('EventSource not supported')
  }

  const authRes = await privateRequest<{ clientId: string }>(`${PB_URL}/realtime`, {
    method: 'POST',
  })
  if (!authRes) throw new APIError('获取实时连接失败', 500)
  const { clientId } = authRes

  const es = new EventSource(`${PB_URL}/realtime?clientId=${clientId}`)

  const doSubscribe = () => {
    fetch(`${PB_URL}/realtime/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId,
        subscriptions: { [COLLECTION_ORDERS]: filter },
      }),
    }).catch(() => {})
  }

  es.addEventListener('PB_CONNECT', doSubscribe)

  es.addEventListener(COLLECTION_ORDERS, (e) => {
    try {
      const data = JSON.parse((e as MessageEvent).data)
      if (data.record) onUpdate(data.record)
    } catch { /* ignore */ }
  })

  return () => {
    es.close()
  }
}

// P1-37: 后端聚合统计 API
export const StatsAPI = {
  async getStats(startDate?: string, endDate?: string): Promise<StatsResponse | null> {
    const params = new URLSearchParams()
    if (startDate) params.append('start', startDate)
    if (endDate) params.append('end', endDate)
    const url = `${PB_URL}/stats?${params.toString()}`
    try {
      const res = await fetchWithTimeout(url, { method: 'GET' }, 15000)
      return await handleResponse<StatsResponse>(res)
    } catch (err) {
      // 如果后端路由不存在（404），返回 null，调用方降级到客户端聚合
      if (err instanceof APIError && err.status === 404) return null
      throw err
    }
  },
}
