/**
 * 金额计算工具
 * 与前端 MoneyCalculator 保持逻辑一致
 * 使用整数分计算，避免浮点精度问题
 */

export interface MoneyItem {
  price: number
  quantity: number
}

export interface MoneyResult {
  total: number
  discount: number
  final: number
}

export class MoneyCalculator {
  /**
   * 元 → 分
   */
  static toCents(yuan: number): number {
    return Math.round(yuan * 100)
  }

  /**
   * 分 → 元
   */
  static toYuan(cents: number): number {
    return cents / 100
  }

  /**
   * 计算订单金额
   * @param items 菜品列表
   * @param discount 折扣金额（元）
   */
  static calculate(items: MoneyItem[], discount: number = 0): MoneyResult {
    let totalCents = 0
    for (const item of items) {
      const priceCents = this.toCents(item.price)
      totalCents += priceCents * item.quantity
    }

    const discountCents = Math.min(this.toCents(discount), totalCents)
    const finalCents = Math.max(0, totalCents - discountCents)

    return {
      total: this.toYuan(totalCents),
      discount: this.toYuan(discountCents),
      final: this.toYuan(finalCents),
    }
  }

  /**
   * 计算含折扣类型的金额
   * @param items 菜品列表
   * @param discountValue 折扣值
   * @param discountType 'amount' | 'percent'
   */
  static calculateWithDiscount(
    items: MoneyItem[],
    discountValue: number = 0,
    discountType: 'amount' | 'percent' = 'amount',
  ): MoneyResult {
    let totalCents = 0
    for (const item of items) {
      const priceCents = this.toCents(item.price)
      totalCents += priceCents * item.quantity
    }

    let discountCents = 0
    if (discountType === 'percent') {
      if (discountValue > 0 && discountValue <= 10) {
        discountCents = totalCents - Math.round(totalCents * (discountValue / 10))
      }
    } else {
      discountCents = this.toCents(discountValue)
    }

    discountCents = Math.min(discountCents, totalCents)
    const finalCents = Math.max(0, totalCents - discountCents)

    return {
      total: this.toYuan(totalCents),
      discount: this.toYuan(discountCents),
      final: this.toYuan(finalCents),
    }
  }
}
