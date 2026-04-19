/**
 * 订单状态管理
 * 智能点菜系统 - 状态流转逻辑 (v2.0)
 *
 * 状态定义：
 * pending   = 待制作 + 占用 + 未付
 * cooking   = 制作中 + 占用 + 未付
 * serving   = 上菜中 + 占用 + 未付
 * dining    = 上菜完 + 占用 + 未付 (客人用餐中/聊天，待结账)
 * completed = 上菜完 + 占用 + 已付 (已结账，客人还在)
 * settled   = 上菜完 + 空闲 + 已付 (已结账，客人已离店)
 * cancelled = 取消  + 空闲 + 无
 */

import { MoneyCalculator } from './security'

export const OrderStatus = {
  PENDING: 'pending',
  COOKING: 'cooking',
  SERVING: 'serving',
  DINING: 'dining',
  COMPLETED: 'completed',
  SETTLED: 'settled',
  CANCELLED: 'cancelled',
} as const

export type OrderStatusValue = (typeof OrderStatus)[keyof typeof OrderStatus]

export const StatusLabels: Record<OrderStatusValue, string> = {
  [OrderStatus.PENDING]: '待确认',
  [OrderStatus.COOKING]: '制作中',
  [OrderStatus.SERVING]: '上菜中',
  [OrderStatus.DINING]: '用餐中',
  [OrderStatus.COMPLETED]: '已结账',
  [OrderStatus.SETTLED]: '已清台',
  [OrderStatus.CANCELLED]: '已取消',
}

export const StatusColors: Record<OrderStatusValue, string> = {
  [OrderStatus.PENDING]: '#faad14',
  [OrderStatus.COOKING]: '#1890ff',
  [OrderStatus.SERVING]: '#722ed1',
  [OrderStatus.DINING]: '#f97316',
  [OrderStatus.COMPLETED]: '#52c41a',
  [OrderStatus.SETTLED]: '#059669',
  [OrderStatus.CANCELLED]: '#f5222d',
}

export const StatusFlow: Record<OrderStatusValue, OrderStatusValue[]> = {
  [OrderStatus.PENDING]: [OrderStatus.COOKING, OrderStatus.CANCELLED],
  [OrderStatus.COOKING]: [OrderStatus.SERVING, OrderStatus.CANCELLED],
  [OrderStatus.SERVING]: [OrderStatus.DINING, OrderStatus.CANCELLED],
  [OrderStatus.DINING]: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
  [OrderStatus.COMPLETED]: [OrderStatus.SETTLED],
  [OrderStatus.SETTLED]: [],
  [OrderStatus.CANCELLED]: [],
}

export const StatusBadgeClass: Record<OrderStatusValue, string> = {
  [OrderStatus.PENDING]: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  [OrderStatus.COOKING]: 'bg-blue-50 text-blue-700 ring-blue-700/20',
  [OrderStatus.SERVING]: 'bg-purple-50 text-purple-700 ring-purple-700/20',
  [OrderStatus.DINING]: 'bg-orange-50 text-orange-700 ring-orange-600/20',
  [OrderStatus.COMPLETED]: 'bg-green-50 text-green-700 ring-green-600/20',
  [OrderStatus.SETTLED]: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  [OrderStatus.CANCELLED]: 'bg-red-50 text-red-700 ring-red-600/20',
}

/**
 * 判断订单是否为活跃状态（占用桌台）
 */
export function isActiveStatus(status: OrderStatusValue): boolean {
  return (
    status === OrderStatus.PENDING ||
    status === OrderStatus.COOKING ||
    status === OrderStatus.SERVING ||
    status === OrderStatus.DINING ||
    status === OrderStatus.COMPLETED
  )
}

/**
 * 判断订单是否为终态（已结束）
 */
export function isTerminalStatus(status: OrderStatusValue): boolean {
  return status === OrderStatus.SETTLED || status === OrderStatus.CANCELLED
}

/**
 * 获取允许的下一个状态
 */
export function getAllowedNextStatuses(status: OrderStatusValue): OrderStatusValue[] {
  return StatusFlow[status] ?? []
}

/**
 * 检查状态流转是否合法
 */
export function canTransition(from: OrderStatusValue, to: OrderStatusValue): boolean {
  if (from === to) return false
  return getAllowedNextStatuses(from).includes(to)
}

/**
 * 执行状态流转
 */
export async function transitionStatus(
  orderId: string,
  fromStatus: OrderStatusValue,
  toStatus: OrderStatusValue,
  updateFn: (id: string, status: OrderStatusValue) => Promise<void>,
): Promise<boolean> {
  if (!canTransition(fromStatus, toStatus)) {
    throw new Error(`非法状态流转: ${fromStatus} -> ${toStatus}`)
  }
  await updateFn(orderId, toStatus)
  return true
}

/**
 * 根据菜品状态推断订单整体状态
 * 用于后端 Hook 和厨房大屏
 */
export function inferOrderStatusFromItems(
  items: Array<{ status?: string }>,
): OrderStatusValue {
  if (!items || items.length === 0) return OrderStatus.PENDING

  let allServed = true
  let allDone = true
  let anyCooking = false

  for (const item of items) {
    const st = item.status || 'pending'
    if (st !== 'served') allServed = false
    if (st !== 'cooked' && st !== 'served') allDone = false
    if (st === 'cooking') anyCooking = true
  }

  if (allServed) return OrderStatus.DINING
  if (allDone) return OrderStatus.SERVING
  if (anyCooking) return OrderStatus.COOKING
  return OrderStatus.PENDING
}

/**
 * 获取状态按钮配置
 */
export function getStatusButtons(status: OrderStatusValue): Array<{
  status: OrderStatusValue
  label: string
  type: 'default' | 'primary' | 'danger' | 'success'
}> {
  const nextStatuses = getAllowedNextStatuses(status)

  return nextStatuses.map((nextStatus) => {
    let type: 'default' | 'primary' | 'danger' | 'success' = 'default'
    if (nextStatus === OrderStatus.CANCELLED) {
      type = 'danger'
    } else if (nextStatus === OrderStatus.COMPLETED || nextStatus === OrderStatus.SETTLED) {
      type = 'success'
    } else {
      type = 'primary'
    }

    return {
      status: nextStatus,
      label: StatusLabels[nextStatus],
      type,
    }
  })
}

/**
 * 生成订单号
 * 使用毫秒时间戳 + crypto 随机数，避免碰撞
 */
export function generateOrderNo(): string {
  const date = new Date()
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '')
  const ms = String(date.getTime()).slice(-4)
  const randomArr = new Uint32Array(1)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(randomArr)
  } else {
    randomArr[0] = Math.floor(Math.random() * 0xFFFFFFFF)
  }
  const randVal = randomArr[0] ?? Math.floor(Math.random() * 0xFFFFFFFF)
  const random = String(randVal % 1000000).padStart(6, '0')
  return `O${dateStr}${ms}${random}`
}

/**
 * 计算订单金额（简化版）
 * 使用 MoneyCalculator 避免浮点精度问题
 */
export function calculateAmount(
  items: Array<{ price: number; quantity: number }>,
  discount = 0,
): { total: number; discount: number; final: number } {
  // 复用 MoneyCalculator 保证精度一致性
  const { total, discount: d, final } = MoneyCalculator.calculate(items, discount)
  return { total, discount: d, final }
}
