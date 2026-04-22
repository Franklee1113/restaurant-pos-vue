import { getPocketBase } from '../plugins/pocketbase'
import { NotFoundError } from '../utils/errors'
import { escapePbString, filterValidPbIds } from '../utils/pocketbase'

export interface DishRecord {
  id: string
  name: string
  price: number
  category: string
  description?: string
  soldOut?: boolean        // 新增
  soldOutNote?: string     // 新增
}

export class DishService {
  /**
   * 获取所有有效菜品
   */
  static async getAll(): Promise<DishRecord[]> {
    const pb = getPocketBase()
    const records = await pb.collection('dishes').getFullList({
      sort: 'category,name',
    })
    return records.map((r) => ({
      id: r.id,
      name: r.name,
      price: r.price,
      category: r.category,
      description: r.description,
      soldOut: r.soldOut || false,
      soldOutNote: r.soldOutNote || '',
    }))
  }

  /**
   * 根据 ID 批量获取菜品（用于校验）
   */
  static async getByIds(ids: string[]): Promise<DishRecord[]> {
    if (ids.length === 0) return []
    const validIds = filterValidPbIds(ids)
    if (validIds.length === 0) return []
    const pb = getPocketBase()
    const filter = validIds.map((id) => `id='${escapePbString(id)}'`).join(' || ')
    const records = await pb.collection('dishes').getFullList({ filter })
    return records.map((r) => ({
      id: r.id,
      name: r.name,
      price: r.price,
      category: r.category,
      description: r.description,
      soldOut: r.soldOut || false,
      soldOutNote: r.soldOutNote || '',
    }))
  }

  /**
   * 获取餐具单价
   */
  static async getCutleryUnitPrice(): Promise<number> {
    const pb = getPocketBase()
    try {
      const records = await pb.collection('dishes').getList(1, 1, {
        filter: "category='餐具'",
      })
      if (records.items.length > 0) {
        return records.items[0].price || 0
      }
    } catch {
      // 忽略错误，返回 0
    }
    return 0
  }

  /**
   * 校验菜品存在性和价格一致性
   * @throws NotFoundError 菜品不存在
   * @throws Error 价格被篡改
   */
  static async validateItems(items: Array<{ dishId: string; name: string; price: number }>): Promise<void> {
    const dishIds = items.map((i) => i.dishId)
    const dishes = await this.getByIds(dishIds)

    if (dishes.length !== dishIds.length) {
      throw new NotFoundError('部分菜品不存在或已下架')
    }

    for (const item of items) {
      const dish = dishes.find((d) => d.id === item.dishId)
      if (!dish) {
        throw new NotFoundError(`菜品不存在: ${item.name}`)
      }
      if (dish.price !== item.price) {
        throw new Error(`菜品 "${item.name}" 价格异常，请刷新后重试`)
      }
      if (dish.soldOut) {
        throw new Error(`菜品 "${item.name}" 已售罄，请刷新后重试`)
      }
    }
  }
}
