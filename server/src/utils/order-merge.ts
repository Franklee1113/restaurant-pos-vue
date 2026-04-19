/**
 * 订单菜品合并工具
 * 与前端 mergeOrderItems 保持逻辑一致
 */

export interface OrderItem {
  dishId: string
  name: string
  price: number
  quantity: number
  remark?: string
  status?: 'pending' | 'cooking' | 'cooked' | 'served'
}

export function mergeOrderItems(existingItems: OrderItem[], newItems: OrderItem[]): OrderItem[] {
  const merged = [...existingItems]
  for (const item of newItems) {
    const existing = merged.find((i) => i.dishId === item.dishId)
    if (existing) {
      existing.quantity = Math.round((existing.quantity + item.quantity) * 10) / 10
      if (item.remark) existing.remark = item.remark
      // 追加的菜品需要重新制作，状态重置为 pending
      if (existing.status && existing.status !== 'pending') {
        existing.status = 'pending'
      }
    } else {
      merged.push({ ...item })
    }
  }
  return merged
}
