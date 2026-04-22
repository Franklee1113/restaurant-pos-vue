import { describe, it, expect, vi } from 'vitest'
import {
  OrderStatus,
  StatusLabels,
  ActionLabels,
  StatusColors,
  StatusBadgeClass,
  StatusFlow,
  canTransition,
  getAllowedNextStatuses,
  getStatusButtons,
  generateOrderNo,
  transitionStatus,
  isActiveStatus,
  isTerminalStatus,
  inferOrderStatusFromItems,
  calculateAmount,
} from '../orderStatus'

describe('OrderStatus', () => {
  it('状态标签应该正确映射', () => {
    expect(StatusLabels[OrderStatus.PENDING]).toBe('待确认')
    expect(StatusLabels[OrderStatus.COOKING]).toBe('制作中')
    expect(StatusLabels[OrderStatus.SERVING]).toBe('上菜中')
    expect(StatusLabels[OrderStatus.DINING]).toBe('用餐中')
    expect(StatusLabels[OrderStatus.COMPLETED]).toBe('已结账')
    expect(StatusLabels[OrderStatus.SETTLED]).toBe('已清台')
    expect(StatusLabels[OrderStatus.CANCELLED]).toBe('已取消')
  })

  it('ActionLabels 应该正确映射', () => {
    expect(ActionLabels[OrderStatus.PENDING]).toBe('待确认')
    expect(ActionLabels[OrderStatus.COOKING]).toBe('开始制作')
    expect(ActionLabels[OrderStatus.SERVING]).toBe('开始上菜')
    expect(ActionLabels[OrderStatus.DINING]).toBe('上菜完毕')
    expect(ActionLabels[OrderStatus.COMPLETED]).toBe('确认结账')
    expect(ActionLabels[OrderStatus.SETTLED]).toBe('确认清台')
    expect(ActionLabels[OrderStatus.CANCELLED]).toBe('取消订单')
  })

  it('StatusColors 应该为每个状态定义颜色', () => {
    const allStatuses = Object.values(OrderStatus)
    allStatuses.forEach((status) => {
      expect(StatusColors[status]).toBeDefined()
      expect(typeof StatusColors[status]).toBe('string')
    })
  })

  it('StatusBadgeClass 应该为每个状态定义样式类', () => {
    const allStatuses = Object.values(OrderStatus)
    allStatuses.forEach((status) => {
      expect(StatusBadgeClass[status]).toBeDefined()
      expect(typeof StatusBadgeClass[status]).toBe('string')
    })
  })

  it('StatusFlow 应该定义正确的流转关系', () => {
    expect(StatusFlow[OrderStatus.PENDING]).toEqual([OrderStatus.COOKING, OrderStatus.CANCELLED])
    expect(StatusFlow[OrderStatus.COOKING]).toEqual([OrderStatus.SERVING, OrderStatus.CANCELLED])
    expect(StatusFlow[OrderStatus.SERVING]).toEqual([OrderStatus.DINING, OrderStatus.CANCELLED])
    expect(StatusFlow[OrderStatus.DINING]).toEqual([OrderStatus.COMPLETED, OrderStatus.CANCELLED])
    expect(StatusFlow[OrderStatus.COMPLETED]).toEqual([OrderStatus.SETTLED])
    expect(StatusFlow[OrderStatus.SETTLED]).toEqual([])
    expect(StatusFlow[OrderStatus.CANCELLED]).toEqual([])
  })

  it('应该允许合法的状态流转', () => {
    expect(canTransition(OrderStatus.PENDING, OrderStatus.COOKING)).toBe(true)
    expect(canTransition(OrderStatus.PENDING, OrderStatus.COMPLETED)).toBe(false)
    expect(canTransition(OrderStatus.COMPLETED, OrderStatus.SETTLED)).toBe(true)
    expect(canTransition(OrderStatus.COMPLETED, OrderStatus.PENDING)).toBe(false)
  })

  it('同状态流转应该返回 false', () => {
    expect(canTransition(OrderStatus.PENDING, OrderStatus.PENDING)).toBe(false)
    expect(canTransition(OrderStatus.SETTLED, OrderStatus.SETTLED)).toBe(false)
  })

  it('应该获取允许的下一个状态', () => {
    expect(getAllowedNextStatuses(OrderStatus.PENDING)).toEqual([
      OrderStatus.COOKING,
      OrderStatus.CANCELLED,
    ])
    expect(getAllowedNextStatuses(OrderStatus.COMPLETED)).toEqual([OrderStatus.SETTLED])
  })

  it('非法状态应该返回空数组', () => {
    expect(getAllowedNextStatuses('unknown' as any)).toEqual([])
  })

  it('应该生成正确的状态按钮', () => {
    const buttons = getStatusButtons(OrderStatus.COOKING)
    expect(buttons).toHaveLength(2)
    expect(buttons.some((b) => b.status === OrderStatus.SERVING)).toBe(true)
    expect(buttons.some((b) => b.type === 'danger')).toBe(true)
  })

  it('getStatusButtons 应该正确分配按钮类型', () => {
    const pendingButtons = getStatusButtons(OrderStatus.PENDING)
    expect(pendingButtons.some((b) => b.type === 'primary')).toBe(true)
    expect(pendingButtons.some((b) => b.type === 'danger')).toBe(true)

    const completedButtons = getStatusButtons(OrderStatus.COMPLETED)
    expect(completedButtons).toHaveLength(1)
    expect(completedButtons[0].type).toBe('success')

    const settledButtons = getStatusButtons(OrderStatus.SETTLED)
    expect(settledButtons).toHaveLength(0)
  })

  it('订单号应该以 O 开头并包含日期', () => {
    const orderNo = generateOrderNo()
    expect(orderNo.startsWith('O')).toBe(true)
    expect(orderNo.length).toBeGreaterThan(10)
  })

  it('订单号在 crypto 不可用时仍能生成', () => {
    const originalGetRandomValues = globalThis.crypto.getRandomValues
    // @ts-expect-error: test-only simulation of missing crypto API
    globalThis.crypto.getRandomValues = undefined
    const orderNo = generateOrderNo()
    expect(orderNo.startsWith('O')).toBe(true)
    expect(orderNo.length).toBeGreaterThan(10)
    globalThis.crypto.getRandomValues = originalGetRandomValues
  })

  it('transitionStatus 应该拒绝非法流转', async () => {
    const mockUpdate = async () => {}
    await expect(
      transitionStatus('123', OrderStatus.COMPLETED, OrderStatus.PENDING, mockUpdate),
    ).rejects.toThrow('非法状态流转')
  })

  it('transitionStatus 应该允许合法流转', async () => {
    const mockUpdate = async () => {}
    const result = await transitionStatus(
      '123',
      OrderStatus.PENDING,
      OrderStatus.COOKING,
      mockUpdate,
    )
    expect(result).toBe(true)
  })

  it('transitionStatus 应该透出更新异常', async () => {
    const mockUpdate = async () => { throw new Error('DB error') }
    await expect(
      transitionStatus('123', OrderStatus.PENDING, OrderStatus.COOKING, mockUpdate),
    ).rejects.toThrow('DB error')
  })

  it('SETTLED 和 CANCELLED 的后续状态应为空', () => {
    expect(getAllowedNextStatuses(OrderStatus.SETTLED)).toEqual([])
    expect(getAllowedNextStatuses(OrderStatus.CANCELLED)).toEqual([])
  })

  it('SERVING 只能流转到 DINING 和 CANCELLED', () => {
    expect(getAllowedNextStatuses(OrderStatus.SERVING)).toEqual([OrderStatus.DINING, OrderStatus.CANCELLED])
    expect(canTransition(OrderStatus.SERVING, OrderStatus.DINING)).toBe(true)
    expect(canTransition(OrderStatus.SERVING, OrderStatus.CANCELLED)).toBe(true)
    expect(canTransition(OrderStatus.SERVING, OrderStatus.COMPLETED)).toBe(false)
  })

  it('isActiveStatus 应该正确识别活跃状态', () => {
    expect(isActiveStatus(OrderStatus.PENDING)).toBe(true)
    expect(isActiveStatus(OrderStatus.COOKING)).toBe(true)
    expect(isActiveStatus(OrderStatus.SERVING)).toBe(true)
    expect(isActiveStatus(OrderStatus.DINING)).toBe(true)
    expect(isActiveStatus(OrderStatus.COMPLETED)).toBe(true)
    expect(isActiveStatus(OrderStatus.SETTLED)).toBe(false)
    expect(isActiveStatus(OrderStatus.CANCELLED)).toBe(false)
  })

  it('isTerminalStatus 应该正确识别终态', () => {
    expect(isTerminalStatus(OrderStatus.SETTLED)).toBe(true)
    expect(isTerminalStatus(OrderStatus.CANCELLED)).toBe(true)
    expect(isTerminalStatus(OrderStatus.PENDING)).toBe(false)
    expect(isTerminalStatus(OrderStatus.COOKING)).toBe(false)
    expect(isTerminalStatus(OrderStatus.SERVING)).toBe(false)
    expect(isTerminalStatus(OrderStatus.DINING)).toBe(false)
    expect(isTerminalStatus(OrderStatus.COMPLETED)).toBe(false)
  })

  describe('inferOrderStatusFromItems', () => {
    it('空数组应该返回 PENDING', () => {
      expect(inferOrderStatusFromItems([])).toBe(OrderStatus.PENDING)
    })

    it('undefined 应该返回 PENDING', () => {
      expect(inferOrderStatusFromItems(undefined as any)).toBe(OrderStatus.PENDING)
    })

    it('全部 served 应该返回 DINING', () => {
      const items = [{ status: 'served' }, { status: 'served' }]
      expect(inferOrderStatusFromItems(items)).toBe(OrderStatus.DINING)
    })

    it('全部 cooked 或 served 应该返回 SERVING', () => {
      const items = [{ status: 'cooked' }, { status: 'served' }]
      expect(inferOrderStatusFromItems(items)).toBe(OrderStatus.SERVING)
    })

    it('有 cooking 应该返回 COOKING', () => {
      const items = [{ status: 'pending' }, { status: 'cooking' }]
      expect(inferOrderStatusFromItems(items)).toBe(OrderStatus.COOKING)
    })

    it('全部 pending 应该返回 PENDING', () => {
      const items = [{ status: 'pending' }, { status: 'pending' }]
      expect(inferOrderStatusFromItems(items)).toBe(OrderStatus.PENDING)
    })

    it('无 status 字段应该视为 pending', () => {
      const items = [{}, {}]
      expect(inferOrderStatusFromItems(items)).toBe(OrderStatus.PENDING)
    })

    it('混合状态: cooked + pending 应返回 COOKING（anyCooking 优先）', () => {
      const items = [{ status: 'cooked' }, { status: 'cooking' }]
      expect(inferOrderStatusFromItems(items)).toBe(OrderStatus.COOKING)
    })
  })

  describe('calculateAmount', () => {
    it('应该正确计算订单金额', () => {
      const items = [{ price: 12, quantity: 2 }, { price: 28, quantity: 1 }]
      const result = calculateAmount(items, 0)
      expect(result.total).toBe(52)
      expect(result.discount).toBe(0)
      expect(result.final).toBe(52)
    })

    it('应该正确应用折扣', () => {
      const items = [{ price: 100, quantity: 1 }]
      const result = calculateAmount(items, 10)
      expect(result.total).toBe(100)
      expect(result.discount).toBe(10)
      expect(result.final).toBe(90)
    })

    it('折扣不应超过总金额', () => {
      const items = [{ price: 10, quantity: 1 }]
      const result = calculateAmount(items, 100)
      expect(result.final).toBe(0)
    })
  })
})
