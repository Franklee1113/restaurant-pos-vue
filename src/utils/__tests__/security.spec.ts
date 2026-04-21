import { describe, it, expect, vi } from 'vitest'
import { escapeHtml, setSafeHtml, setSafeText, createSafeText, setSafeAttribute, MoneyCalculator, Validators } from '../security'

describe('escapeHtml', () => {
  it('应该转义 HTML 特殊字符', () => {
    expect(escapeHtml('<script>alert(1)</script>')).not.toContain('<script>')
    expect(escapeHtml('<div>test</div>')).not.toContain('<div>')
    expect(escapeHtml('"test"')).not.toContain('<')
  })

  it('应该处理 null 和 undefined', () => {
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
  })
})

describe('setSafeHtml', () => {
  it('应该阻止包含属性的 HTML 标签', () => {
    const div = document.createElement('div')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    setSafeHtml(div, '<div onclick="alert(1)">text</div>')
    expect(div.textContent).toBe('<div onclick="alert(1)">text</div>')
    expect(div.querySelector('[onclick]')).toBeNull()
    expect(div.children.length).toBe(0)
    warnSpy.mockRestore()
  })

  it('应该阻止未转义的非白名单标签', () => {
    const div = document.createElement('div')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    setSafeHtml(div, '<script>alert(1)</script>')
    expect(div.textContent).toBe('<script>alert(1)</script>')
    expect(div.querySelector('script')).toBeNull()
    warnSpy.mockRestore()
  })

  it('应该允许白名单标签（无属性）', () => {
    const div = document.createElement('div')
    setSafeHtml(div, '<p>hello</p><br/><b>bold</b>')
    expect(div.innerHTML).toBe('<p>hello</p><br><b>bold</b>')
  })

  it('空元素应该直接返回', () => {
    setSafeHtml(null as unknown as HTMLElement, '<p>test</p>')
    // 不应抛出
  })
})

describe('setSafeText', () => {
  it('应该安全设置文本内容', () => {
    const div = document.createElement('div')
    setSafeText(div, '<script>')
    expect(div.textContent).toBe('<script>')
    expect(div.innerHTML).toBe('&lt;script&gt;')
  })

  it('应该处理 null 元素', () => {
    setSafeText(null as unknown as HTMLElement, 'test')
  })
})

describe('createSafeText', () => {
  it('应该创建文本节点', () => {
    const node = createSafeText('<script>')
    expect(node.textContent).toBe('<script>')
  })
})

describe('setSafeAttribute', () => {
  it('应该拒绝危险属性 onxxx', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const div = document.createElement('div')
    setSafeAttribute(div, 'onclick', 'alert(1)')
    expect(div.hasAttribute('onclick')).toBe(false)
    warnSpy.mockRestore()
  })

  it('应该拒绝 style 属性', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const div = document.createElement('div')
    setSafeAttribute(div, 'style', 'color:red')
    expect(div.hasAttribute('style')).toBe(false)
    warnSpy.mockRestore()
  })

  it('应该拒绝 javascript: 协议的 href', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const a = document.createElement('a')
    setSafeAttribute(a, 'href', 'javascript:alert(1)')
    expect(a.hasAttribute('href')).toBe(false)
    warnSpy.mockRestore()
  })

  it('应该拒绝 data: 协议的 src', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const img = document.createElement('img')
    setSafeAttribute(img, 'src', 'data:text/html,<script>alert(1)</script>')
    expect(img.hasAttribute('src')).toBe(false)
    warnSpy.mockRestore()
  })

  it('应该允许安全的 href', () => {
    const a = document.createElement('a')
    setSafeAttribute(a, 'href', 'https://example.com')
    expect(a.getAttribute('href')).toBe('https://example.com')
  })

  it('应该处理空元素或空属性名', () => {
    setSafeAttribute(null as unknown as HTMLElement, 'href', 'x')
    const div = document.createElement('div')
    setSafeAttribute(div, '', 'x')
    // 不应抛出
  })
})

describe('MoneyCalculator', () => {
  // ── 基础计算（与后端 Hook 算法保持一致） ──
  it('应该精确计算订单金额', () => {
    const items = [{ price: 0.1, quantity: 3 }]
    const result = MoneyCalculator.calculate(items, 0)
    expect(result.total).toBeCloseTo(0.3, 2)
  })

  it('应该正确处理百分比折扣', () => {
    const items = [{ price: 100, quantity: 1 }]
    const result = MoneyCalculator.calculateWithDiscount(items, 8, 'percent')
    expect(result.total).toBe(100)
    expect(result.discount).toBe(20)
    expect(result.final).toBe(80)
  })

  it('应该正确格式化金额', () => {
    expect(MoneyCalculator.format(19.99)).toBe('¥19.99')
    expect(MoneyCalculator.format(0)).toBe('¥0.00')
  })

  it('toCents / toYuan / toYuanFixed 应该精确转换', () => {
    expect(MoneyCalculator.toCents(19.99)).toBe(1999)
    expect(MoneyCalculator.toCents(0.1)).toBe(10)
    expect(MoneyCalculator.toYuan(1999)).toBe(19.99)
    expect(MoneyCalculator.toYuanFixed(1999)).toBe('19.99')
    expect(MoneyCalculator.toYuanFixed(5)).toBe('0.05')
  })

  // ── 边界测试：浮点精度（必须与后端 Hook 一致） ──
  it('浮点精度: 0.1 × 3 = 0.3', () => {
    const result = MoneyCalculator.calculate([{ price: 0.1, quantity: 3 }], 0)
    expect(result.total).toBe(0.3)
  })

  it('浮点精度: 0.07 × 7 = 0.49', () => {
    const result = MoneyCalculator.calculate([{ price: 0.07, quantity: 7 }], 0)
    expect(result.total).toBe(0.49)
  })

  it('浮点精度: 0.17 × 3 = 0.51', () => {
    const result = MoneyCalculator.calculate([{ price: 0.17, quantity: 3 }], 0)
    expect(result.total).toBe(0.51)
  })

  it('小数数量: 68 × 1.5 = 102', () => {
    const result = MoneyCalculator.calculate([{ price: 68, quantity: 1.5 }], 0)
    expect(result.total).toBe(102)
  })

  it('多件混合: 68×2 + 12.5×1.5 = 154.75', () => {
    const result = MoneyCalculator.calculate([
      { price: 68, quantity: 2 },
      { price: 12.5, quantity: 1.5 },
    ], 0)
    expect(result.total).toBe(154.75)
  })

  it('空购物车: total=0, discount=0, final=0', () => {
    const result = MoneyCalculator.calculate([], 0)
    expect(result.total).toBe(0)
    expect(result.discount).toBe(0)
    expect(result.final).toBe(0)
  })

  // ── 边界测试：百分比折扣（必须与后端 Hook 一致） ──
  it('百分比折扣: 8折 (total=100)', () => {
    const result = MoneyCalculator.calculateWithDiscount([{ price: 100, quantity: 1 }], 8, 'percent')
    expect(result.discount).toBe(20)
    expect(result.final).toBe(80)
  })

  it('百分比折扣: 9.5折 (total=100)', () => {
    const result = MoneyCalculator.calculateWithDiscount([{ price: 100, quantity: 1 }], 9.5, 'percent')
    expect(result.discount).toBe(5)
    expect(result.final).toBe(95)
  })

  it('百分比折扣: 10折 = 无折扣', () => {
    const result = MoneyCalculator.calculateWithDiscount([{ price: 100, quantity: 1 }], 10, 'percent')
    expect(result.discount).toBe(0)
    expect(result.final).toBe(100)
  })

  it('百分比折扣: 0折 = 无折扣（非法输入边界）', () => {
    const result = MoneyCalculator.calculateWithDiscount([{ price: 100, quantity: 1 }], 0, 'percent')
    expect(result.discount).toBe(0)
    expect(result.final).toBe(100)
  })

  it('百分比折扣: >10折 = 无折扣（非法输入边界）', () => {
    const result = MoneyCalculator.calculateWithDiscount([{ price: 100, quantity: 1 }], 12, 'percent')
    expect(result.discount).toBe(0)
    expect(result.final).toBe(100)
  })

  // ── 边界测试：固定金额折扣（必须与后端 Hook 一致） ──
  it('固定减免: 0元 = 无折扣', () => {
    const result = MoneyCalculator.calculateWithDiscount([{ price: 100, quantity: 1 }], 0, 'amount')
    expect(result.discount).toBe(0)
    expect(result.final).toBe(100)
  })

  it('固定减免: 等于总价', () => {
    const result = MoneyCalculator.calculateWithDiscount([{ price: 100, quantity: 1 }], 100, 'amount')
    expect(result.discount).toBe(100)
    expect(result.final).toBe(0)
  })

  it('固定减免: 大于总价 → discount=min(discount,total), final≥0', () => {
    const result = MoneyCalculator.calculateWithDiscount([{ price: 100, quantity: 1 }], 150, 'amount')
    expect(result.discount).toBe(100)
    expect(result.final).toBe(0)
  })

  it('固定减免: 小数金额', () => {
    const result = MoneyCalculator.calculateWithDiscount([{ price: 100, quantity: 1 }], 12.55, 'amount')
    expect(result.discount).toBe(12.55)
    expect(result.final).toBe(87.45)
  })

  // ── 边界测试：大额 / 极端场景 ──
  it('大额订单: 9999 × 99', () => {
    const result = MoneyCalculator.calculate([{ price: 9999, quantity: 99 }], 0)
    expect(result.total).toBe(989901)
  })

  it('多件累加折扣: 3道菜 8折', () => {
    const result = MoneyCalculator.calculateWithDiscount([
      { price: 68, quantity: 1 },
      { price: 32, quantity: 2 },
      { price: 12.5, quantity: 1.5 },
    ], 8, 'percent')
    // total = 68 + 64 + 18.75 = 150.75
    // 8折 → final = 120.6, discount = 30.15
    expect(result.total).toBe(150.75)
    expect(result.discount).toBe(30.15)
    expect(result.final).toBe(120.6)
  })
})

describe('Validators', () => {
  it('应该验证订单号格式', () => {
    expect(Validators.orderNo('O20260413001')).toBe(true)
    expect(Validators.orderNo('invalid')).toBe(false)
  })

  it('应该验证金额', () => {
    expect(Validators.amount(100)).toBe(true)
    expect(Validators.amount(-1)).toBe(false)
    expect(Validators.amount(999999)).toBe(true)
    expect(Validators.amount(1000000)).toBe(false)
    expect(Validators.amount('abc' as unknown as number)).toBe(false)
  })

  it('应该验证数量', () => {
    expect(Validators.quantity(1)).toBe(true)
    expect(Validators.quantity(0)).toBe(false)
    expect(Validators.quantity(999)).toBe(true)
    expect(Validators.quantity(1000)).toBe(false)
    expect(Validators.quantity(-1)).toBe(false)
  })

  it('应该消毒字符串', () => {
    expect(Validators.sanitizeString('<script>')).toBe('script')
    expect(Validators.sanitizeString(123 as unknown as string)).toBe('')
    expect(Validators.sanitizeString('  hello  ')).toBe('hello')
    const long = 'a'.repeat(200)
    expect(Validators.sanitizeString(long).length).toBe(100)
  })
})
