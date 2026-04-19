import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { generateBillHTML, printBill, printKitchenTicket } from '../printBill'
import type { Order, Settings } from '@/api/pocketbase'

vi.mock('@/utils/assets', () => ({
  getFileUrl: vi.fn((collection: string, id: string | undefined, filename: string | undefined) => {
    if (!id || !filename) return null
    return `/api/files/${collection}/${id}/${filename}`
  }),
}))

const mockOrder: Order = {
  id: 'o1',
  orderNo: 'O202604190001',
  tableNo: 'A1',
  guests: 4,
  status: 'settled',
  items: [
    { dishId: 'd1', name: '铁锅鱼', price: 68, quantity: 1, status: 'served' },
    { dishId: 'd2', name: '锅底', price: 28, quantity: 1, status: 'served', remark: '加辣' },
  ],
  totalAmount: 104,
  discount: 0,
  discountType: 'amount',
  discountValue: 0,
  finalAmount: 104,
  remark: '生日庆祝',
  created: '2026-04-19T10:00:00.000Z',
  updated: '2026-04-19T10:30:00.000Z',
} as Order

const mockSettings: Settings = {
  id: 's1',
  restaurantName: '测试餐厅',
  address: '测试路1号',
  phone: '12345678901',
} as Settings

describe('printBill', () => {
  let mockWindow: any

  beforeEach(() => {
    mockWindow = {
      document: {
        write: vi.fn(),
        close: vi.fn(),
      },
    }
    vi.stubGlobal('open', vi.fn(() => mockWindow))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('generateBillHTML should include order info', () => {
    const html = generateBillHTML(mockOrder, mockSettings)
    expect(html).toContain('测试餐厅')
    expect(html).toContain('O202604190001')
    expect(html).toContain('A1')
    expect(html).toContain('铁锅鱼')
    expect(html).toContain('锅底')
    expect(html).toContain('加辣')
    expect(html).toContain('生日庆祝')
    expect(html).toContain('¥104.00')
  })

  it('generateBillHTML should escape HTML in restaurant name', () => {
    const evilSettings = { ...mockSettings, restaurantName: '<script>alert(1)</script>' }
    const html = generateBillHTML(mockOrder, evilSettings)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('generateBillHTML should include QR codes when available', () => {
    const settingsWithQr = {
      ...mockSettings,
      wechatPayQr: 'wechat.png',
      alipayQr: 'alipay.png',
    }
    const html = generateBillHTML(mockOrder, settingsWithQr as Settings)
    expect(html).toContain('/api/files/settings/s1/wechat.png')
    expect(html).toContain('/api/files/settings/s1/alipay.png')
    expect(html).toContain('微信支付')
    expect(html).toContain('支付宝')
  })

  it('generateBillHTML should not include QR section when no QR', () => {
    const html = generateBillHTML(mockOrder, mockSettings)
    expect(html).not.toContain('微信/支付宝扫码付款')
  })

  it('generateBillHTML should handle empty items', () => {
    const emptyOrder = { ...mockOrder, items: [] }
    const html = generateBillHTML(emptyOrder, mockSettings)
    expect(html).toContain('合计')
  })

  it('generateBillHTML should handle cutlery', () => {
    const orderWithCutlery = {
      ...mockOrder,
      cutlery: { type: 'charged' as const, quantity: 4, unitPrice: 2, totalPrice: 8 },
      totalAmount: 112,
      finalAmount: 112,
    }
    const html = generateBillHTML(orderWithCutlery, mockSettings)
    expect(html).toContain('餐具')
    expect(html).toContain('收费')
    expect(html).toContain('¥8.00')
  })

  it('generateBillHTML should handle free cutlery', () => {
    const orderWithFreeCutlery = {
      ...mockOrder,
      cutlery: { type: 'free' as const, quantity: 4, unitPrice: 0, totalPrice: 0 },
    }
    const html = generateBillHTML(orderWithFreeCutlery, mockSettings)
    expect(html).toContain('免费')
  })

  it('printBill should open window and write HTML', () => {
    printBill(mockOrder, mockSettings)
    expect(window.open).toHaveBeenCalledWith('', '_blank', 'width=360,height=700')
    expect(mockWindow.document.write).toHaveBeenCalled()
    expect(mockWindow.document.close).toHaveBeenCalled()
  })

  it('printBill should handle blocked popup', () => {
    vi.stubGlobal('open', vi.fn(() => null))
    printBill(mockOrder, mockSettings)
    expect(window.open).toHaveBeenCalled()
    // Should not throw when window is null
  })

  it('printKitchenTicket should open window with kitchen HTML', () => {
    printKitchenTicket(mockOrder, mockSettings)
    expect(window.open).toHaveBeenCalledWith('', '_blank', 'width=360,height=700')
    expect(mockWindow.document.write).toHaveBeenCalled()
    const writtenHtml = mockWindow.document.write.mock.calls[0][0]
    expect(writtenHtml).toContain('后厨单')
    expect(writtenHtml).toContain('铁锅鱼')
    expect(writtenHtml).toContain('×1')
    expect(writtenHtml).toContain('加辣')
  })

  it('generateBillHTML should support 58mm paper width', () => {
    const html = generateBillHTML(mockOrder, mockSettings, '58mm')
    expect(html).toContain('58mm')
    expect(html).toContain('11px')
    expect(html).toContain('测试餐厅')
    expect(html).toContain('铁锅鱼')
  })

  it('generateBillHTML should use 80mm as default', () => {
    const html = generateBillHTML(mockOrder, mockSettings)
    expect(html).toContain('80mm')
    expect(html).toContain('12px')
  })
})
