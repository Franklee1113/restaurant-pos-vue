/**
 * PocketBase API 封装
 * 智能点菜系统 - 订单管理模块
 */

const PB_URL = import.meta.env.VITE_PB_URL || '/api'
const REQUEST_TIMEOUT = 30000 // 30秒超时

export class APIError extends Error {
  constructor(
    message: string,
    public status?: number,
    public data?: any,
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
  } catch (error: any) {
    clearTimeout(id)
    if (error.name === 'AbortError') {
      throw new APIError('请求超时，请稍后重试', 408)
    }
    throw error
  }
}

async function handleResponse(response: Response): Promise<any> {
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

    if (
      response.status === 401 ||
      (response.status === 404 && errorMessage.includes("wasn't found"))
    ) {
      const token = localStorage.getItem('pb_token')
      if (!token) {
        errorMessage = '登录已过期，请重新登录'
        setTimeout(() => {
          window.location.reload()
        }, 2000)
      }
    }

    throw new APIError(errorMessage, response.status, errorData)
  }

  if (response.status === 204) {
    return null
  }

  return response.json()
}

async function getAdminToken(): Promise<string> {
  return localStorage.getItem('pb_token') || ''
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
  created: string
  updated: string
}

export interface Dish {
  id: string
  name: string
  price: number
  category: string
}

export interface Settings {
  id: string
  restaurantName?: string
  address?: string
  phone?: string
  categories?: string[]
  tableNumbers?: string[]
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
    return handleResponse(res)
  },

  async getOrder(id: string): Promise<Order> {
    const token = await getAdminToken()
    if (!token) throw new APIError('未登录或登录已过期', 401)

    const res = await fetchWithTimeout(
      `${PB_URL}/collections/orders/records/${encodeURIComponent(id)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    return handleResponse(res)
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
    return handleResponse(res)
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
    return handleResponse(res)
  },

  async updateOrderStatus(id: string, status: string): Promise<Order> {
    return this.updateOrder(id, { status })
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
    await handleResponse(res)
    return true
  },
}

export const DishAPI = {
  async getDishes(): Promise<ListResult<Dish>> {
    const token = await getAdminToken()
    if (!token) throw new APIError('未登录或登录已过期', 401)

    const res = await fetchWithTimeout(
      `${PB_URL}/collections/dishes/records?perPage=100&sort=name`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    return handleResponse(res)
  },

  async getDishesByCategory(category: string): Promise<ListResult<Dish>> {
    const token = await getAdminToken()
    if (!token) throw new APIError('未登录或登录已过期', 401)

    const filter = `category='${encodeURIComponent(category)}'`
    const res = await fetchWithTimeout(
      `${PB_URL}/collections/dishes/records?filter=${encodeURIComponent(filter)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    return handleResponse(res)
  },

  async getDish(id: string): Promise<Dish> {
    const token = await getAdminToken()
    if (!token) throw new APIError('未登录或登录已过期', 401)

    const res = await fetchWithTimeout(
      `${PB_URL}/collections/dishes/records/${encodeURIComponent(id)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    return handleResponse(res)
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
    return handleResponse(res)
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
    return handleResponse(res)
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
    await handleResponse(res)
    return true
  },
}

export const SettingsAPI = {
  async getSettings(): Promise<Settings | null> {
    const token = await getAdminToken()
    if (!token) throw new APIError('未登录或登录已过期', 401)

    const res = await fetchWithTimeout(`${PB_URL}/collections/settings/records`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await handleResponse(res)
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
    return handleResponse(res)
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
    return handleResponse(res)
  },
}
