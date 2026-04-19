import { getPocketBase } from '../plugins/pocketbase'
import { DishService } from './dish.service'
import { TableStatusService } from './table-status.service'
import { TokenService } from './token.service'
import { MoneyCalculator } from '../utils/money'
import { mergeOrderItems } from '../utils/order-merge'
import { generateOrderNo } from '../utils/order-status'
import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from '../utils/errors'

export interface OrderItem {
  dishId: string
  name: string
  price: number
  quantity: number
  remark?: string
  status?: 'pending' | 'cooking' | 'cooked' | 'served'
}

export interface CutleryInfo {
  type: 'free' | 'charged'
  quantity: number
  unitPrice?: number
  totalPrice?: number
}

export interface CreateOrderInput {
  tableNo: string
  guests: number
  items: OrderItem[]
  cutlery?: CutleryInfo | null
  customerPhone?: string
}

export interface OrderResult {
  id: string
  orderNo: string
  accessToken: string
  tableNo: string
  guests: number
  items: OrderItem[]
  status: string
  totalAmount: number
  finalAmount: number
  cutlery?: CutleryInfo | null
  created: string
}

export class OrderService {
  /**
   * 创建新订单
   */
  static async create(input: CreateOrderInput): Promise<OrderResult> {
    const pb = getPocketBase()

    // 1. 基础校验
    if (!input.items || input.items.length === 0) {
      throw new ValidationError('订单不能为空')
    }
    if (!input.tableNo) {
      throw new ValidationError('桌号不能为空')
    }

    // 2. 校验桌台是否可用
    const isAvailable = await TableStatusService.isTableAvailable(input.tableNo)
    if (!isAvailable) {
      throw new ConflictError('该桌台已被占用，无法创建新订单')
    }

    // 3. 校验菜品存在性和价格
    await DishService.validateItems(input.items)

    // 4. 计算餐具费
    let cutlery: CutleryInfo | null = input.cutlery ?? null
    let cutleryTotalPrice = 0
    if (cutlery && cutlery.type === 'charged' && cutlery.quantity > 0) {
      const unitPrice = await DishService.getCutleryUnitPrice()
      cutleryTotalPrice = Math.round(cutlery.quantity * unitPrice * 100) / 100
      cutlery = {
        ...cutlery,
        unitPrice,
        totalPrice: cutleryTotalPrice,
      }
    } else if (cutlery) {
      cutlery = {
        ...cutlery,
        unitPrice: 0,
        totalPrice: 0,
      }
    }

    // 5. 计算订单金额
    const { total, final } = MoneyCalculator.calculate(input.items)
    const totalWithCutlery = total + cutleryTotalPrice
    const finalWithCutlery = final + cutleryTotalPrice

    // 6. 生成访问令牌
    const accessToken = TokenService.generate()

    // 7. 创建订单
    const order = await pb.collection('orders').create({
      orderNo: generateOrderNo(),
      tableNo: input.tableNo,
      guests: input.guests || 1,
      items: input.items,
      status: 'pending',
      totalAmount: totalWithCutlery,
      finalAmount: finalWithCutlery,
      cutlery: cutlery,
      accessToken,
      source: 'customer',
      customerPhone: input.customerPhone || '',
    })

    // 8. 同步 table_status（开台）
    await TableStatusService.setDining(input.tableNo, order.id)

    return this.toOrderResult(order)
  }

  /**
   * 根据 ID 和 Token 获取订单
   */
  static async getById(id: string, accessToken: string): Promise<OrderResult> {
    const pb = getPocketBase()

    if (!accessToken) {
      throw new ForbiddenError('缺少访问令牌')
    }

    try {
      const order = await pb.collection('orders').getOne(id)

      if (order.accessToken !== accessToken) {
        throw new ForbiddenError('访问令牌无效')
      }

      return this.toOrderResult(order)
    } catch (err: any) {
      if (err.status === 404) {
        throw new NotFoundError('订单不存在')
      }
      throw err
    }
  }

  /**
   * 根据桌号获取当前未完成订单
   * 注意：此方法不返回 accessToken（用于页面初始化时检查桌台状态）
   */
  static async getByTableNo(tableNo: string): Promise<OrderResult | null> {
    const pb = getPocketBase()

    try {
      const records = await pb.collection('orders').getList(1, 1, {
        filter: `tableNo='${tableNo}' && status!='completed' && status!='cancelled' && status!='settled'`,
        sort: '-created',
      })

      if (records.items.length === 0) return null

      return this.toOrderResult(records.items[0])
    } catch {
      return null
    }
  }

  /**
   * 追加菜品
   */
  static async appendItems(
    id: string,
    accessToken: string,
    newItems: OrderItem[],
  ): Promise<OrderResult> {
    const pb = getPocketBase()

    if (!accessToken) {
      throw new ForbiddenError('缺少访问令牌')
    }

    if (!newItems || newItems.length === 0) {
      throw new ValidationError('追加的菜品不能为空')
    }

    // 1. 验证订单和令牌
    const order = await pb.collection('orders').getOne(id)
    if (order.accessToken !== accessToken) {
      throw new ForbiddenError('访问令牌无效')
    }

    // 2. 校验订单状态
    const status: string = order.status
    if (['completed', 'cancelled', 'settled'].includes(status)) {
      throw new ConflictError('订单已结束，不能追加菜品')
    }

    // 3. 校验新菜品
    await DishService.validateItems(newItems)

    // 4. 合并菜品
    const existingItems: OrderItem[] = Array.isArray(order.items) ? order.items : []
    const mergedItems = mergeOrderItems(existingItems, newItems)

    // 5. 重算金额
    const { total, final } = MoneyCalculator.calculate(mergedItems)

    // 6. 计算餐具费（保留原有）
    let cutleryTotalPrice = 0
    const existingCutlery: CutleryInfo | null = order.cutlery || null
    if (existingCutlery && existingCutlery.totalPrice) {
      cutleryTotalPrice = existingCutlery.totalPrice
    }

    // 7. 构建更新数据
    const updates: any = {
      items: mergedItems,
      totalAmount: total + cutleryTotalPrice,
      finalAmount: final + cutleryTotalPrice,
    }

    // 8. 如果原状态为 completed/serving，重置为 pending（重新开台逻辑）
    if (['completed', 'serving'].includes(status)) {
      updates.status = 'pending'
      await TableStatusService.setDining(order.tableNo, order.id)
    }

    // 9. 更新订单
    const updated = await pb.collection('orders').update(id, updates)

    return this.toOrderResult(updated)
  }

  /**
   * 转换 PocketBase 记录为 OrderResult（排除敏感字段）
   */
  private static toOrderResult(record: any): OrderResult {
    return {
      id: record.id,
      orderNo: record.orderNo,
      accessToken: record.accessToken,
      tableNo: record.tableNo,
      guests: record.guests,
      items: Array.isArray(record.items) ? record.items : [],
      status: record.status,
      totalAmount: record.totalAmount,
      finalAmount: record.finalAmount,
      cutlery: record.cutlery || null,
      created: record.created,
    }
  }
}
