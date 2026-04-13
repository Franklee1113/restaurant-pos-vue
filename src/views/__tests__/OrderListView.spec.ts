import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import OrderListView from '../OrderListView.vue'
import * as pocketbase from '@/api/pocketbase'

vi.mock('@/api/pocketbase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/pocketbase')>()
  return {
    ...actual,
    OrderAPI: {
      getOrders: vi.fn(),
      deleteOrder: vi.fn(),
      updateOrderStatus: vi.fn(),
    },
  }
})

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'orderList', component: OrderListView },
    { path: '/order-detail/:orderId', name: 'orderDetail', component: { template: '<div>detail</div>' } },
    { path: '/edit-order/:orderId', name: 'editOrder', component: { template: '<div>edit</div>' } },
  ],
})

describe('OrderListView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(pocketbase.OrderAPI.getOrders).mockResolvedValue({
      page: 1,
      perPage: 20,
      totalItems: 1,
      totalPages: 1,
      items: [
        {
          id: 'ord1',
          orderNo: 'O20260101001',
          tableNo: '大厅01',
          guests: 4,
          status: 'pending',
          items: [{ dishId: 'd1', name: '铁锅鱼', price: 68, quantity: 1 }],
          totalAmount: 68,
          discount: 0,
          discountType: 'amount',
          discountValue: 0,
          finalAmount: 68,
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        } as any,
      ],
    })
  })

  it('renders order list after loading', async () => {
    const wrapper = mount(OrderListView, {
      global: { plugins: [createPinia(), router] },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('O20260101001')
    expect(wrapper.text()).toContain('大厅01')
  })

  it('shows empty state when no orders', async () => {
    vi.mocked(pocketbase.OrderAPI.getOrders).mockResolvedValue({
      page: 1,
      perPage: 20,
      totalItems: 0,
      totalPages: 1,
      items: [],
    })
    const wrapper = mount(OrderListView, {
      global: { plugins: [createPinia(), router] },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('暂无订单')
  })
})
