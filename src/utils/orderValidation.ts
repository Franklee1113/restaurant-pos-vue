/**
 * 订单校验纯函数集
 * 从 pb_hooks/orders.pb.js 提取核心业务逻辑，供前后端复用与测试
 */

import { OrderStatus, type OrderStatusValue, inferOrderStatusFromItems } from './orderStatus'

export interface ValidationItem {
  dishId: string
  name: string
  price?: number
  quantity?: number
  status?: string
  remark?: string
}

export interface AmountInput {
  price: number
  quantity: number
}

export interface CutleryInput {
  type: 'charged' | 'free'
  quantity: number
  unitPrice: number
}

export interface AmountResult {
  totalAmount: number
  discount: number
  finalAmount: number
}

const STATUS_PRIORITY: Record<string, number> = {
  pending: 0,
  cooking: 1,
  serving: 2,
  dining: 3,
  completed: 4,
  settled: 5,
  cancelled: -1,
}

/**
 * 重算订单金额（分计算，避免浮点误差）
 * 与 pb_hooks/orders.pb.js 中的金额计算逻辑保持一致
 */
export function recalculateAmount(
  items: AmountInput[],
  cutlery: CutleryInput | null,
  discountType: 'amount' | 'percent',
  discountValue: number,
): AmountResult {
  let totalCents = 0
  for (const item of items) {
    totalCents += Math.round((item.price || 0) * 100 * (item.quantity || 0))
  }

  if (cutlery && cutlery.type === 'charged' && cutlery.quantity > 0) {
    totalCents += Math.round(cutlery.quantity * cutlery.unitPrice * 100)
  }

  let discountCents = 0
  if (discountType === 'percent') {
    if (discountValue > 0 && discountValue <= 10) {
      discountCents = totalCents - Math.round(totalCents * (discountValue / 10))
    }
  } else {
    discountCents = Math.round((discountValue || 0) * 100)
  }

  discountCents = Math.min(discountCents, totalCents)
  const finalCents = Math.max(0, totalCents - discountCents)

  return {
    totalAmount: totalCents / 100,
    discount: discountCents / 100,
    finalAmount: finalCents / 100,
  }
}

/**
 * 检测是否有新菜品追加
 */
export function detectItemsAppended(oldItems: ValidationItem[], newItems: ValidationItem[]): boolean {
  if (newItems.length > oldItems.length) return true
  if (newItems.length === oldItems.length) {
    for (let i = 0; i < newItems.length; i++) {
      if (newItems[i].dishId !== oldItems[i].dishId || newItems[i].quantity !== oldItems[i].quantity) {
        return true
      }
    }
  }
  return false
}

/**
 * 检测是否有菜品被删除
 */
export function detectItemsRemoved(oldItems: ValidationItem[], newItems: ValidationItem[]): boolean {
  if (oldItems.length > newItems.length) return true
  return oldItems.some((oldItem) => !newItems.find((ni) => ni.dishId === oldItem.dishId))
}

/**
 * 获取被删除的菜品列表
 */
export function getRemovedItems(oldItems: ValidationItem[], newItems: ValidationItem[]): ValidationItem[] {
  return oldItems.filter((oi) => !newItems.find((ni) => ni.dishId === oi.dishId))
}

/**
 * 校验被删除的菜品是否包含已制作/已上菜的项
 */
export function validateRemovedItems(removedItems: ValidationItem[]): string {
  const hasCookingOrServed = removedItems.some(
    (item) => item.status === 'cooking' || item.status === 'cooked' || item.status === 'served',
  )
  if (hasCookingOrServed) {
    return '已制作/已上菜的菜品不可直接删除，如需退菜请联系管理员'
  }
  return ''
}

/**
 * 推断订单状态并做保护性检查
 */
export function inferOrderStatusWithGuard(
  items: Array<{ status?: string }>,
  oldStatus: OrderStatusValue,
): { status: OrderStatusValue; changed: boolean; error?: string } {
  const inferred = inferOrderStatusFromItems(items)

  if (oldStatus === inferred) {
    return { status: oldStatus, changed: false }
  }

  const oldPriority = STATUS_PRIORITY[oldStatus] ?? -99
  const newPriority = STATUS_PRIORITY[inferred] ?? -99
  if (newPriority < oldPriority) {
    return { status: oldStatus, changed: false }
  }

  const flow: Record<string, OrderStatusValue[]> = {
    pending: [OrderStatus.COOKING, OrderStatus.CANCELLED],
    cooking: [OrderStatus.SERVING, OrderStatus.CANCELLED],
    serving: [OrderStatus.DINING, OrderStatus.CANCELLED],
    dining: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
    completed: [OrderStatus.SETTLED],
    settled: [],
    cancelled: [],
  }

  const allowed = flow[oldStatus] ?? []
  if (!allowed.includes(inferred)) {
    return {
      status: oldStatus,
      changed: false,
      error: `非法状态流转: ${oldStatus} -> ${inferred}`,
    }
  }

  return { status: inferred, changed: true }
}

/**
 * 构建 PocketBase IN 查询 filter 用于校验 soldOut
 */
export function buildSoldOutFilter(dishIds: string[]): { filter: string; params: Record<string, string> } | null {
  if (!dishIds || dishIds.length === 0) return null
  const placeholders = dishIds.map((_, idx) => `{:id${idx}}`).join(',')
  const filter = `id in (${placeholders}) && soldOut = true`
  const params: Record<string, string> = {}
  for (let i = 0; i < dishIds.length; i++) {
    params[`id${i}`] = dishIds[i]
  }
  return { filter, params }
}

/**
 * 从 items 中提取唯一 dishId 列表
 */
export function extractDishIds(items: Array<{ dishId: string }>): string[] {
  const set = new Set<string>()
  for (const item of items) {
    set.add(item.dishId)
  }
  return Array.from(set)
}

/**
 * 校验追加菜品是否被允许
 */
export function validateAppendItems(oldStatus: OrderStatusValue): string {
  if (oldStatus === OrderStatus.CANCELLED) {
    return '订单已取消，不能追加菜品'
  }
  if (oldStatus === OrderStatus.COMPLETED || oldStatus === OrderStatus.SETTLED) {
    return '订单已结束，不能追加菜品'
  }
  return ''
}

/**
 * 校验是否能修改菜品状态
 */
export function validateItemStatusChange(oldStatus: OrderStatusValue): string {
  if (oldStatus === OrderStatus.COMPLETED || oldStatus === OrderStatus.SETTLED || oldStatus === OrderStatus.CANCELLED) {
    return '订单已结束，不能修改菜品状态'
  }
  return ''
}
