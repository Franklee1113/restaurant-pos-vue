import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import TableCard from '../TableCard.vue'
import { OrderAPI } from '@/api/pocketbase'
import { useSettingsStore } from '@/stores/settings.store'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/api/pocketbase', async () => {
  const actual = await vi.importActual<typeof import('@/api/pocketbase')>('@/api/pocketbase')
  return {
    ...actual,
    OrderAPI: {
      updateOrderItemStatus: vi.fn(() => Promise.resolve({})),
    },
  }
})

vi.mock('@/utils/printBill', () => ({
  printBill: vi.fn(),
}))

const pushMock = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}))

const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ success: toastSuccess, error: toastError }),
}))

describe('TableCard', () => {
  const baseOrder = {
    id: 'o1',
    orderNo: 'O202501010001',
    tableNo: 'A01',
    status: 'pending',
    guests: 4,
    finalAmount: 128,
    created: new Date(Date.now() - 5 * 60000).toISOString(),
    items: [
      { dishId: 'd1', name: '铁锅鱼', price: 68, quantity: 1, status: 'cooked', originalIndex: 0 },
      { dishId: 'd2', name: '锅底', price: 28, quantity: 1, status: 'cooking', originalIndex: 1 },
      { dishId: 'd3', name: '米饭', price: 2, quantity: 4, status: 'served', originalIndex: 2 },
    ],
  }

  function mountCard(props = {}) {
    return mount(TableCard, {
      props: {
        tableNo: 'A01',
        displayStatus: 'dining' as const,
        tableStatus: 'occupied',
        currentOrderId: 'o1',
        order: baseOrder as any,
        extraOrders: 0,
        ...props,
      },
      global: {
        plugins: [createPinia()],
      },
    })
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('should render table number and order info', () => {
    const wrapper = mountCard()
    expect(wrapper.text()).toContain('A01')
    expect(wrapper.text()).toContain('O202501010001')
    expect(wrapper.text()).toContain('4人')
    expect(wrapper.text()).toContain('¥128')
  })

  it('should render idle border color', () => {
    const wrapper = mountCard({ displayStatus: 'idle', order: null })
    expect(wrapper.find('.border-l-green-500').exists()).toBe(true)
  })

  it('should render pending_clear border color', () => {
    const wrapper = mountCard({ displayStatus: 'pending_clear' })
    expect(wrapper.find('.border-l-yellow-500').exists()).toBe(true)
  })

  it('should render default border color for unknown status', () => {
    const wrapper = mountCard({ displayStatus: 'unknown' as any })
    expect(wrapper.find('.border-l-gray-300').exists()).toBe(true)
  })

  it('should show wait info in red when >= 20 minutes', () => {
    const order = {
      ...baseOrder,
      created: new Date(Date.now() - 25 * 60000).toISOString(),
    }
    const wrapper = mountCard({ order })
    expect(wrapper.find('.text-red-600').exists()).toBe(true)
  })

  it('should show wait info in orange when >= 10 minutes', () => {
    const order = {
      ...baseOrder,
      created: new Date(Date.now() - 15 * 60000).toISOString(),
    }
    const wrapper = mountCard({ order })
    expect(wrapper.find('.text-orange-500').exists()).toBe(true)
  })

  it('should show extra orders badge', () => {
    const wrapper = mountCard({ extraOrders: 2 })
    expect(wrapper.text()).toContain('+2 个关联订单')
  })

  it('should sort items by status priority', () => {
    const wrapper = mountCard()
    const items = wrapper.findAll('[class*="flex items-center justify-between"]')
    expect(items.length).toBeGreaterThan(0)
  })

  it('should emit refresh after mark served', async () => {
    const wrapper = mountCard()
    const btn = wrapper.findAll('button').find((b) => b.text().includes('标记上菜'))
    expect(btn).toBeTruthy()
    await btn!.trigger('click')
    await flushPromises()
    expect(OrderAPI.updateOrderItemStatus).toHaveBeenCalledWith('o1', 0, 'served')
    expect(toastSuccess).toHaveBeenCalledWith('已标记上菜')
    expect(wrapper.emitted('refresh')).toBeTruthy()
  })

  it('should show error toast when mark served fails', async () => {
    vi.mocked(OrderAPI.updateOrderItemStatus).mockRejectedValueOnce(new Error('network'))
    const wrapper = mountCard()
    const btn = wrapper.findAll('button').find((b) => b.text().includes('标记上菜'))
    await btn!.trigger('click')
    await flushPromises()
    expect(toastError).toHaveBeenCalledWith('标记失败: network')
  })

  it('should navigate to order detail on view', async () => {
    const wrapper = mountCard()
    const btn = wrapper.findAll('button').find((b) => b.text().includes('查看'))
    await btn!.trigger('click')
    expect(pushMock).toHaveBeenCalledWith({ name: 'orderDetail', params: { orderId: 'o1' } })
  })

  it('should navigate to edit order on edit', async () => {
    const wrapper = mountCard()
    const btn = wrapper.findAll('button').find((b) => b.text().includes('编辑'))
    await btn!.trigger('click')
    expect(pushMock).toHaveBeenCalledWith({ name: 'editOrder', params: { orderId: 'o1' } })
  })

  it('should disable edit when order is completed', () => {
    const wrapper = mountCard({
      order: { ...baseOrder, status: 'completed' },
    })
    const btn = wrapper.findAll('button').find((b) => b.text().includes('编辑'))
    expect(btn!.attributes('disabled')).toBeDefined()
  })

  it('should disable edit when order is settled', () => {
    const wrapper = mountCard({
      order: { ...baseOrder, status: 'settled' },
    })
    const btn = wrapper.findAll('button').find((b) => b.text().includes('编辑'))
    expect(btn!.attributes('disabled')).toBeDefined()
  })

  it('should not navigate when order is null on view', async () => {
    const wrapper = mountCard({ order: null })
    // No buttons rendered when order is null
    expect(wrapper.find('button').exists()).toBe(false)
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('should show cooked count badge', () => {
    const wrapper = mountCard()
    expect(wrapper.text()).toContain('待上菜 1 道')
  })

  it('should show dash when no order', () => {
    const wrapper = mountCard({ order: null })
    expect(wrapper.text()).toContain('-')
  })
})
