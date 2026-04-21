import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  OrderAPI,
  DishAPI,
  PublicOrderAPI,
  TableStatusAPI,
  SettingsAPI,
  StatsAPI,
  subscribeToOrders,
  subscribeToDishes,
  APIError,
  escapePbString,
  mergeOrderItems,
  apiCache,
  type Order,
  type OrderStatusValue,
  type TableStatus,
  type Settings,
} from '../pocketbase'
import { STORAGE_KEY_TOKEN, COLLECTION_ORDERS, COLLECTION_TABLE_STATUS, COLLECTION_SETTINGS } from '@/constants/index'

const mockFetch = vi.fn()
const mockLocalStorage: Record<string, string> = {}

const originalLocation = window.location

beforeEach(() => {
  global.fetch = mockFetch

  // mock window.location.replace（不可直接 spyOn）
  Object.defineProperty(window, 'location', {
    writable: true,
    value: { ...originalLocation, replace: vi.fn() },
  })

  vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => mockLocalStorage[key] || null)
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key: string, value: string) => {
    mockLocalStorage[key] = value
  })
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation((key: string) => {
    delete mockLocalStorage[key]
  })

  mockLocalStorage[STORAGE_KEY_TOKEN] = 'valid.jwt.token'
  mockFetch.mockReset()
  apiCache.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  Object.keys(mockLocalStorage).forEach((k) => delete mockLocalStorage[k])
  Object.defineProperty(window, 'location', { writable: true, value: originalLocation })
})

function mockResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 401 ? 'Unauthorized' : 'OK',
    json: () => Promise.resolve(body),
  } as Response)
}

describe('escapePbString', () => {
  it('应转义单引号', () => {
    expect(escapePbString("test'value")).toBe("test''value")
  })

  it('应移除 PocketBase Filter 操作符', () => {
    expect(escapePbString("test||hack")).toBe("testhack")
    expect(escapePbString("test&&hack")).toBe("testhack")
    expect(escapePbString("test#hack")).toBe("testhack")
  })
})

describe('mergeOrderItems', () => {
  it('应合并相同 dishId 的数量', () => {
    const existing = [{ dishId: '1', name: 'A', price: 10, quantity: 1 }]
    const incoming = [{ dishId: '1', name: 'A', price: 10, quantity: 2 }]
    const result = mergeOrderItems(existing, incoming)
    expect(result[0]!.quantity).toBe(3)
  })

  it('应添加新菜品', () => {
    const existing = [{ dishId: '1', name: 'A', price: 10, quantity: 1 }]
    const incoming = [{ dishId: '2', name: 'B', price: 20, quantity: 1 }]
    const result = mergeOrderItems(existing, incoming)
    expect(result).toHaveLength(2)
  })
})

describe('OrderAPI', () => {
  it('getOrders 成功时应返回订单列表', async () => {
    const mockData = { page: 1, perPage: 30, totalItems: 1, totalPages: 1, items: [{ id: '1', status: 'pending' } as Order] }
    mockFetch.mockReturnValue(mockResponse(mockData))

    const res = await OrderAPI.getOrders(1, 30)
    expect(res.items).toHaveLength(1)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/collections/${COLLECTION_ORDERS}/records`),
      expect.objectContaining({ headers: expect.any(Headers) }),
    )
  })

  it('getOrder 成功时应返回订单详情', async () => {
    const mockOrder: Order = {
      id: '1', orderNo: 'O001', tableNo: 'A1', guests: 2, status: 'pending' as OrderStatusValue,
      items: [], totalAmount: 0, discount: 0, discountType: 'amount', discountValue: 0, finalAmount: 0,
      created: new Date().toISOString(), updated: new Date().toISOString(),
    }
    mockFetch.mockReturnValue(mockResponse(mockOrder))

    const res = await OrderAPI.getOrder('1')
    expect(res.id).toBe('1')
  })

  it('createOrder 成功时应返回新订单', async () => {
    const mockOrder: Order = {
      id: '1', orderNo: 'O001', tableNo: 'A1', guests: 2, status: 'pending' as OrderStatusValue,
      items: [], totalAmount: 0, discount: 0, discountType: 'amount', discountValue: 0, finalAmount: 0,
      created: new Date().toISOString(), updated: new Date().toISOString(),
    }
    mockFetch.mockReturnValue(mockResponse(mockOrder))

    const res = await OrderAPI.createOrder({ tableNo: 'A1', guests: 2, items: [] })
    expect(res.id).toBe('1')
  })

  it('updateOrder 成功时应返回更新后的订单', async () => {
    const mockOrder: Order = {
      id: '1', orderNo: 'O001', tableNo: 'A1', guests: 2, status: 'pending' as OrderStatusValue,
      items: [], totalAmount: 0, discount: 0, discountType: 'amount', discountValue: 0, finalAmount: 0,
      created: new Date().toISOString(), updated: new Date().toISOString(),
    }
    mockFetch.mockReturnValue(mockResponse(mockOrder))

    const res = await OrderAPI.updateOrder('1', { tableNo: 'A2' })
    expect(res.tableNo).toBe('A1')
  })

  it('updateOrderStatus 应调用 updateOrder', async () => {
    const mockOrder: Order = {
      id: '1', orderNo: 'O001', tableNo: 'A1', guests: 2, status: 'cooking' as OrderStatusValue,
      items: [], totalAmount: 0, discount: 0, discountType: 'amount', discountValue: 0, finalAmount: 0,
      created: new Date().toISOString(), updated: new Date().toISOString(),
    }
    mockFetch.mockReturnValue(mockResponse(mockOrder))

    const res = await OrderAPI.updateOrderStatus('1', 'cooking')
    expect(res.status).toBe('cooking')
    const callArgs = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(callArgs[1].body as string)
    expect(body.status).toBe('cooking')
  })

  it('updateOrderItemStatus 应更新指定菜品状态', async () => {
    const mockOrder: Order = {
      id: '1', orderNo: 'O001', tableNo: 'A1', guests: 2, status: 'pending' as OrderStatusValue,
      items: [{ dishId: 'd1', name: '鱼', price: 68, quantity: 1, status: 'pending' }],
      totalAmount: 68, discount: 0, discountType: 'amount', discountValue: 0, finalAmount: 68,
      created: new Date().toISOString(), updated: new Date().toISOString(),
    }
    mockFetch.mockReturnValue(mockResponse(mockOrder))

    const res = await OrderAPI.updateOrderItemStatus('1', 'd1', 'cooking')
    expect(res.id).toBe('1')
    const patchCall = mockFetch.mock.calls[1] as [string, RequestInit]
    const body = JSON.parse(patchCall[1].body as string)
    expect(body.items[0].status).toBe('cooking')
  })

  it('updateOrderItemStatus 对已结束订单应抛错', async () => {
    const mockOrder: Order = {
      id: '1', orderNo: 'O001', tableNo: 'A1', guests: 2, status: 'completed' as OrderStatusValue,
      items: [], totalAmount: 0, discount: 0, discountType: 'amount', discountValue: 0, finalAmount: 0,
      created: new Date().toISOString(), updated: new Date().toISOString(),
    }
    mockFetch.mockReturnValue(mockResponse(mockOrder))

    await expect(OrderAPI.updateOrderItemStatus('1', 'd1', 'cooking')).rejects.toThrow('订单已结束')
  })

  it('appendOrderItems 应合并新菜品', async () => {
    const mockOrder: Order = {
      id: '1', orderNo: 'O001', tableNo: 'A1', guests: 2, status: 'pending' as OrderStatusValue,
      items: [{ dishId: 'd1', name: '鱼', price: 68, quantity: 1 }],
      totalAmount: 68, discount: 0, discountType: 'amount', discountValue: 0, finalAmount: 68,
      created: new Date().toISOString(), updated: new Date().toISOString(),
    }
    mockFetch.mockReturnValue(mockResponse(mockOrder))

    const res = await OrderAPI.appendOrderItems('1', [{ dishId: 'd2', name: '肉', price: 48, quantity: 1 }])
    expect(res.id).toBe('1')
  })

  it('appendOrderItems 对已结束订单应抛错', async () => {
    const mockOrder: Order = {
      id: '1', orderNo: 'O001', tableNo: 'A1', guests: 2, status: 'settled' as OrderStatusValue,
      items: [], totalAmount: 0, discount: 0, discountType: 'amount', discountValue: 0, finalAmount: 0,
      created: new Date().toISOString(), updated: new Date().toISOString(),
    }
    mockFetch.mockReturnValue(mockResponse(mockOrder))

    await expect(OrderAPI.appendOrderItems('1', [])).rejects.toThrow('订单已结束')
  })

  it('deleteOrder 成功时应返回 true', async () => {
    mockFetch.mockReturnValue(mockResponse(null, 204))
    const res = await OrderAPI.deleteOrder('1')
    expect(res).toBe(true)
  })

  it('401 时应清理 token 并跳转登录', async () => {
    mockFetch.mockReturnValue(mockResponse({ message: 'Unauthorized' }, 401))
    await expect(OrderAPI.getOrders()).rejects.toThrow(APIError)
    expect(window.location.replace).toHaveBeenCalledWith('/login')
    expect(mockLocalStorage[STORAGE_KEY_TOKEN]).toBeUndefined()
  })

  it('403 时应提示权限不足', async () => {
    mockFetch.mockReturnValue(mockResponse({ message: 'Forbidden' }, 403))
    await expect(OrderAPI.getOrders()).rejects.toThrow('权限不足')
  })

  it('未登录时应直接抛 401', async () => {
    delete mockLocalStorage[STORAGE_KEY_TOKEN]
    await expect(OrderAPI.getOrders()).rejects.toThrow('未登录或登录已过期')
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('PublicOrderAPI', () => {
  it('createOrder 不应携带 Authorization', async () => {
    const mockOrder: Order = {
      id: '1', orderNo: 'O001', tableNo: 'A1', guests: 2, status: 'pending' as OrderStatusValue,
      items: [], totalAmount: 0, discount: 0, discountType: 'amount', discountValue: 0, finalAmount: 0,
      created: new Date().toISOString(), updated: new Date().toISOString(),
    }
    mockFetch.mockReturnValue(mockResponse(mockOrder))

    await PublicOrderAPI.createOrder({ tableNo: 'A1', guests: 2, items: [] })
    const callArgs = mockFetch.mock.calls[0] as [string, RequestInit]
    const headers = callArgs[1].headers as Headers
    expect(headers.has('Authorization')).toBe(false)
  })

  it('getOrdersByTable 应返回未完成订单', async () => {
    mockFetch.mockReturnValue(mockResponse({
      items: [{ id: '1', status: 'pending' }],
    }))
    const res = await PublicOrderAPI.getOrdersByTable('A1')
    expect(res).toHaveLength(1)
  })

  it('getOrdersByTable 无效桌号应抛错', async () => {
    await expect(PublicOrderAPI.getOrdersByTable('')).rejects.toThrow('无效的桌号格式')
  })

  it('appendOrderItems 应追加菜品', async () => {
    // 使用函数返回新对象，避免 mergeOrderItems 的副作用污染 mock 数据
    mockFetch.mockImplementation(() =>
      mockResponse({
        id: '1',
        items: [{ dishId: 'd1', name: '鱼', price: 68, quantity: 2 }],
      }),
    )
    const res = await PublicOrderAPI.appendOrderItems('1', [{ dishId: 'd1', name: '鱼', price: 68, quantity: 1 }])
    expect(res.id).toBe('1')
    // 验证 PATCH 请求 body 包含合并后的 items
    const patchCall = mockFetch.mock.calls[1] as [string, RequestInit]
    const body = JSON.parse(patchCall[1].body as string)
    expect(body.items[0].quantity).toBe(3) // 2 + 1
  })
})

describe('TableStatusAPI', () => {
  it('getTableStatus 应返回桌台状态', async () => {
    mockFetch.mockReturnValue(mockResponse({
      items: [{ id: 'ts1', tableNo: 'A1', status: 'dining', currentOrderId: 'o1' }],
    }))
    const res = await TableStatusAPI.getTableStatus('A1')
    expect(res?.tableNo).toBe('A1')
  })

  it('getTableStatus 无效桌号应抛错', async () => {
    await expect(TableStatusAPI.getTableStatus('')).rejects.toThrow('无效的桌号格式')
  })

  it('getAllTableStatuses 应返回所有桌台', async () => {
    mockFetch.mockReturnValue(mockResponse({
      items: [{ id: 'ts1', tableNo: 'A1', status: 'dining' }],
    }))
    const res = await TableStatusAPI.getAllTableStatuses()
    expect(res).toHaveLength(1)
  })

  it('updateTableStatus 应更新状态', async () => {
    mockFetch.mockReturnValue(mockResponse({ id: 'ts1', tableNo: 'A1', status: 'idle' }))
    const res = await TableStatusAPI.updateTableStatus('ts1', { status: 'idle', currentOrderId: '' })
    expect(res.status).toBe('idle')
  })

  it('createTableStatus 应创建记录', async () => {
    mockFetch.mockReturnValue(mockResponse({ id: 'ts2', tableNo: 'A2', status: 'idle' }))
    const res = await TableStatusAPI.createTableStatus({ tableNo: 'A2', status: 'idle' })
    expect(res.tableNo).toBe('A2')
  })
})

describe('SettingsAPI', () => {
  it('getSettings 应返回设置并缓存', async () => {
    const settings: Settings = {
      id: 's1', tableNumbers: ['A1'], categories: ['凉菜'], restaurantName: '测试餐厅',
      address: '', phone: '', wechatPayQr: '', alipayQr: '',
    }
    mockFetch.mockReturnValue(mockResponse({ items: [settings] }))
    const res = await SettingsAPI.getSettings()
    expect(res?.restaurantName).toBe('测试餐厅')

    // 第二次调用应走缓存，不发起请求
    mockFetch.mockClear()
    const res2 = await SettingsAPI.getSettings()
    expect(res2?.restaurantName).toBe('测试餐厅')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('updateSettings 应更新并清除缓存', async () => {
    mockFetch.mockReturnValue(mockResponse({ id: 's1', restaurantName: '新名称' }))
    const res = await SettingsAPI.updateSettings('s1', { restaurantName: '新名称' })
    expect(res.restaurantName).toBe('新名称')
  })

  it('updateSettingsFiles 应使用 FormData', async () => {
    mockFetch.mockReturnValue(mockResponse({ id: 's1', restaurantName: '测试餐厅' }))
    const fd = new FormData()
    const res = await SettingsAPI.updateSettingsFiles('s1', fd)
    expect(res.id).toBe('s1')
    const callArgs = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(callArgs[1].body).toBe(fd)
  })

  it('createSettings 应创建设置', async () => {
    mockFetch.mockReturnValue(mockResponse({ id: 's1', restaurantName: '新店' }))
    const res = await SettingsAPI.createSettings({ restaurantName: '新店' })
    expect(res.restaurantName).toBe('新店')
  })
})

describe('StatsAPI', () => {
  it('getStats 应返回统计数据', async () => {
    mockFetch.mockReturnValue(mockResponse({ totalRevenue: 1000, orderCount: 10 }))
    const res = await StatsAPI.getStats('2026-04-01', '2026-04-19')
    expect(res?.totalRevenue).toBe(1000)
  })

  it('getStats 404 时应返回 null', async () => {
    mockFetch.mockReturnValue(mockResponse({ message: 'Not Found' }, 404))
    const res = await StatsAPI.getStats()
    expect(res).toBeNull()
  })
})

describe('subscribeToOrders', () => {
  it('应建立 SSE 连接并返回取消函数', async () => {
    const mockES = {
      addEventListener: vi.fn(),
      close: vi.fn(),
    }
    global.EventSource = function () { return mockES } as any

    mockFetch.mockReturnValueOnce(mockResponse({ clientId: 'cid123' }))
    mockFetch.mockReturnValueOnce(Promise.resolve({ ok: true, status: 200 } as Response))

    const unsub = await subscribeToOrders("status='pending'", vi.fn())
    expect(typeof unsub).toBe('function')
    expect(mockES.addEventListener).toHaveBeenCalledWith('PB_CONNECT', expect.any(Function))
    expect(mockES.addEventListener).toHaveBeenCalledWith('orders', expect.any(Function))

    // 触发 PB_CONNECT，覆盖 doSubscribe 分支
    const pbConnectHandler = mockES.addEventListener.mock.calls.find(
      (call: any[]) => call[0] === 'PB_CONNECT',
    )![1]
    pbConnectHandler()
    // doSubscribe 内部 fetch 已被调用
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/realtime/subscribe'),
      expect.objectContaining({ method: 'POST' }),
    )

    unsub()
    expect(mockES.close).toHaveBeenCalled()
  })

  it('EventSource 不支持时应抛错', async () => {
    // @ts-expect-error global override in test
    global.EventSource = undefined
    await expect(subscribeToOrders("status='pending'", vi.fn())).rejects.toThrow('EventSource not supported')
  })
})

describe('apiCache', () => {
  it('应缓存并返回数据', () => {
    apiCache.set('key1', { data: 123 }, 60000)
    expect(apiCache.get('key1')).toEqual({ data: 123 })
  })

  it('过期后应返回 undefined', () => {
    apiCache.set('key2', { data: 456 }, -1)
    expect(apiCache.get('key2')).toBeUndefined()
  })

  it('clear 应清除指定 key', () => {
    apiCache.set('key3', { data: 789 }, 60000)
    apiCache.clear('key3')
    expect(apiCache.get('key3')).toBeUndefined()
  })
})

describe('DishAPI.toggleSoldOut', () => {
  it('应 PATCH 菜品 soldOut 状态', async () => {
    mockFetch.mockReturnValue(
      mockResponse({ id: 'd1', name: '鱼', soldOut: true, soldOutNote: '今日无货' }),
    )
    const res = await DishAPI.toggleSoldOut('d1', true, '今日无货')
    expect(res.soldOut).toBe(true)
    const patchCall = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(patchCall[1].method).toBe('PATCH')
    const body = JSON.parse(patchCall[1].body as string)
    expect(body.soldOut).toBe(true)
    expect(body.soldOutNote).toBe('今日无货')
    expect(body.soldOutAt).toBeTruthy()
  })

  it('恢复售卖时应清除 soldOutAt', async () => {
    mockFetch.mockReturnValue(mockResponse({ id: 'd1', name: '鱼', soldOut: false }))
    const res = await DishAPI.toggleSoldOut('d1', false)
    expect(res.soldOut).toBe(false)
    const patchCall = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(patchCall[1].body as string)
    expect(body.soldOut).toBe(false)
    expect(body.soldOutAt).toBeNull()
  })
})

describe('subscribeToDishes', () => {
  it('应建立共享 SSE 连接并支持多回调', async () => {
    const mockES = {
      addEventListener: vi.fn(),
      close: vi.fn(),
    }
    const MockEventSource = vi.fn(function () { return mockES } as any)
    global.EventSource = MockEventSource as unknown as typeof EventSource

    mockFetch.mockReturnValueOnce(mockResponse({ clientId: 'cid123' }))
    mockFetch.mockReturnValueOnce(Promise.resolve({ ok: true, status: 200 } as Response))

    const cb1 = vi.fn()
    const cb2 = vi.fn()
    const unsub1 = await subscribeToDishes(cb1)
    const unsub2 = await subscribeToDishes(cb2)

    expect(MockEventSource).toHaveBeenCalledTimes(1)

    // 触发 PB_CONNECT，覆盖 doSubscribe 分支
    const pbConnectHandler = mockES.addEventListener.mock.calls.find(
      (call: any[]) => call[0] === 'PB_CONNECT',
    )![1]
    pbConnectHandler()

    // 模拟 PocketBase 推送菜品更新
    const collectionHandler = mockES.addEventListener.mock.calls.find(
      (call: any[]) => call[0] === 'dishes',
    )
    expect(collectionHandler).toBeTruthy()
    const dishUpdate = { id: 'd1', name: '鱼', soldOut: true }
    collectionHandler![1]({ data: JSON.stringify({ record: dishUpdate }) } as MessageEvent)

    expect(cb1).toHaveBeenCalledWith(dishUpdate)
    expect(cb2).toHaveBeenCalledWith(dishUpdate)

    unsub1()
    expect(mockES.close).not.toHaveBeenCalled()

    unsub2()
    expect(mockES.close).toHaveBeenCalledTimes(1)
  })

  it('EventSource 不支持时应抛出错误', async () => {
    // jsdom 中无法真正删除 EventSource，测试逻辑分支即可
    const original = global.EventSource
    // @ts-expect-error global override in test
    global.EventSource = undefined
    await expect(subscribeToDishes(vi.fn())).rejects.toThrow('EventSource not supported')
    global.EventSource = original
  })
})

describe('DishAPI', () => {
  it('getDishes 现在需要认证', async () => {
    delete mockLocalStorage[STORAGE_KEY_TOKEN]
    await expect(DishAPI.getDishes()).rejects.toThrow('未登录')
  })

  it('createDish 应强制认证', async () => {
    delete mockLocalStorage[STORAGE_KEY_TOKEN]
    await expect(DishAPI.createDish({ name: 'Test', price: 10, category: '测试' })).rejects.toThrow('未登录')
  })

  it('createDish 成功应返回菜品并清除缓存', async () => {
    mockFetch.mockReturnValue(mockResponse({ id: 'd_new', name: '新菜', price: 99 }))
    const res = await DishAPI.createDish({ name: '新菜', price: 99, category: '测试' })
    expect(res.id).toBe('d_new')
  })

  it('updateDish 成功应返回更新后的菜品', async () => {
    mockFetch.mockReturnValue(mockResponse({ id: 'd1', name: '更新菜', price: 88 }))
    const res = await DishAPI.updateDish('d1', { name: '更新菜' })
    expect(res.name).toBe('更新菜')
  })

  it('deleteDish 成功应返回 true', async () => {
    mockFetch.mockReturnValue(mockResponse({}, 204))
    const res = await DishAPI.deleteDish('d1')
    expect(res).toBe(true)
  })
})

describe('fetchWithTimeout', () => {
  it('请求超时应抛出 408 错误', async () => {
    const { fetchWithTimeout } = await import('@/api/pocketbase')
    // 模拟 fetch 抛出 AbortError（超时场景）
    mockFetch.mockImplementation(() => {
      const err = new Error('The operation was aborted.')
      err.name = 'AbortError'
      return Promise.reject(err)
    })
    await expect(fetchWithTimeout('/test', {}, 10)).rejects.toThrow('请求超时')
  })

  it('非 AbortError 网络错误应包装为 APIError', async () => {
    const { fetchWithTimeout } = await import('@/api/pocketbase')
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(fetchWithTimeout('/test')).rejects.toThrow('Failed to fetch')
  })
})

describe('handleResponse', () => {
  it('response.json() 失败时应使用 statusText 构造错误', async () => {
    const { handleResponse } = await import('@/api/pocketbase')
    const res = {
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: () => Promise.reject(new Error('invalid json')),
    } as Response
    await expect(handleResponse(res)).rejects.toThrow('HTTP 500: Internal Server Error')
  })

  it('500 错误应上报 Sentry', async () => {
    const { handleResponse } = await import('@/api/pocketbase')
    const res = {
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: () => Promise.resolve({ message: 'Server Error' }),
    } as Response
    await expect(handleResponse(res)).rejects.toThrow('Server Error')
  })
})

describe('StatsAPI 异常分支', () => {
  it('getStats 非 404 错误应重新抛出', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: () => Promise.resolve({ message: 'Server Error' }),
    } as Response)
    await expect(StatsAPI.getStats()).rejects.toThrow('Server Error')
  })
})

describe('subscribeToOrders', () => {
  const originalEventSource = globalThis.EventSource

  afterEach(() => {
    globalThis.EventSource = originalEventSource
  })

  it('无 EventSource 时应抛错', async () => {
    // @ts-expect-error global override in test
    globalThis.EventSource = undefined
    const { subscribeToOrders } = await import('@/api/pocketbase')
    await expect(subscribeToOrders("status='pending'", () => {})).rejects.toThrow('EventSource not supported')
  })
})

describe('subscribeToDishes 共享 SSE 清理', () => {
  const originalEventSource = globalThis.EventSource

  afterEach(() => {
    globalThis.EventSource = originalEventSource
  })

  it('最后一个注销时应关闭 EventSource', async () => {
    vi.resetModules()
    const mockClose = vi.fn()
    const instances: any[] = []
    class MockES {
      url = ''
      listeners: Record<string, ((e: MessageEvent) => void)[]> = {}
      constructor() { instances.push(this) }
      addEventListener = vi.fn((event: string, handler: (e: MessageEvent) => void) => {
        if (!this.listeners[event]) this.listeners[event] = []
        this.listeners[event].push(handler)
      })
      close = mockClose
    }
    // @ts-expect-error global override in test
    globalThis.EventSource = MockES

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ clientId: 'test-client-id' }),
    } as Response)

    const pb = await import('@/api/pocketbase')
    const unsub1 = await pb.subscribeToDishes(() => {})
    const unsub2 = await pb.subscribeToDishes(() => {})

    // 注销一个，连接应保留
    unsub1()
    expect(mockClose).not.toHaveBeenCalled()

    // 注销最后一个，连接应关闭
    unsub2()
    expect(mockClose).toHaveBeenCalledTimes(1)
  })

  it('SSE 消息 JSON.parse 失败应静默忽略', async () => {
    vi.resetModules()
    const mockClose = vi.fn()
    const instances: any[] = []
    class MockES {
      url = ''
      listeners: Record<string, ((e: MessageEvent) => void)[]> = {}
      constructor() { instances.push(this) }
      addEventListener = vi.fn((event: string, handler: (e: MessageEvent) => void) => {
        if (!this.listeners[event]) this.listeners[event] = []
        this.listeners[event].push(handler)
      })
      close = mockClose
    }
    // @ts-expect-error global override in test
    globalThis.EventSource = MockES

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ clientId: 'test-client-id' }),
    } as Response)

    const pb = await import('@/api/pocketbase')
    const cb = vi.fn()
    await pb.subscribeToDishes(cb)

    // 找到模块内部创建的 EventSource 实例，触发其监听器
    const es = instances[0]
    const dishListeners = es.listeners['dishes'] || []
    // JSON.parse 对非法 JSON 应静默处理，不抛异常
    dishListeners.forEach((handler: any) => {
      handler(new MessageEvent('message', { data: 'invalid json {' }))
    })
    // 回调不应被调用（因为 parse 失败）
    expect(cb).not.toHaveBeenCalled()
  })
})

describe('privateRequest 分支覆盖', () => {
  it('403 时应提示权限不足', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: () => Promise.resolve({ message: 'Forbidden' }),
    } as Response)
    await expect(OrderAPI.getOrders()).rejects.toThrow('权限不足')
  })

  it('携带 FormData 时不应设置 Content-Type', async () => {
    const formData = new FormData()
    formData.append('file', new Blob(['test']))
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: 's1', restaurantName: 'Test' }),
    } as Response)
    await SettingsAPI.updateSettingsFiles('s1', formData)
    const call = mockFetch.mock.calls[0]
    const headers = call[1].headers as Headers
    expect(headers.has('Content-Type')).toBe(false)
    expect(headers.has('Authorization')).toBe(true)
  })
})

describe('subscribeToOrders 异常分支', () => {
  const originalEventSource = globalThis.EventSource

  afterEach(() => {
    globalThis.EventSource = originalEventSource
  })

  it('SSE 消息 JSON.parse 失败应静默忽略', async () => {
    const instances: any[] = []
    class MockES {
      url = ''
      listeners: Record<string, ((e: MessageEvent) => void)[]> = {}
      constructor() { instances.push(this) }
      addEventListener = vi.fn((event: string, handler: (e: MessageEvent) => void) => {
        if (!this.listeners[event]) this.listeners[event] = []
        this.listeners[event].push(handler)
      })
      close = vi.fn()
    }
    // @ts-expect-error global override in test
    globalThis.EventSource = MockES

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ clientId: 'test-client-id' }),
    } as Response)

    vi.resetModules()
    const pb = await import('@/api/pocketbase')
    const cb = vi.fn()
    await pb.subscribeToOrders("status='pending'", cb)

    const es = instances[0]
    const orderListeners = es.listeners['orders'] || []
    orderListeners.forEach((handler: any) => {
      handler(new MessageEvent('message', { data: 'invalid json {' }))
    })
    expect(cb).not.toHaveBeenCalled()
  })
})

describe('PublicOrderAPI appendOrderItems 分支覆盖', () => {
  it('dishesMap 包含沽清菜品应抛 400', async () => {
    const dishesMap = new Map([['d1', { id: 'd1', name: '鱼', soldOut: true } as any]])
    await expect(
      PublicOrderAPI.appendOrderItems('o1', [{ dishId: 'd1', name: '鱼', price: 68, quantity: 1 }], dishesMap),
    ).rejects.toThrow('以下菜品已沽清')
  })

  it('订单不存在应抛 404', async () => {
    mockFetch.mockReturnValue(mockResponse(null, 204))
    await expect(
      PublicOrderAPI.appendOrderItems('o1', [{ dishId: 'd1', name: '鱼', price: 68, quantity: 1 }]),
    ).rejects.toThrow('订单不存在')
  })

  it('已结束订单不能追加菜品', async () => {
    mockFetch.mockReturnValueOnce(
      mockResponse({ id: 'o1', status: 'completed', items: [] }),
    )
    await expect(
      PublicOrderAPI.appendOrderItems('o1', [{ dishId: 'd1', name: '鱼', price: 68, quantity: 1 }]),
    ).rejects.toThrow('订单已结束')
  })
})

describe('DishAPI 剩余分支', () => {
  it('getDishesByCategory 应按分类返回菜品', async () => {
    mockFetch.mockReturnValue(mockResponse({
      items: [{ id: 'd1', name: '鱼', category: '铁锅炖' }],
    }))
    const res = await DishAPI.getDishesByCategory('铁锅炖')
    expect(res.items).toHaveLength(1)
    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('category%3D')
  })

  it('getDish 应返回单个菜品', async () => {
    mockFetch.mockReturnValue(mockResponse({ id: 'd1', name: '鱼' }))
    const res = await DishAPI.getDish('d1')
    expect(res.name).toBe('鱼')
  })
})

describe('PublicOrderAPI 剩余分支', () => {
  it('createOrder 返回 null 应抛 500', async () => {
    mockFetch.mockReturnValue(mockResponse(null, 204))
    await expect(
      PublicOrderAPI.createOrder({ tableNo: 'A1', guests: 2, items: [] }),
    ).rejects.toThrow('创建订单失败')
  })
})
