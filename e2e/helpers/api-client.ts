/**
 * E2E 测试 API 辅助客户端
 * 用于测试数据准备、状态查询和测试后清理
 *
 * ⚠️ 警告：本客户端直接操作生产数据库（PocketBase），
 * 仅应在 E2E 测试中使用，且必须配合 beforeAll/afterAll 做好数据隔离。
 */

import type { APIRequestContext, Playwright } from '@playwright/test'

export const PB_DIRECT_URL = 'http://127.0.0.1:8090'
export const TEST_TABLE = '大厅02'
export const TEST_ADMIN = {
  identity: 'admin@restaurant.com',
  password: 'REDACTED_DEFAULT_PASSWORD',
}

/** 创建独立的 APIRequestContext（用于 beforeAll/afterAll，避免 Playwright fixture 生命周期限制） */
export async function createApiClient(playwright: Playwright): Promise<{ api: ApiClient; context: APIRequestContext }> {
  const context = await playwright.request.newContext()
  const api = new ApiClient(context)
  await api.login()
  return { api, context }
}

export interface Dish {
  id: string
  name: string
  price: number
  category: string
  description?: string
  soldOut?: boolean
  soldOutNote?: string
}

export interface Order {
  id: string
  orderNo: string
  tableNo: string
  guests: number
  status: string
  items: Array<{
    dishId: string
    name: string
    price: number
    quantity: number
    status?: string
    remark?: string
  }>
  totalAmount: number
  finalAmount: number
  source?: string
  created: string
}

export interface TableStatus {
  id: string
  tableNo: string
  status: 'idle' | 'dining'
  currentOrderId: string
  openedAt: string
}

export class ApiClient {
  private token: string | null = null

  constructor(private request: APIRequestContext) {}

  /** 登录并缓存 Token */
  async login(): Promise<string> {
    const res = await this.request.post(`${PB_DIRECT_URL}/api/collections/users/auth-with-password`, {
      data: TEST_ADMIN,
    })
    const json = (await res.json()) as { token: string }
    if (!json.token) {
      throw new Error(`E2E 登录失败: ${JSON.stringify(json)}`)
    }
    this.token = json.token
    return this.token
  }

  private get headers() {
    if (!this.token) throw new Error('请先调用 login()')
    return { Authorization: `Bearer ${this.token}` }
  }

  /** 获取所有菜品 */
  async getDishes(): Promise<Dish[]> {
    const res = await this.request.get(`${PB_DIRECT_URL}/api/collections/dishes/records?perPage=200&sort=name`, {
      headers: this.headers,
    })
    const json = (await res.json()) as { items: Dish[] }
    return json.items || []
  }

  /** 获取可点菜品（非餐具、未沽清） */
  async getAvailableDishes(count = 2): Promise<Dish[]> {
    const dishes = await this.getDishes()
    return dishes.filter((d) => d.category !== '餐具' && !d.soldOut).slice(0, count)
  }

  /** 获取指定分类的可点菜品 */
  async getAvailableDishesByCategory(category: string, count = 2): Promise<Dish[]> {
    const dishes = await this.getDishes()
    return dishes.filter((d) => d.category === category && !d.soldOut).slice(0, count)
  }

  /** 获取所有分类（按前端排序规则） */
  getCategories(dishes: Dish[]): string[] {
    const ORDER = ['铁锅炖','特色菜','农家小炒','凉菜','特色豆腐','主食','酒水']
    const cats = Array.from(new Set(dishes.map((d) => d.category)))
      .filter((c) => c !== '餐具')
      .sort((a, b) => {
        const ia = ORDER.indexOf(a)
        const ib = ORDER.indexOf(b)
        if (ia !== -1 && ib !== -1) return ia - ib
        if (ia !== -1) return -1
        if (ib !== -1) return 1
        return a.localeCompare(b)
      })
    return cats
  }

  /** 创建订单（绕过前端，直接写库） */
  async createOrder(payload: Partial<Order> & { tableNo: string; items: Order['items'] }): Promise<Order> {
    const res = await this.request.post(`${PB_DIRECT_URL}/api/collections/orders/records`, {
      headers: this.headers,
      data: {
        orderNo: payload.orderNo || `E2E-${Date.now()}`,
        guests: payload.guests ?? 2,
        status: payload.status || 'pending',
        totalAmount: payload.totalAmount ?? 0,
        finalAmount: payload.finalAmount ?? 0,
        discount: 0,
        discountType: 'amount',
        discountValue: 0,
        source: payload.source || 'staff',
        ...payload,
      },
    })
    const json = (await res.json()) as Order
    return json
  }

  /** 更新订单 */
  async updateOrder(id: string, data: Partial<Order>): Promise<Order> {
    const res = await this.request.patch(`${PB_DIRECT_URL}/api/collections/orders/records/${id}`, {
      headers: this.headers,
      data,
    })
    return (await res.json()) as Order
  }

  /** 删除订单 */
  async deleteOrder(id: string): Promise<void> {
    await this.request.delete(`${PB_DIRECT_URL}/api/collections/orders/records/${id}`, {
      headers: this.headers,
    })
  }

  /** 按桌号查询订单 */
  async getOrdersByTable(tableNo: string, perPage = 50): Promise<Order[]> {
    const filter = `tableNo='${tableNo}'`
    const res = await this.request.get(
      `${PB_DIRECT_URL}/api/collections/orders/records?filter=${encodeURIComponent(filter)}&sort=-created&perPage=${perPage}`,
      { headers: this.headers },
    )
    const json = (await res.json()) as { items: Order[] }
    return json.items || []
  }

  /** 获取所有桌台状态 */
  async getAllTableStatuses(): Promise<TableStatus[]> {
    const res = await this.request.get(
      `${PB_DIRECT_URL}/api/collections/table_status/records?perPage=200`,
      { headers: this.headers },
    )
    const json = (await res.json()) as { items: TableStatus[] }
    return json.items || []
  }

  /** 获取桌台状态 */
  async getTableStatus(tableNo: string): Promise<TableStatus | null> {
    const filter = `tableNo='${tableNo}'`
    const res = await this.request.get(
      `${PB_DIRECT_URL}/api/collections/table_status/records?filter=${encodeURIComponent(filter)}&perPage=1`,
      { headers: this.headers },
    )
    const json = (await res.json()) as { items: TableStatus[] }
    return json.items[0] || null
  }

  /** 更新桌台状态 */
  async updateTableStatus(id: string, data: Partial<TableStatus>): Promise<TableStatus> {
    const res = await this.request.patch(`${PB_DIRECT_URL}/api/collections/table_status/records/${id}`, {
      headers: this.headers,
      data,
    })
    return (await res.json()) as TableStatus
  }

  /** 切换沽清状态 */
  async toggleSoldOut(dishId: string, soldOut: boolean, note?: string): Promise<Dish> {
    const res = await this.request.patch(`${PB_DIRECT_URL}/api/collections/dishes/records/${dishId}`, {
      headers: this.headers,
      data: {
        soldOut,
        soldOutNote: note || (soldOut ? 'E2E测试临时沽清' : ''),
        soldOutAt: soldOut ? new Date().toISOString() : null,
      },
    })
    return (await res.json()) as Dish
  }

  /** 清理某桌所有未完成订单（用于 E2E 测试隔离） */
  async cleanupTableOrders(tableNo: string): Promise<void> {
    const orders = await this.getOrdersByTable(tableNo)
    for (const order of orders) {
      // 删除所有非终态订单，确保测试桌台干净
      if (order.status !== 'settled' && order.status !== 'cancelled') {
        await this.deleteOrder(order.id)
      }
    }
  }
}
