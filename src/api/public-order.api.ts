/**
 * 顾客端公共 API - 调用 Node.js 公共服务
 * 无需登录，通过 accessToken 访问订单
 */

import { APIError, fetchWithTimeout, handleResponse } from './pocketbase'
import type { Order, OrderItem, CreateOrderPayload } from './pocketbase'

const PB_URL = import.meta.env.VITE_PB_URL || '/api'

/**
 * 顾客会话管理
 * 用于在页面刷新后恢复订单访问权限
 */
export class CustomerSession {
  private orderId: string
  private accessToken: string

  constructor(orderId: string, accessToken: string) {
    this.orderId = orderId
    this.accessToken = accessToken
  }

  static restore(): CustomerSession | null {
    const orderId = sessionStorage.getItem('customer_order_id')
    const token = sessionStorage.getItem('customer_access_token')
    if (orderId && token) {
      return new CustomerSession(orderId, token)
    }
    return null
  }

  persist() {
    sessionStorage.setItem('customer_order_id', this.orderId)
    sessionStorage.setItem('customer_access_token', this.accessToken)
  }

  clear() {
    sessionStorage.removeItem('customer_order_id')
    sessionStorage.removeItem('customer_access_token')
  }

  get orderIdValue() {
    return this.orderId
  }

  get accessTokenValue() {
    return this.accessToken
  }
}

/**
 * 公共菜品 API
 */
export const PublicDishAPI = {
  async getDishes() {
    const res = await fetchWithTimeout(`${PB_URL}/public/dishes`)
    const data = await handleResponse<{
      items: Array<{
        id: string
        name: string
        price: number
        category: string
        description?: string
        soldOut?: boolean
        soldOutNote?: string
      }>
    }>(res)
    if (!data) throw new APIError('获取菜品失败', 500)
    return data
  },
}

/**
 * 公共桌台状态 API
 */
export const PublicTableStatusAPI = {
  async getTableStatus(tableNo: string): Promise<{ id: string; tableNo: string; status: 'idle' | 'dining' | 'pending_clear'; currentOrderId?: string; openedAt?: string } | null> {
    const res = await fetchWithTimeout(`${PB_URL}/public/table-status/${encodeURIComponent(tableNo)}`)
    const data = await handleResponse<{ status: { id: string; tableNo: string; status: string; currentOrderId?: string; openedAt?: string } | null }>(res)
    if (!data?.status) return null
    return {
      ...data.status,
      status: data.status.status as 'idle' | 'dining' | 'pending_clear',
    }
  },
}

/**
 * 公共订单 API（顾客端）
 */
export const PublicOrderAPI = {
  /**
   * 按桌号查询当前未完成订单
   * 注意：此方法不返回 accessToken（用于页面初始化时检查桌台状态）
   */
  async getOrdersByTable(tableNo: string): Promise<Order[]> {
    const res = await fetchWithTimeout(`${PB_URL}/public/orders/by-table/${encodeURIComponent(tableNo)}`)
    const data = await handleResponse<{ order: Order | null }>(res)
    return data?.order ? [data.order] : []
  },

  /**
   * 获取订单详情（通过 CustomerSession）
   */
  async getOrder(id: string, session: CustomerSession): Promise<Order> {
    const url = `${PB_URL}/public/orders/${encodeURIComponent(id)}?token=${encodeURIComponent(session.accessTokenValue)}`
    const res = await fetchWithTimeout(url)
    const data = await handleResponse<{ order: Order }>(res)
    if (!data?.order) throw new APIError('订单不存在', 404)
    return data.order
  },

  /**
   * 创建新订单
   * 返回订单信息 + accessToken
   */
  async createOrder(orderData: CreateOrderPayload): Promise<Order & { accessToken: string }> {
    const res = await fetchWithTimeout(`${PB_URL}/public/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderData),
    })
    const data = await handleResponse<Order & { accessToken: string }>(res)
    if (!data) throw new APIError('创建订单失败', 500)
    return data
  },

  /**
   * 追加菜品（通过 CustomerSession）
   */
  async appendOrderItems(
    id: string,
    session: CustomerSession,
    newItems: OrderItem[],
  ): Promise<Order> {
    const url = `${PB_URL}/public/orders/${encodeURIComponent(id)}/items?token=${encodeURIComponent(session.accessTokenValue)}`
    const res = await fetchWithTimeout(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: newItems }),
    })
    const data = await handleResponse<{ order: Order }>(res)
    if (!data?.order) throw new APIError('追加菜品失败', 500)
    return data.order
  },
}
