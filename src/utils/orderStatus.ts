/**
 * 订单状态管理
 * 智能点菜系统 - 状态流转逻辑
 */

import { MoneyCalculator } from './security'

export const OrderStatus = {
  PENDING: 'pending',
  COOKING: 'cooking',
  SERVING: 'serving',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const

export type OrderStatusValue = (typeof OrderStatus)[keyof typeof OrderStatus]

export const StatusLabels: Record<OrderStatusValue, string> = {
  [OrderStatus.PENDING]: '待确认',
  [OrderStatus.COOKING]: '制作中',
  [OrderStatus.SERVING]: '待上菜',
  [OrderStatus.COMPLETED]: '已完成',
  [OrderStatus.CANCELLED]: '已取消',
}

export const StatusColors: Record<OrderStatusValue, string> = {
  [OrderStatus.PENDING]: '#faad14',
  [OrderStatus.COOKING]: '#1890ff',
  [OrderStatus.SERVING]: '#722ed1',
  [OrderStatus.COMPLETED]: '#52c41a',
  [OrderStatus.CANCELLED]: '#f5222d',
}

export const StatusFlow: Record<OrderStatusValue, OrderStatusValue[]> = {
  [OrderStatus.PENDING]: [OrderStatus.COOKING, OrderStatus.CANCELLED],
  [OrderStatus.COOKING]: [OrderStatus.SERVING, OrderStatus.CANCELLED],
  [OrderStatus.SERVING]: [OrderStatus.COMPLETED],
  [OrderStatus.COMPLETED]: [],
  [OrderStatus.CANCELLED]: [],
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
    } else if (nextStatus === OrderStatus.COMPLETED) {
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
