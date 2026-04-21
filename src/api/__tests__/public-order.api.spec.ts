import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CustomerSession, PublicOrderAPI, PublicDishAPI, PublicTableStatusAPI } from '@/api/public-order.api'

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

  it('应提供 orderIdValue 和 accessTokenValue getter', () => {
    const session = new CustomerSession('order1', 'tok_abc123')
    expect(session.orderIdValue).toBe('order1')
    expect(session.accessTokenValue).toBe('tok_abc123')
  })
})

describe('PublicDishAPI', () => {
  beforeEach(() => {
    mockFetch.mockClear()
  })

  it('getDishes 应返回菜品列表', async () => {
    mockFetch.mockReturnValue(
      mockResponse({
        items: [
          { id: 'd1', name: '铁锅鱼', price: 68, category: '铁锅炖', soldOut: false },
        ],
      }),
    )
    const data = await PublicDishAPI.getDishes()
    expect(data.items).toHaveLength(1)
    expect(data.items[0].name).toBe('铁锅鱼')
  })

  it('getDishes 返回空数据应抛出异常', async () => {
    mockFetch.mockReturnValue(mockResponse(null))
    await expect(PublicDishAPI.getDishes()).rejects.toThrow('获取菜品失败')
  })

  it('getDishes 网络错误应抛出异常', async () => {
    mockFetch.mockReturnValue(mockResponse({ message: 'Server Error' }, 500))
    await expect(PublicDishAPI.getDishes()).rejects.toThrow()
  })
})

describe('PublicTableStatusAPI', () => {
  beforeEach(() => {
    mockFetch.mockClear()
  })

  it('getTableStatus 应返回桌台状态', async () => {
    mockFetch.mockReturnValue(
      mockResponse({
        status: { id: 'ts1', tableNo: 'A1', status: 'dining', currentOrderId: 'o1' },
      }),
    )
    const status = await PublicTableStatusAPI.getTableStatus('A1')
    expect(status).not.toBeNull()
    expect(status!.status).toBe('dining')
    expect(status!.currentOrderId).toBe('o1')
  })

  it('getTableStatus 无数据时应返回 null', async () => {
    mockFetch.mockReturnValue(mockResponse({ status: null }))
    const status = await PublicTableStatusAPI.getTableStatus('A1')
    expect(status).toBeNull()
  })

  it('getTableStatus 状态应为正确的联合类型', async () => {
    mockFetch.mockReturnValue(
      mockResponse({
        status: { id: 'ts1', tableNo: 'A1', status: 'idle' },
      }),
    )
    const status = await PublicTableStatusAPI.getTableStatus('A1')
    expect(status!.status).toBe('idle')
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

  it('getOrder 订单不存在时应抛出 404', async () => {
    mockFetch.mockReturnValue(mockResponse({ order: null }))
    const session = new CustomerSession('o1', 'tok_abc')
    await expect(PublicOrderAPI.getOrder('o1', session)).rejects.toThrow('订单不存在')
  })

  it('createOrder 应创建订单并返回 accessToken', async () => {
    mockFetch.mockReturnValue(
      mockResponse({
        id: 'o1',
        orderNo: '20260421001',
        tableNo: 'A1',
        status: 'pending',
        items: [],
        accessToken: 'tok_new_123',
      }),
    )
    const order = await PublicOrderAPI.createOrder({
      tableNo: 'A1',
      guests: 4,
      items: [],
      totalAmount: 0,
      discount: 0,
      finalAmount: 0,
    } as any)
    expect(order.accessToken).toBe('tok_new_123')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/public/orders'),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('createOrder 失败时应抛出异常', async () => {
    mockFetch.mockReturnValue(mockResponse({ message: 'Server Error' }, 500))
    await expect(
      PublicOrderAPI.createOrder({ tableNo: 'A1', guests: 4, items: [] } as any),
    ).rejects.toThrow('Server Error')
  })

  it('appendOrderItems 应追加菜品', async () => {
    mockFetch.mockReturnValue(
      mockResponse({
        order: { id: 'o1', items: [{ dishId: 'd2', name: '新增菜', price: 20, quantity: 1 }] },
      }),
    )
    const session = new CustomerSession('o1', 'tok_abc')
    const newItems = [{ dishId: 'd2', name: '新增菜', price: 20, quantity: 1 }]
    const order = await PublicOrderAPI.appendOrderItems('o1', session, newItems)
    expect(order.items).toHaveLength(1)
    const fetchCall = mockFetch.mock.calls[0] as [string, RequestInit?]
    expect(fetchCall[0]).toContain('/public/orders/o1/items')
    expect(fetchCall[0]).toContain('token=tok_abc')
    expect(fetchCall[1]?.method).toBe('PATCH')
  })

  it('appendOrderItems 失败时应抛出异常', async () => {
    mockFetch.mockReturnValue(mockResponse({ message: 'DB Error' }, 500))
    const session = new CustomerSession('o1', 'tok_abc')
    await expect(
      PublicOrderAPI.appendOrderItems('o1', session, []),
    ).rejects.toThrow('DB Error')
  })
})
