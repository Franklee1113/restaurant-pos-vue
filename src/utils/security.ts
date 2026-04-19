/**
 * 安全工具库
 * 修复 XSS 漏洞，提供安全的 DOM 操作
 */

/**
 * HTML 转义函数
 * 将特殊字符转换为 HTML 实体，防止 XSS 攻击
 * @param text - 原始文本
 * @returns - 转义后的文本
 */
export function escapeHtml(text: unknown): string {
  if (text === null || text === undefined) {
    return ''
  }
  const str = String(text)
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

/**
 * 安全的设置 innerHTML
 * 仅用于受信任的 HTML 模板，不用于用户输入
 * 对用户输入内容统一先做 HTML 转义，再写入
 * @param element - DOM 元素
 * @param html - HTML 字符串（必须是可信的）
 */
export function setSafeHtml(element: HTMLElement, html: string): void {
  if (!element) return
  // 防御 XSS：拒绝任何包含属性的 HTML 标签（防止 onclick、onerror、style 等注入）
  const hasAttributes = /<[a-z][^\s>/]*\s[^>]*>/i
  if (hasAttributes.test(html)) {
    console.warn('setSafeHtml: 检测到包含属性的 HTML，已降级为纯文本输出。')
    element.textContent = html
    return
  }
  // 只允许纯标签名（无属性）的白名单标签
  const hasUnescapedTags = /<(?!\s*\/?\s*(br|p|div|span|b|i|u|strong|em|h[1-6]|ul|ol|li|table|tr|td|th|thead|tbody|tfoot|colgroup|col|hr)\s*\/?\s*>)/i
  if (hasUnescapedTags.test(html)) {
    console.warn('setSafeHtml: 检测到未转义的用户输入标签，已阻止插入。')
    element.textContent = html
    return
  }
  element.innerHTML = html
}

/**
 * 创建安全的文本节点
 * @param text - 文本内容
 * @returns - 文本节点
 */
export function createSafeText(text: unknown): Text {
  return document.createTextNode(text?.toString() ?? '')
}

/**
 * 安全的设置 textContent
 * @param element - DOM 元素
 * @param text - 文本内容
 */
export function setSafeText(element: HTMLElement, text: unknown): void {
  if (!element) return
  element.textContent = text?.toString() ?? ''
}

/**
 * 安全的设置属性
 * 防止属性注入攻击
 * @param element - DOM 元素
 * @param name - 属性名
 * @param value - 属性值
 */
export function setSafeAttribute(
  element: HTMLElement,
  name: string,
  value: unknown,
): void {
  if (!element || !name) return

  const dangerousAttrs = /^on|^style$/i
  if (dangerousAttrs.test(name)) {
    console.warn(`拒绝设置危险属性: ${name}`)
    return
  }

  const urlAttrs = ['href', 'src', 'action']
  if (urlAttrs.includes(name.toLowerCase())) {
    const lowerValue = String(value).toLowerCase().trim()
    if (lowerValue.startsWith('javascript:') || lowerValue.startsWith('data:')) {
      console.warn(`拒绝设置危险 URL: ${value}`)
      return
    }
  }

  element.setAttribute(name, String(value ?? ''))
}

/**
 * 金额计算（避免浮点精度问题）
 * 使用整数分进行计算
 */
export class MoneyCalculator {
  /**
   * 将元转换为分
   */
  static toCents(yuan: number): number {
    return Math.round(yuan * 100)
  }

  /**
   * 将分转换为元（返回 number，注意二次运算可能产生浮点误差）
   */
  static toYuan(cents: number): number {
    return cents / 100
  }

  /**
   * P1-28: 将分转换为元字符串，避免二次运算累积误差
   */
  static toYuanFixed(cents: number): string {
    return (cents / 100).toFixed(2)
  }

  /**
   * 计算订单金额
   * @param items - 订单项
   * @param discount - 折扣金额（元）
   */
  static calculate(
    items: Array<{ price: number; quantity: number }>,
    discount = 0,
  ): { total: number; discount: number; final: number } {
    let totalCents = 0

    for (const item of items) {
      const priceCents = this.toCents(item.price)
      const quantity = Math.round(item.quantity * 10)
      totalCents += Math.round((priceCents * quantity) / 10)
    }

    const discountCents = this.toCents(discount)
    const finalCents = Math.max(0, totalCents - discountCents)

    return {
      total: this.toYuan(totalCents),
      discount: this.toYuan(discountCents),
      final: this.toYuan(finalCents),
    }
  }

  /**
   * 计算订单金额（支持金额减免和百分比折扣）
   * @param items - 订单项
   * @param discountValue - 折扣值
   * @param discountType - 折扣类型：'amount' | 'percent'
   */
  static calculateWithDiscount(
    items: Array<{ price: number; quantity: number }>,
    discountValue = 0,
    discountType: 'amount' | 'percent' = 'amount',
  ): { total: number; discount: number; final: number } {
    let totalCents = 0

    for (const item of items) {
      const priceCents = this.toCents(item.price)
      const quantity = Math.round(item.quantity * 10)
      totalCents += Math.round((priceCents * quantity) / 10)
    }

    let discountCents = 0

    if (discountType === 'percent') {
      if (discountValue > 0 && discountValue <= 10) {
        const discountRate = discountValue / 10
        const finalCents = Math.round(totalCents * discountRate)
        discountCents = totalCents - finalCents
      }
    } else {
      discountCents = this.toCents(discountValue)
    }

    discountCents = Math.min(discountCents, totalCents)
    const finalCents = totalCents - discountCents

    return {
      total: this.toYuan(totalCents),
      discount: this.toYuan(discountCents),
      final: this.toYuan(finalCents),
    }
  }

  /**
   * 格式化金额显示
   * @param amount - 金额
   * @returns - 格式化后的字符串
   */
  static format(amount: number): string {
    return `¥${amount.toFixed(2)}`
  }
}

/**
 * 输入验证
 */
export const Validators = {
  orderNo(value: string): boolean {
    return /^O\d{11,}$/.test(value)
  },

  amount(value: number): boolean {
    const str = String(value).trim()
    if (!/^\d+(\.\d+)?$/.test(str)) return false
    const num = Number(str)
    return !isNaN(num) && num >= 0 && num <= 999999
  },

  quantity(value: number): boolean {
    const str = String(value).trim()
    if (!/^\d+(\.\d+)?$/.test(str)) return false
    const num = Number(str)
    return !isNaN(num) && num > 0 && num <= 999
  },

  sanitizeString(value: unknown, maxLength = 100): string {
    if (typeof value !== 'string') return ''
    return value
      .trim()
      .slice(0, maxLength)
      .replace(/[<>'"`\\]/g, '')
  },
}
