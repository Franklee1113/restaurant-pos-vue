import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import OrderFormView from '../OrderFormView.vue'
import * as pocketbase from '@/api/pocketbase'

vi.mock('@/api/pocketbase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/pocketbase')>()
  return {
    ...actual,
    OrderAPI: {
      getOrder: vi.fn(),
      createOrder: vi.fn(),
      updateOrder: vi.fn(),
    },
    DishAPI: {
      getDishes: vi.fn(),
    },
  }
})

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/create-order', name: 'createOrder', component: OrderFormView },
    { path: '/edit-order/:orderId', name: 'editOrder', component: OrderFormView },
    { path: '/', name: 'orderList', component: { template: '<div>list</div>' } },
  ],
})

describe('OrderFormView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(pocketbase.DishAPI.getDishes).mockResolvedValue({
      page: 1,
      perPage: 100,
      totalItems: 1,
      totalPages: 1,
      items: [{ id: 'd1', name: '铁锅鱼', price: 68, category: '铁锅炖' }],
    })
    vi.mocked(pocketbase.OrderAPI.getOrder).mockResolvedValue({
      id: 'ord1',
      orderNo: 'O001',
      tableNo: '大厅01',
      guests: 4,
      status: 'pending',
      items: [{ dishId: 'd1', name: '铁锅鱼', price: 68, quantity: 1 }],
      totalAmount: 68,
      discount: 0,
      discountType: 'amount',
      discountValue: 0,
      finalAmount: 68,
      created: '',
      updated: '',
    } as any)
  })

  it('renders create form', async () => {
    await router.push('/create-order')
    const wrapper = mount(OrderFormView, {
      global: { plugins: [createPinia(), router] },
    })
    await flushPromises()
    expect(wrapper.find('h2').text()).toBe('新建订单')
  })

  it('shows validation error when tableNo is empty', async () => {
    window.alert = vi.fn()
    await router.push('/create-order')
    const wrapper = mount(OrderFormView, {
      global: { plugins: [createPinia(), router] },
    })
    await flushPromises()
    const btns = wrapper.findAll('button')
    const submitBtn = btns.find((b) => b.text().includes('提交订单'))
    expect(submitBtn).toBeTruthy()
    await submitBtn!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('请选择桌号')
  })
})
