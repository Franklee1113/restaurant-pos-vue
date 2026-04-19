import { getPocketBase } from '../plugins/pocketbase'

export interface TableStatusRecord {
  id: string
  tableNo: string
  status: 'idle' | 'dining' | 'pending_clear'
  currentOrderId?: string
  openedAt?: string
}

export class TableStatusService {
  /**
   * 根据桌号获取桌台状态
   */
  static async getByTableNo(tableNo: string): Promise<TableStatusRecord | null> {
    const pb = getPocketBase()
    try {
      const records = await pb.collection('table_status').getList(1, 1, {
        filter: `tableNo='${tableNo}'`,
      })
      if (records.items.length === 0) return null
      const r = records.items[0]
      return {
        id: r.id,
        tableNo: r.tableNo,
        status: r.status,
        currentOrderId: r.currentOrderId,
        openedAt: r.openedAt,
      }
    } catch {
      return null
    }
  }

  /**
   * 设置桌台为 dining 状态（开台）
   */
  static async setDining(tableNo: string, orderId: string): Promise<void> {
    const pb = getPocketBase()
    const existing = await this.getByTableNo(tableNo)

    if (existing) {
      await pb.collection('table_status').update(existing.id, {
        status: 'dining',
        currentOrderId: orderId,
        openedAt: new Date().toISOString(),
      })
    } else {
      await pb.collection('table_status').create({
        tableNo,
        status: 'dining',
        currentOrderId: orderId,
        openedAt: new Date().toISOString(),
      })
    }
  }

  /**
   * 设置桌台为 idle 状态（清台）
   */
  static async setIdle(tableNo: string, expectedOrderId: string): Promise<void> {
    const pb = getPocketBase()
    const existing = await this.getByTableNo(tableNo)

    if (existing && existing.currentOrderId === expectedOrderId) {
      await pb.collection('table_status').update(existing.id, {
        status: 'idle',
        currentOrderId: '',
      })
    }
  }

  /**
   * 检查桌台是否可用
   */
  static async isTableAvailable(tableNo: string): Promise<boolean> {
    const ts = await this.getByTableNo(tableNo)
    if (!ts) return true
    return ts.status === 'idle'
  }
}
