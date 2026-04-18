/**
 * PocketBase API 封装
 * 智能点菜系统 - 订单管理模块
 */

export const PB_URL = import.meta.env.VITE_PB_URL || '/api'
const REQUEST_TIMEOUT = 30000 // 30秒超时



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

async function fetchWithTimeout(
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
    throw error
  }
}

let sessionExpired = false

async function handleResponse<T>(response: Response): Promise<T> {
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
      const token = localStorage.getItem('pb_token')
      if (token && !sessionExpired) {
        sessionExpired = true
        errorMessage = '登录已过期，请重新登录'
        localStorage.removeItem('pb_token')
        localStorage.removeItem('pb_user')
        setTimeout(() => {
          window.location.href = '/login'
        }, 1500)
      }
    }

    throw new APIError(errorMessage, response.status, errorData)
  }

  if (response.status === 204) {
    return null as T
  }

  return response.json()
}

async function getAdminToken(): Promise<string> {
  return localStorage.getItem('pb_token') || ''
}

/**
 * PocketBase filter 字符串转义：将单引号替换为两个单引号
 */
export function escapePbString(value: string): string {
  return value.replace(/'/g, "''")
}

/**
 * 验证桌号格式，只允许字母、数字、中文和连字符
 */
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
  status?: 'pending' | 'cooking' | 'cooked' | 'served'
}

export interface Order {
  id: string
  orderNo: string
  tableNo: string
  guests: number
  status: string
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

export const OrderAPI = {
  async getOrders(
    page = 1,
    perPage = 30,
    filter = '',
  ): Promise<ListResult<Order>> {
    const token = await getAdminToken()
    if (!token) throw new APIError('未登录或登录已过期', 401)

    let url = `${PB_URL}/collections/orders/records?page=${page}&perPage=${perPage}&sort=-created`
    if (filter) {
      url += `&filter=${encodeURIComponent(filter)}`
    }

    const res = await fetchWithTimeout(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
    return handleResponse<ListResult<Order>>(res)
  },

  async getOrder(id: string): Promise<Order> {
    const token = await getAdminToken()
    if (!token) throw new APIError('未登录或登录已过期', 401)

    const res = await fetchWithTimeout(
      `${PB_URL}/collections/orders/records/${encodeURIComponent(id)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    return handleResponse<Order>(res)
  },

  async createOrder(orderData: Partial<Order>): Promise<Order> {
    const token = await getAdminToken()
    if (!token) throw new APIError('未登录或登录已过期', 401)

    const res = await fetchWithTimeout(`${PB_URL}/collections/orders/records`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(orderData),
    })
    return handleResponse<Order>(res)
  },

  async updateOrder(id: string, orderData: Partial<Order>): Promise<Order> {
    const token = await getAdminToken()
    if (!token) throw new APIError('未登录或登录已过期', 401)

    const res = await fetchWithTimeout(
      `${PB_URL}/collections/orders/records/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(orderData),
      },
    )
    return handleResponse<Order>(res)
  },

  async updateOrderStatus(id: string, status: string): Promise<Order> {
    return this.updateOrder(id, { status })
  },

  async updateOrderItemStatus(
    id: string,
    dishId: string,
    itemStatus: 'pending' | 'cooking' | 'cooked' | 'served',
  ): Promise<Order> {
    const order = await this.getOrder(id)

    if (order.status === 'completed' || order.status === 'cancelled') {
      throw new APIError('订单已结束，不能修改菜品状态', 400)
    }

    const items = (order.items || []).map((item) =>
      item.dishId === dishId ? { ...item, status: itemStatus } : item,
    )

    // 后端钩子会自动推断整体状态并重算金额
    return this.updateOrder(id, { items })
  },

  async appendOrderItems(id: string, newItems: OrderItem[]): Promise<Order> {
    const order = await this.getOrder(id)
    const mergedItems = [...(order.items || [])]

    for (const item of newItems) {
      const existing = mergedItems.find((i) => i.dishId === item.dishId)
      if (existing) {
        existing.quantity = Math.round((existing.quantity + item.quantity) * 10) / 10
        if (item.remark) existing.remark = item.remark
      } else {
        mergedItems.push({ ...item })
      }
    }

    // 后端钩子会自动重算金额和推断状态
    return this.updateOrder(id, { items: mergedItems })
  },

  async deleteOrder(id: string): Promise<boolean> {
    const token = await getAdminToken()
    if (!token) throw new APIError('未登录或登录已过期', 401)

    const res = await fetchWithTimeout(
      `${PB_URL}/collections/orders/records/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      },
    )
    await handleResponse<unknown>(res)
    return true
  },
}

export const DishAPI = {
  async getDishes(): Promise<ListResult<Dish>> {
    const token = await getAdminToken()
    const headers: Record<string, string> = {}
    if (token) headers.Authorization = `Bearer ${token}`

    const res = await fetchWithTimeout(
      `${PB_URL}/collections/dishes/records?perPage=100&sort=name`,
      { headers },
    )
    return handleResponse<ListResult<Dish>>(res)
  },

  async getDishesByCategory(category: string): Promise<ListResult<Dish>> {
    const token = await getAdminToken()
    const headers: Record<string, string> = {}
    if (token) headers.Authorization = `Bearer ${token}`

    const safeCategory = escapePbString(category)
    const filter = `category='${safeCategory}'`
    const res = await fetchWithTimeout(
      `${PB_URL}/collections/dishes/records?filter=${encodeURIComponent(filter)}`,
      { headers },
    )
    return handleResponse<ListResult<Dish>>(res)
  },

  async getDish(id: string): Promise<Dish> {
    const token = await getAdminToken()
    if (!token) throw new APIError('未登录或登录已过期', 401)

    const res = await fetchWithTimeout(
      `${PB_URL}/collections/dishes/records/${encodeURIComponent(id)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    return handleResponse<Dish>(res)
  },

  async createDish(dishData: Partial<Dish>): Promise<Dish> {
    const token = await getAdminToken()
    if (!token) throw new APIError('未登录或登录已过期', 401)

    const res = await fetchWithTimeout(`${PB_URL}/collections/dishes/records`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(dishData),
    })
    return handleResponse<Dish>(res)
  },

  async updateDish(id: string, dishData: Partial<Dish>): Promise<Dish> {
    const token = await getAdminToken()
    if (!token) throw new APIError('未登录或登录已过期', 401)

    const res = await fetchWithTimeout(
      `${PB_URL}/collections/dishes/records/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(dishData),
      },
    )
    return handleResponse<Dish>(res)
  },

  async deleteDish(id: string): Promise<boolean> {
    const token = await getAdminToken()
    if (!token) throw new APIError('未登录或登录已过期', 401)

    const res = await fetchWithTimeout(
      `${PB_URL}/collections/dishes/records/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      },
    )
    await handleResponse<unknown>(res)
    return true
  },
}

export const PublicOrderAPI = {
  async createOrder(orderData: Partial<Order>): Promise<Order> {
    const res = await fetchWithTimeout(`${PB_URL}/collections/orders/records`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderData),
    })
    return handleResponse<Order>(res)
  },

  async getOrder(id: string): Promise<Order> {
    const res = await fetchWithTimeout(
      `${PB_URL}/collections/orders/records/${encodeURIComponent(id)}`,
    )
    return handleResponse<Order>(res)
  },

  async getOrdersByTable(tableNo: string): Promise<Order[]> {
    if (!validateTableNo(tableNo)) {
      throw new APIError('无效的桌号格式', 400)
    }
    const safeTableNo = escapePbString(tableNo)
    const filter = `tableNo='${safeTableNo}' && status!='completed' && status!='cancelled'`
    const res = await fetchWithTimeout(
      `${PB_URL}/collections/orders/records?filter=${encodeURIComponent(filter)}&sort=-created&perPage=1`,
    )
    const data = await handleResponse<ListResult<Order>>(res)
    return data.items || []
  },

  async appendOrderItems(id: string, newItems: OrderItem[]): Promise<Order> {
    const getRes = await fetchWithTimeout(
      `${PB_URL}/collections/orders/records/${encodeURIComponent(id)}`,
    )
    const order = await handleResponse<Order>(getRes)
    const mergedItems = [...(order.items || [])]

    for (const item of newItems) {
      const existing = mergedItems.find((i) => i.dishId === item.dishId)
      if (existing) {
        existing.quantity = Math.round((existing.quantity + item.quantity) * 10) / 10
        if (item.remark) existing.remark = item.remark
      } else {
        mergedItems.push({ ...item })
      }
    }

    // 后端钩子会自动重算金额和推断状态
    const patchRes = await fetchWithTimeout(
      `${PB_URL}/collections/orders/records/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: mergedItems,
        }),
      },
    )
    return handleResponse<Order>(patchRes)
  },
}

export const TableStatusAPI = {
  async getTableStatus(tableNo: string): Promise<TableStatus | null> {
    const token = await getAdminToken()
    const headers: Record<string, string> = {}
    if (token) headers.Authorization = `Bearer ${token}`

    if (!validateTableNo(tableNo)) {
      throw new APIError('无效的桌号格式', 400)
    }
    const safeTableNo = escapePbString(tableNo)
    const filter = `tableNo='${safeTableNo}'`
    const res = await fetchWithTimeout(
      `${PB_URL}/collections/table_status/records?filter=${encodeURIComponent(filter)}&perPage=1`,
      { headers },
    )
    const data = await handleResponse<ListResult<TableStatus>>(res)
    return data.items?.[0] || null
  },

  async updateTableStatus(id: string, data: Partial<TableStatus>): Promise<TableStatus> {
    const token = await getAdminToken()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`

    const res = await fetchWithTimeout(
      `${PB_URL}/collections/table_status/records/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify(data),
      },
    )
    return handleResponse<TableStatus>(res)
  },

  async createTableStatus(data: Partial<TableStatus>): Promise<TableStatus> {
    const token = await getAdminToken()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`

    const res = await fetchWithTimeout(`${PB_URL}/collections/table_status/records`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    })
    return handleResponse<TableStatus>(res)
  },
}

export const SettingsAPI = {
  async getSettings(): Promise<Settings | null> {
    const token = await getAdminToken()
    if (!token) throw new APIError('未登录或登录已过期', 401)

    const res = await fetchWithTimeout(`${PB_URL}/collections/settings/records`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await handleResponse<ListResult<Settings>>(res)
    return data.items?.[0] || null
  },

  async updateSettings(id: string, settingsData: Partial<Settings>): Promise<Settings> {
    const token = await getAdminToken()
    if (!token) throw new APIError('未登录或登录已过期', 401)

    const res = await fetchWithTimeout(
      `${PB_URL}/collections/settings/records/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(settingsData),
      },
    )
    return handleResponse<Settings>(res)
  },

  async updateSettingsFiles(id: string, formData: FormData): Promise<Settings> {
    const token = await getAdminToken()
    if (!token) throw new APIError('未登录或登录已过期', 401)

    const res = await fetchWithTimeout(
      `${PB_URL}/collections/settings/records/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      },
    )
    return handleResponse<Settings>(res)
  },

  async createSettings(settingsData: Partial<Settings>): Promise<Settings> {
    const token = await getAdminToken()
    if (!token) throw new APIError('未登录或登录已过期', 401)

    const res = await fetchWithTimeout(`${PB_URL}/collections/settings/records`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(settingsData),
    })
    return handleResponse<Settings>(res)
  },
}
