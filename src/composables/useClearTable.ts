/**
 * 清台逻辑 composable
 * P1-20: 提取 OrderListView 与 OrderDetailView 中重复的清台前置检查逻辑
 */

import { ref } from 'vue'
import { TableStatusAPI, PublicOrderAPI, OrderAPI } from '@/api/pocketbase'
import { OrderStatus } from '@/utils/orderStatus'
import type { TableStatus } from '@/api/pocketbase'

export interface ClearTableCheckResult {
  canClear: boolean
  reason?: string
  tableStatus?: TableStatus
}

export function useClearTable() {
  const processing = ref(false)

  /**
   * 清台前置检查（与后端 Hook 清台规则保持一致）
   * 1. 桌台是否已 idle → 阻断
   * 2. 该桌是否有未完成订单 → 阻断
   * 3. 当前绑定订单是否为 COMPLETED（上菜完成未结账）→ 阻断
   */
  async function checkCanClearTable(tableNo: string): Promise<ClearTableCheckResult> {
    const ts = await TableStatusAPI.getTableStatus(tableNo)

    // ① 已经是空闲状态
    if (ts?.status === 'idle') {
      return { canClear: false, reason: 'idle', tableStatus: ts }
    }

    // ② 有未完成订单
    const unfinishedOrders = await PublicOrderAPI.getOrdersByTable(tableNo)
    if (unfinishedOrders.length > 0) {
      const uo = unfinishedOrders[0]!
      return {
        canClear: false,
        reason: 'unfinished',
        tableStatus: ts || undefined,
      }
    }

    // ③ 当前绑定订单为 COMPLETED（上菜完成但未结账）
    if (ts?.currentOrderId) {
      try {
        const currentOrder = await OrderAPI.getOrder(ts.currentOrderId)
        if (currentOrder.status === OrderStatus.COMPLETED) {
          return {
            canClear: false,
            reason: 'completed',
            tableStatus: ts,
          }
        }
      } catch {
        // 订单获取失败，继续允许清台（兜底）
      }
    }

    return { canClear: true, tableStatus: ts || undefined }
  }

  async function executeClearTable(tableStatus: TableStatus | undefined): Promise<void> {
    if (tableStatus?.id) {
      await TableStatusAPI.updateTableStatus(tableStatus.id, {
        status: 'idle',
        currentOrderId: '',
      })
    }
  }

  return {
    processing,
    checkCanClearTable,
    executeClearTable,
  }
}
