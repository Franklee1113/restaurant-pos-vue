/**
 * 订单状态机定义
 * 与前端 src/utils/orderStatus.ts 保持同步
 */

export const OrderStatus = {
  PENDING: 'pending',
  COOKING: 'cooking',
  SERVING: 'serving',
  COMPLETED: 'completed',
  SETTLED: 'settled',
  CANCELLED: 'cancelled',
} as const

export type OrderStatusValue = (typeof OrderStatus)[keyof typeof OrderStatus]

export const StatusFlow: Record<OrderStatusValue, OrderStatusValue[]> = {
  [OrderStatus.PENDING]: [OrderStatus.COOKING, OrderStatus.CANCELLED],
  [OrderStatus.COOKING]: [OrderStatus.SERVING, OrderStatus.CANCELLED],
  [OrderStatus.SERVING]: [OrderStatus.COMPLETED],
  [OrderStatus.COMPLETED]: [OrderStatus.SETTLED],
  [OrderStatus.SETTLED]: [],
  [OrderStatus.CANCELLED]: [],
}

export function canTransition(from: OrderStatusValue, to: OrderStatusValue): boolean {
  if (from === to) return false
  return StatusFlow[from].includes(to)
}

export function getAllowedNextStatuses(status: OrderStatusValue): OrderStatusValue[] {
  return StatusFlow[status] ?? []
}

/**
 * 生成订单号
 */
export function generateOrderNo(): string {
  const date = new Date()
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '')
  const ms = String(date.getTime()).slice(-4)
  const random = String(Math.floor(Math.random() * 1000000)).padStart(6, '0')
  return `O${dateStr}${ms}${random}`
}
