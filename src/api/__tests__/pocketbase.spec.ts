import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  OrderAPI,
  DishAPI,
  PublicOrderAPI,
  TableStatusAPI,
  SettingsAPI,
  APIError,
  escapePbString,
  mergeOrderItems,
  type Order,
  type OrderStatusValue,
} from '../pocketbase'
import { STORAGE_KEY_TOKEN, COLLECTION_ORDERS } from '@/constants/index'

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
})

describe('DishAPI', () => {
  it('getDishes 作为公开接口不应强制认证', async () => {
    mockFetch.mockReturnValue(mockResponse({ page: 1, perPage: 100, totalItems: 0, totalPages: 1, items: [] }))
    delete mockLocalStorage[STORAGE_KEY_TOKEN]

    const res = await DishAPI.getDishes()
    expect(res.items).toHaveLength(0)
  })

  it('createDish 应强制认证', async () => {
    delete mockLocalStorage[STORAGE_KEY_TOKEN]
    await expect(DishAPI.createDish({ name: 'Test', price: 10, category: '测试' })).rejects.toThrow('未登录')
  })
})
