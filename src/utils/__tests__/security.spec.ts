import { describe, it, expect } from 'vitest'
import { escapeHtml, MoneyCalculator, Validators } from '../security'

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

describe('MoneyCalculator', () => {
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
})

describe('Validators', () => {
  it('应该验证订单号格式', () => {
    expect(Validators.orderNo('O20260413001')).toBe(true)
    expect(Validators.orderNo('invalid')).toBe(false)
  })

  it('应该验证金额', () => {
    expect(Validators.amount(100)).toBe(true)
    expect(Validators.amount(-1)).toBe(false)
  })

  it('应该消毒字符串', () => {
    expect(Validators.sanitizeString('<script>')).toBe('script')
    expect(Validators.sanitizeString(123 as any)).toBe('')
  })
})
