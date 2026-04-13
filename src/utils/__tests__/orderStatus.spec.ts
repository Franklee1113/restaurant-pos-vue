import { describe, it, expect } from 'vitest'
import {
  OrderStatus,
  StatusLabels,
  canTransition,
  getAllowedNextStatuses,
  getStatusButtons,
  generateOrderNo,
  transitionStatus,
} from '../orderStatus'

describe('OrderStatus', () => {
  it('状态标签应该正确映射', () => {
    expect(StatusLabels[OrderStatus.PENDING]).toBe('待确认')
    expect(StatusLabels[OrderStatus.COMPLETED]).toBe('已完成')
  })

  it('应该允许合法的状态流转', () => {
    expect(canTransition(OrderStatus.PENDING, OrderStatus.COOKING)).toBe(true)
    expect(canTransition(OrderStatus.PENDING, OrderStatus.COMPLETED)).toBe(false)
    expect(canTransition(OrderStatus.COMPLETED, OrderStatus.PENDING)).toBe(false)
  })

  it('应该获取允许的下一个状态', () => {
    expect(getAllowedNextStatuses(OrderStatus.PENDING)).toEqual([
      OrderStatus.COOKING,
      OrderStatus.CANCELLED,
    ])
    expect(getAllowedNextStatuses(OrderStatus.COMPLETED)).toEqual([])
  })

  it('应该生成正确的状态按钮', () => {
    const buttons = getStatusButtons(OrderStatus.COOKING)
    expect(buttons).toHaveLength(2)
    expect(buttons.some((b) => b.status === OrderStatus.SERVING)).toBe(true)
    expect(buttons.some((b) => b.type === 'danger')).toBe(true)
  })

  it('订单号应该以 O 开头并包含日期', () => {
    const orderNo = generateOrderNo()
    expect(orderNo.startsWith('O')).toBe(true)
    expect(orderNo.length).toBeGreaterThan(10)
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
})
