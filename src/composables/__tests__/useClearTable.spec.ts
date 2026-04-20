import { describe, it, expect, vi } from 'vitest'
import { useClearTable } from '../useClearTable'
import { TableStatusAPI, PublicOrderAPI, OrderAPI } from '@/api/pocketbase'
import { OrderStatus } from '@/utils/orderStatus'

vi.mock('@/api/pocketbase', async () => {
  const actual = await vi.importActual<typeof import('@/api/pocketbase')>('@/api/pocketbase')
  return {
    ...actual,
    TableStatusAPI: {
      getTableStatus: vi.fn(),
      updateTableStatus: vi.fn(),
    },
    PublicOrderAPI: {
      getOrdersByTable: vi.fn(),
    },
    OrderAPI: {
      getOrder: vi.fn(),
    },
  }
})

describe('useClearTable', () => {
  it('idle 状态应阻止清台', async () => {
    vi.mocked(TableStatusAPI.getTableStatus).mockResolvedValue({
      id: 'ts1', tableNo: 'A1', status: 'idle',
    })
    const { checkCanClearTable } = useClearTable()
    const res = await checkCanClearTable('A1')
    expect(res.canClear).toBe(false)
    expect(res.reason).toBe('idle')
  })

  it('有未完成订单应阻止清台', async () => {
    vi.mocked(TableStatusAPI.getTableStatus).mockResolvedValue({
      id: 'ts1', tableNo: 'A1', status: 'dining', currentOrderId: 'o1',
    })
    vi.mocked(PublicOrderAPI.getOrdersByTable).mockResolvedValue([{
      id: 'o1', status: OrderStatus.PENDING,
    } as any])
    const { checkCanClearTable } = useClearTable()
    const res = await checkCanClearTable('A1')
    expect(res.canClear).toBe(false)
    expect(res.reason).toBe('unfinished')
  })

  it('COMPLETED 订单应允许清台（已结账可直接清台）', async () => {
    vi.mocked(TableStatusAPI.getTableStatus).mockResolvedValue({
      id: 'ts1', tableNo: 'A1', status: 'dining', currentOrderId: 'o1',
    })
    vi.mocked(PublicOrderAPI.getOrdersByTable).mockResolvedValue([])
    vi.mocked(OrderAPI.getOrder).mockResolvedValue({
      id: 'o1', status: OrderStatus.COMPLETED,
    } as any)
    const { checkCanClearTable } = useClearTable()
    const res = await checkCanClearTable('A1')
    expect(res.canClear).toBe(true)
  })

  it('正常状态应允许清台', async () => {
    vi.mocked(TableStatusAPI.getTableStatus).mockResolvedValue({
      id: 'ts1', tableNo: 'A1', status: 'dining', currentOrderId: 'o1',
    })
    vi.mocked(PublicOrderAPI.getOrdersByTable).mockResolvedValue([])
    vi.mocked(OrderAPI.getOrder).mockResolvedValue({
      id: 'o1', status: OrderStatus.SETTLED,
    } as any)
    const { checkCanClearTable } = useClearTable()
    const res = await checkCanClearTable('A1')
    expect(res.canClear).toBe(true)
  })
})
