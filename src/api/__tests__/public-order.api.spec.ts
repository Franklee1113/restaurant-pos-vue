import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CustomerSession, PublicOrderAPI } from '@/api/public-order.api'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function mockResponse(data: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  } as Response)
}

describe('CustomerSession', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    sessionStorage.clear()
    vi.clearAllMocks()
  })

  it('应持久化 orderId 和 accessToken 到 sessionStorage', () => {
    const session = new CustomerSession('order1', 'tok_abc123')
    session.persist()
    expect(sessionStorage.getItem('customer_order_id')).toBe('order1')
    expect(sessionStorage.getItem('customer_access_token')).toBe('tok_abc123')
  })

  it('应从 sessionStorage 恢复会话', () => {
    sessionStorage.setItem('customer_order_id', 'order1')
    sessionStorage.setItem('customer_access_token', 'tok_abc123')
    const session = CustomerSession.restore()
    expect(session).not.toBeNull()
    expect(session!.orderIdValue).toBe('order1')
    expect(session!.accessTokenValue).toBe('tok_abc123')
  })

  it('sessionStorage 为空时 restore 返回 null', () => {
    const session = CustomerSession.restore()
    expect(session).toBeNull()
  })

  it('应清除 sessionStorage', () => {
    sessionStorage.setItem('customer_order_id', 'order1')
    sessionStorage.setItem('customer_access_token', 'tok_abc123')
    const session = CustomerSession.restore()
    session!.clear()
    expect(sessionStorage.getItem('customer_order_id')).toBeNull()
    expect(sessionStorage.getItem('customer_access_token')).toBeNull()
  })
})

describe('PublicOrderAPI', () => {
  beforeEach(() => {
    mockFetch.mockClear()
  })

  it('getOrdersByTable 应返回包含 accessToken 的订单', async () => {
    mockFetch.mockReturnValue(
      mockResponse({
        order: {
          id: 'o1',
          orderNo: '20260421001',
          tableNo: 'A1',
          status: 'pending',
          items: [],
          accessToken: 'tok_staff_generated_123',
        },
      }),
    )
    const orders = await PublicOrderAPI.getOrdersByTable('A1')
    expect(orders).toHaveLength(1)
    expect(orders[0].accessToken).toBe('tok_staff_generated_123')
  })

  it('getOrdersByTable 无订单时返回空数组', async () => {
    mockFetch.mockReturnValue(mockResponse({ order: null }))
    const orders = await PublicOrderAPI.getOrdersByTable('A1')
    expect(orders).toHaveLength(0)
  })

  it('getOrder 应通过 CustomerSession 中的 token 获取订单', async () => {
    mockFetch.mockReturnValue(
      mockResponse({
        order: { id: 'o1', orderNo: '20260421001', status: 'pending', items: [] },
      }),
    )
    const session = new CustomerSession('o1', 'tok_abc')
    const order = await PublicOrderAPI.getOrder('o1', session)
    expect(order.id).toBe('o1')
    const fetchCall = mockFetch.mock.calls[0] as [string, RequestInit?]
    expect(fetchCall[0]).toContain('token=tok_abc')
  })
})
