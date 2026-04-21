import { describe, it, expect, vi, beforeEach } from 'vitest'
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
      updateOrderStatus: vi.fn(),
    },
  }
})

describe('useClearTable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('checkCanClearTable', () => {
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

    it('当前订单为 DINING 应阻止清台', async () => {
      vi.mocked(TableStatusAPI.getTableStatus).mockResolvedValue({
        id: 'ts1', tableNo: 'A1', status: 'dining', currentOrderId: 'o1',
      })
      vi.mocked(PublicOrderAPI.getOrdersByTable).mockResolvedValue([])
      vi.mocked(OrderAPI.getOrder).mockResolvedValue({
        id: 'o1', status: OrderStatus.DINING,
      } as any)
      const { checkCanClearTable } = useClearTable()
      const res = await checkCanClearTable('A1')
      expect(res.canClear).toBe(false)
      expect(res.reason).toBe('dining')
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

    it('SETTLED 订单应允许清台', async () => {
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

    it('getTableStatus 返回 null 时应继续检查', async () => {
      vi.mocked(TableStatusAPI.getTableStatus).mockResolvedValue(null)
      vi.mocked(PublicOrderAPI.getOrdersByTable).mockResolvedValue([])
      const { checkCanClearTable } = useClearTable()
      const res = await checkCanClearTable('A1')
      expect(res.canClear).toBe(true)
    })

    it('getOrder 失败时应允许清台（兜底）', async () => {
      vi.mocked(TableStatusAPI.getTableStatus).mockResolvedValue({
        id: 'ts1', tableNo: 'A1', status: 'dining', currentOrderId: 'o1',
      })
      vi.mocked(PublicOrderAPI.getOrdersByTable).mockResolvedValue([])
      vi.mocked(OrderAPI.getOrder).mockRejectedValue(new Error('网络错误'))
      const { checkCanClearTable } = useClearTable()
      const res = await checkCanClearTable('A1')
      expect(res.canClear).toBe(true)
    })
  })

  describe('executeClearTable', () => {
    it('tableStatus.id 不存在应抛出异常', async () => {
      const { executeClearTable } = useClearTable()
      await expect(executeClearTable(undefined)).rejects.toThrow('桌台数据异常')
      await expect(executeClearTable({ id: '', tableNo: 'A1', status: 'dining' } as any)).rejects.toThrow('桌台数据异常')
    })

    it('订单查询失败应阻断清台', async () => {
      vi.mocked(OrderAPI.getOrder).mockRejectedValue(new Error('网络错误'))
      const { executeClearTable } = useClearTable()
      await expect(executeClearTable({
        id: 'ts1', tableNo: 'A1', status: 'dining', currentOrderId: 'o1',
      } as any)).rejects.toThrow('无法确认当前桌台订单状态')
    })

    it('COMPLETED 订单更新为 SETTLED 失败应阻断清台', async () => {
      vi.mocked(OrderAPI.getOrder).mockResolvedValue({
        id: 'o1', status: OrderStatus.COMPLETED,
      } as any)
      vi.mocked(OrderAPI.updateOrderStatus).mockRejectedValue(new Error('DB error'))
      const { executeClearTable } = useClearTable()
      await expect(executeClearTable({
        id: 'ts1', tableNo: 'A1', status: 'dining', currentOrderId: 'o1',
      } as any)).rejects.toThrow('订单状态更新失败')
    })

    it('订单处于活跃状态应阻断清台', async () => {
      vi.mocked(OrderAPI.getOrder).mockResolvedValue({
        id: 'o1', status: OrderStatus.COOKING,
      } as any)
      const { executeClearTable } = useClearTable()
      await expect(executeClearTable({
        id: 'ts1', tableNo: 'A1', status: 'dining', currentOrderId: 'o1',
      } as any)).rejects.toThrow('该桌还有未完成订单')
    })

    it('COMPLETED 订单应先更新为 SETTLED 再清台', async () => {
      vi.mocked(OrderAPI.getOrder).mockResolvedValue({
        id: 'o1', status: OrderStatus.COMPLETED,
      } as any)
      vi.mocked(OrderAPI.updateOrderStatus).mockResolvedValue(undefined)
      vi.mocked(TableStatusAPI.updateTableStatus).mockResolvedValue(undefined)
      const { executeClearTable } = useClearTable()
      await executeClearTable({
        id: 'ts1', tableNo: 'A1', status: 'dining', currentOrderId: 'o1',
      } as any)
      expect(OrderAPI.updateOrderStatus).toHaveBeenCalledWith('o1', OrderStatus.SETTLED)
      expect(TableStatusAPI.updateTableStatus).toHaveBeenCalledWith('ts1', {
        status: 'idle',
        currentOrderId: '',
      })
    })

    it('SETTLED 订单应直接清台', async () => {
      vi.mocked(OrderAPI.getOrder).mockResolvedValue({
        id: 'o1', status: OrderStatus.SETTLED,
      } as any)
      vi.mocked(TableStatusAPI.updateTableStatus).mockResolvedValue(undefined)
      const { executeClearTable } = useClearTable()
      await executeClearTable({
        id: 'ts1', tableNo: 'A1', status: 'dining', currentOrderId: 'o1',
      } as any)
      expect(OrderAPI.updateOrderStatus).not.toHaveBeenCalled()
      expect(TableStatusAPI.updateTableStatus).toHaveBeenCalledWith('ts1', {
        status: 'idle',
        currentOrderId: '',
      })
    })

    it('无 currentOrderId 时应直接清台', async () => {
      vi.mocked(TableStatusAPI.updateTableStatus).mockResolvedValue(undefined)
      const { executeClearTable } = useClearTable()
      await executeClearTable({
        id: 'ts1', tableNo: 'A1', status: 'dining',
      } as any)
      expect(OrderAPI.getOrder).not.toHaveBeenCalled()
      expect(TableStatusAPI.updateTableStatus).toHaveBeenCalledWith('ts1', {
        status: 'idle',
        currentOrderId: '',
      })
    })
  })
})
