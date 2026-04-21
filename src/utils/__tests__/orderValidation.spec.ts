import { describe, it, expect } from 'vitest'
import {
  recalculateAmount,
  detectItemsAppended,
  detectItemsRemoved,
  getRemovedItems,
  validateRemovedItems,
  inferOrderStatusWithGuard,
  buildSoldOutFilter,
  extractDishIds,
  validateAppendItems,
  validateItemStatusChange,
} from '../orderValidation'
import { OrderStatus } from '../orderStatus'

describe('orderValidation', () => {
  describe('recalculateAmount', () => {
    it('应正确计算无折扣订单金额', () => {
      const result = recalculateAmount(
        [{ price: 68, quantity: 1 }, { price: 28, quantity: 2 }],
        null,
        'amount',
        0,
      )
      expect(result.totalAmount).toBe(124)
      expect(result.discount).toBe(0)
      expect(result.finalAmount).toBe(124)
    })

    it('应正确计算含餐具费订单', () => {
      const result = recalculateAmount(
        [{ price: 128, quantity: 1 }],
        { type: 'charged', quantity: 4, unitPrice: 2 },
        'amount',
        0,
      )
      expect(result.totalAmount).toBe(136)
      expect(result.finalAmount).toBe(136)
    })

    it('应正确计算百分比折扣', () => {
      const result = recalculateAmount(
        [{ price: 100, quantity: 1 }],
        null,
        'percent',
        8,
      )
      expect(result.totalAmount).toBe(100)
      expect(result.discount).toBe(20)
      expect(result.finalAmount).toBe(80)
    })

    it('百分比折扣值超过10应不计折扣', () => {
      const result = recalculateAmount(
        [{ price: 100, quantity: 1 }],
        null,
        'percent',
        15,
      )
      expect(result.discount).toBe(0)
      expect(result.finalAmount).toBe(100)
    })

    it('折扣不应超过订单总额', () => {
      const result = recalculateAmount(
        [{ price: 10, quantity: 1 }],
        null,
        'amount',
        100,
      )
      expect(result.discount).toBe(10)
      expect(result.finalAmount).toBe(0)
    })

    it('金额精度应正确（分计算）', () => {
      const result = recalculateAmount(
        [{ price: 0.01, quantity: 1 }, { price: 0.02, quantity: 1 }],
        null,
        'amount',
        0,
      )
      expect(result.totalAmount).toBe(0.03)
    })

    it('免餐具费不应计入总额', () => {
      const result = recalculateAmount(
        [{ price: 100, quantity: 1 }],
        { type: 'free', quantity: 4, unitPrice: 2 },
        'amount',
        0,
      )
      expect(result.totalAmount).toBe(100)
    })
  })

  describe('detectItemsAppended', () => {
    it('新菜品长度增加应判定为追加', () => {
      const oldItems = [{ dishId: 'd1', name: 'A', quantity: 1 }]
      const newItems = [
        { dishId: 'd1', name: 'A', quantity: 1 },
        { dishId: 'd2', name: 'B', quantity: 1 },
      ]
      expect(detectItemsAppended(oldItems, newItems)).toBe(true)
    })

    it('相同长度但dishId不同应判定为追加', () => {
      const oldItems = [{ dishId: 'd1', name: 'A', quantity: 1 }]
      const newItems = [{ dishId: 'd2', name: 'B', quantity: 1 }]
      expect(detectItemsAppended(oldItems, newItems)).toBe(true)
    })

    it('相同长度但quantity不同应判定为追加', () => {
      const oldItems = [{ dishId: 'd1', name: 'A', quantity: 1 }]
      const newItems = [{ dishId: 'd1', name: 'A', quantity: 2 }]
      expect(detectItemsAppended(oldItems, newItems)).toBe(true)
    })

    it('完全相同的菜品列表不应判定为追加', () => {
      const items = [{ dishId: 'd1', name: 'A', quantity: 1 }]
      expect(detectItemsAppended(items, [...items])).toBe(false)
    })

    it('新菜品减少不应判定为追加', () => {
      const oldItems = [
        { dishId: 'd1', name: 'A', quantity: 1 },
        { dishId: 'd2', name: 'B', quantity: 1 },
      ]
      const newItems = [{ dishId: 'd1', name: 'A', quantity: 1 }]
      expect(detectItemsAppended(oldItems, newItems)).toBe(false)
    })
  })

  describe('detectItemsRemoved / getRemovedItems', () => {
    it('应检测到菜品被删除', () => {
      const oldItems = [
        { dishId: 'd1', name: 'A', quantity: 1 },
        { dishId: 'd2', name: 'B', quantity: 1 },
      ]
      const newItems = [{ dishId: 'd1', name: 'A', quantity: 1 }]
      expect(detectItemsRemoved(oldItems, newItems)).toBe(true)
      const removed = getRemovedItems(oldItems, newItems)
      expect(removed.length).toBe(1)
      expect(removed[0].dishId).toBe('d2')
    })

    it('仅减少数量不应判定为删除（dishId还在）', () => {
      const oldItems = [{ dishId: 'd1', name: 'A', quantity: 2 }]
      const newItems = [{ dishId: 'd1', name: 'A', quantity: 1 }]
      expect(detectItemsRemoved(oldItems, newItems)).toBe(false)
      expect(getRemovedItems(oldItems, newItems).length).toBe(0)
    })

    it('无删除时应返回空数组', () => {
      const items = [{ dishId: 'd1', name: 'A', quantity: 1 }]
      expect(detectItemsRemoved(items, [...items])).toBe(false)
      expect(getRemovedItems(items, [...items]).length).toBe(0)
    })
  })

  describe('validateRemovedItems', () => {
    it('删除pending菜品应通过', () => {
      const removed = [{ dishId: 'd1', name: 'A', status: 'pending' }]
      expect(validateRemovedItems(removed)).toBe('')
    })

    it('删除cooking菜品应阻断', () => {
      const removed = [{ dishId: 'd1', name: 'A', status: 'cooking' }]
      expect(validateRemovedItems(removed)).toContain('不可直接删除')
    })

    it('删除served菜品应阻断', () => {
      const removed = [{ dishId: 'd1', name: 'A', status: 'served' }]
      expect(validateRemovedItems(removed)).toContain('不可直接删除')
    })

    it('删除cooked菜品应阻断', () => {
      const removed = [{ dishId: 'd1', name: 'A', status: 'cooked' }]
      expect(validateRemovedItems(removed)).toContain('不可直接删除')
    })

    it('混合列表中有任一cooking/served/cooked应阻断', () => {
      const removed = [
        { dishId: 'd1', name: 'A', status: 'pending' },
        { dishId: 'd2', name: 'B', status: 'cooking' },
      ]
      expect(validateRemovedItems(removed)).toContain('不可直接删除')
    })
  })

  describe('inferOrderStatusWithGuard', () => {
    it('全部served从serving推断为dining', () => {
      const result = inferOrderStatusWithGuard(
        [{ status: 'served' }, { status: 'served' }],
        OrderStatus.SERVING,
      )
      expect(result.status).toBe(OrderStatus.DINING)
      expect(result.changed).toBe(true)
    })

    it('全部cooked/served从cooking推断为serving', () => {
      const result = inferOrderStatusWithGuard(
        [{ status: 'cooked' }, { status: 'served' }],
        OrderStatus.COOKING,
      )
      expect(result.status).toBe(OrderStatus.SERVING)
      expect(result.changed).toBe(true)
    })

    it('有cooking应推断为cooking', () => {
      const result = inferOrderStatusWithGuard(
        [{ status: 'pending' }, { status: 'cooking' }],
        OrderStatus.PENDING,
      )
      expect(result.status).toBe(OrderStatus.COOKING)
      expect(result.changed).toBe(true)
    })

    it('状态未变化时应返回原状态', () => {
      const result = inferOrderStatusWithGuard(
        [{ status: 'cooking' }, { status: 'cooking' }],
        OrderStatus.COOKING,
      )
      expect(result.status).toBe(OrderStatus.COOKING)
      expect(result.changed).toBe(false)
    })

    it('不允许状态回退（serving -> cooking）', () => {
      const result = inferOrderStatusWithGuard(
        [{ status: 'cooking' }, { status: 'pending' }],
        OrderStatus.SERVING,
      )
      expect(result.status).toBe(OrderStatus.SERVING)
      expect(result.changed).toBe(false)
      expect(result.error).toBeUndefined()
    })

    it('非法流转应返回错误（pending -> dining）', () => {
      const result = inferOrderStatusWithGuard(
        [{ status: 'served' }, { status: 'served' }],
        OrderStatus.PENDING,
      )
      expect(result.status).toBe(OrderStatus.PENDING)
      expect(result.changed).toBe(false)
      expect(result.error).toContain('非法状态流转')
    })

    it('completed 只能流转到 settled', () => {
      const result = inferOrderStatusWithGuard(
        [{ status: 'served' }],
        OrderStatus.COMPLETED,
      )
      expect(result.status).toBe(OrderStatus.COMPLETED)
      expect(result.changed).toBe(false)
    })

    it('空items应推断为pending', () => {
      const result = inferOrderStatusWithGuard([], OrderStatus.PENDING)
      expect(result.status).toBe(OrderStatus.PENDING)
    })
  })

  describe('buildSoldOutFilter', () => {
    it('应构建正确的PB filter', () => {
      const result = buildSoldOutFilter(['d1', 'd2', 'd3'])
      expect(result).not.toBeNull()
      expect(result!.filter).toBe("id in ({:id0},{:id1},{:id2}) && soldOut = true")
      expect(result!.params).toEqual({ id0: 'd1', id1: 'd2', id2: 'd3' })
    })

    it('空数组应返回null', () => {
      expect(buildSoldOutFilter([])).toBeNull()
    })

    it('单id应正确构建', () => {
      const result = buildSoldOutFilter(['d1'])
      expect(result!.filter).toBe("id in ({:id0}) && soldOut = true")
      expect(result!.params).toEqual({ id0: 'd1' })
    })
  })

  describe('extractDishIds', () => {
    it('应提取唯一dishId', () => {
      const items = [{ dishId: 'd1' }, { dishId: 'd2' }, { dishId: 'd1' }]
      expect(extractDishIds(items)).toEqual(['d1', 'd2'])
    })

    it('空数组应返回空数组', () => {
      expect(extractDishIds([])).toEqual([])
    })
  })

  describe('validateAppendItems', () => {
    it('pending订单应允许追加', () => {
      expect(validateAppendItems(OrderStatus.PENDING)).toBe('')
    })

    it('cancelled订单应阻断追加', () => {
      expect(validateAppendItems(OrderStatus.CANCELLED)).toContain('已取消')
    })

    it('completed订单应阻断追加', () => {
      expect(validateAppendItems(OrderStatus.COMPLETED)).toContain('已结束')
    })

    it('settled订单应阻断追加', () => {
      expect(validateAppendItems(OrderStatus.SETTLED)).toContain('已结束')
    })
  })

  describe('validateItemStatusChange', () => {
    it('pending订单应允许修改菜品状态', () => {
      expect(validateItemStatusChange(OrderStatus.PENDING)).toBe('')
    })

    it('completed订单应阻断修改菜品状态', () => {
      expect(validateItemStatusChange(OrderStatus.COMPLETED)).toContain('已结束')
    })

    it('settled订单应阻断修改菜品状态', () => {
      expect(validateItemStatusChange(OrderStatus.SETTLED)).toContain('已结束')
    })

    it('cancelled订单应阻断修改菜品状态', () => {
      expect(validateItemStatusChange(OrderStatus.CANCELLED)).toContain('已结束')
    })
  })
})
