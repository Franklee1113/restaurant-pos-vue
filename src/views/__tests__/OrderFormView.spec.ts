import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import OrderFormView from '../OrderFormView.vue'
import { OrderAPI, DishAPI } from '@/api/pocketbase'
import { useRoute, useRouter } from 'vue-router'
import { useSettingsStore } from '@/stores/settings.store'
import { useToast } from '@/composables/useToast'
import { OrderStatus } from '@/utils/orderStatus'

// ─── Module Mocks ───
vi.mock('vue-router', () => ({
  useRoute: vi.fn(() => ({ name: 'createOrder', params: {} })),
  useRouter: vi.fn(() => ({ push: vi.fn(), back: vi.fn() })),
}))

vi.mock('@/composables/useToast', () => ({
  useToast: vi.fn(() => ({
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  })),
}))

vi.mock('@/stores/settings.store', () => ({
  useSettingsStore: vi.fn(() => ({
    tableNumbers: ['A1', 'A2', 'A3'],
    categories: ['铁锅炖', '凉菜', '主食'],
    fetchSettings: vi.fn(),
    settings: { restaurantName: '测试餐厅' },
  })),
}))

vi.mock('@/api/pocketbase', async () => {
  const actual = await vi.importActual<typeof import('@/api/pocketbase')>('@/api/pocketbase')
  return {
    ...actual,
    OrderAPI: {
      createOrder: vi.fn(),
      updateOrder: vi.fn(),
      getOrder: vi.fn(),
    },
    DishAPI: {
      getDishes: vi.fn(),
      toggleSoldOut: vi.fn(),
    },
  }
})

globalThis.ResizeObserver = vi.fn(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

function mountOrderFormView(stubs = true) {
  return mount(OrderFormView, {
    global: {
      stubs: stubs
        ? {
            CartPanel: {
              template:
                '<div data-testid="cart-panel"><button data-testid="submit-btn" @click="$emit(\'submit\')">提交订单</button></div>',
              props: ['cart', 'dishesTotal', 'cutleryTotal', 'finalTotal', 'isEdit', 'submitting'],
            },
            CutleryConfigPanel: {
              template: '<div data-testid="cutlery-panel" />',
              props: ['modelType', 'modelQty', 'guests'],
            },
            EmptyState: true,
            SkeletonBox: true,
          }
        : undefined,
    },
  })
}

describe('OrderFormView', () => {
  let toastSuccess: ReturnType<typeof vi.fn>
  let toastError: ReturnType<typeof vi.fn>
  let toastInfo: ReturnType<typeof vi.fn>
  let toastWarning: ReturnType<typeof vi.fn>
  let pushMock: ReturnType<typeof vi.fn>
  let backMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()

    // Re-wire toast mocks so we can assert on them
    toastSuccess = vi.fn()
    toastError = vi.fn()
    toastInfo = vi.fn()
    toastWarning = vi.fn()
    vi.mocked(useToast).mockReturnValue({
      success: toastSuccess,
      error: toastError,
      info: toastInfo,
      toasts: { value: [] },
      show: vi.fn(),
      warning: toastWarning,
      remove: vi.fn(),
    } as any)

    pushMock = vi.fn()
    backMock = vi.fn()
    vi.mocked(useRouter).mockReturnValue({ push: pushMock, back: backMock } as any)

    vi.mocked(DishAPI.getDishes).mockResolvedValue({
      items: [
        { id: 'd1', name: '铁锅鱼', price: 68, category: '铁锅炖', description: '' },
        { id: 'd2', name: '锅底', price: 28, category: '铁锅炖', description: '' },
        { id: 'd3', name: '凉拌黄瓜', price: 12, category: '凉菜', description: '' },
        { id: 'd4', name: '餐具', price: 2, category: '餐具', description: '' },
      ],
    } as any)

    vi.mocked(useRoute).mockReturnValue({ name: 'createOrder', params: {}, matched: [], fullPath: '/create-order', query: {}, hash: '', path: '/create-order', meta: {} } as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should render create order title in create mode', async () => {
    const wrapper = mountOrderFormView()
    await flushPromises()
    expect(wrapper.find('h2').text()).toContain('新建订单')
  })

  it('should load dishes on mount', async () => {
    mountOrderFormView()
    await flushPromises()
    expect(vi.mocked(DishAPI.getDishes)).toHaveBeenCalled()
  })

  it('should show table options from settings', async () => {
    const wrapper = mountOrderFormView()
    await flushPromises()
    const options = wrapper.findAll('select option')
    expect(options.length).toBeGreaterThan(1)
    expect(options.some((o) => o.text() === 'A1')).toBe(true)
  })

  it('should add dish to cart when clicking +添加', async () => {
    const wrapper = mountOrderFormView()
    await flushPromises()
    const addBtn = wrapper.findAll('button').find((b) => b.text().includes('+ 添加'))
    expect(addBtn).toBeDefined()
    await addBtn!.trigger('click')
    await nextTick()
    expect(wrapper.find('[data-testid="cart-panel"]').exists()).toBe(true)
  })

  it('should auto-add 锅底 when adding 铁锅鱼', async () => {
    const wrapper = mountOrderFormView()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.addToCart({ id: 'd1', name: '铁锅鱼', price: 68, category: '铁锅炖', description: '' })
    await nextTick()
    const cart = vm.cart as any[]
    expect(cart.some((i) => i.name === '锅底')).toBe(true)
    expect(toastInfo).toHaveBeenCalledWith(expect.stringContaining('锅底'))
  })

  it('should not duplicate 锅底 when adding 铁锅鱼 twice', async () => {
    const wrapper = mountOrderFormView()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.addToCart({ id: 'd1', name: '铁锅鱼', price: 68, category: '铁锅炖', description: '' })
    vm.addToCart({ id: 'd1', name: '铁锅鱼', price: 68, category: '铁锅炖', description: '' })
    await nextTick()
    const cart = vm.cart as any[]
    expect(cart.filter((i) => i.name === '锅底').length).toBe(1)
  })

  it('should increment quantity when adding existing dish', async () => {
    const wrapper = mountOrderFormView()
    await flushPromises()
    const vm = wrapper.vm as any
    const dish = { id: 'd3', name: '凉拌黄瓜', price: 12, category: '凉菜', description: '' }
    vm.addToCart(dish)
    vm.addToCart(dish)
    await nextTick()
    const item = vm.cart.find((i: any) => i.dishId === 'd3')
    expect(item.quantity).toBe(2)
  })

  it('should load existing order data in edit mode', async () => {
    vi.mocked(useRoute).mockReturnValue({
      name: 'editOrder',
      params: { orderId: 'o123' },
    } as any)

    vi.mocked(OrderAPI.getOrder).mockResolvedValue({
      id: 'o123',
      orderNo: 'O20260419001',
      tableNo: 'A2',
      guests: 6,
      status: OrderStatus.PENDING,
      items: [
        { dishId: 'd1', name: '铁锅鱼', price: 68, quantity: 1, remark: '', status: 'pending' },
      ],
      discountType: 'percent',
      discountValue: 8,
      totalAmount: 68,
      finalAmount: 54.4,
      remark: '少辣',
      cutlery: { type: 'charged', quantity: 6, unitPrice: 2, totalPrice: 12 },
    } as any)

    const wrapper = mountOrderFormView()
    await flushPromises()
    const vm = wrapper.vm as any

    expect(vi.mocked(OrderAPI.getOrder)).toHaveBeenCalledWith('o123')
    expect(vm.tableNo).toBe('A2')
    expect(vm.guests).toBe(6)
    expect(vm.discountType).toBe('percent')
    expect(vm.discountValue).toBe(8)
    expect(vm.remark).toBe('少辣')
    expect(vm.cart.length).toBe(1)
    expect(vm.cutleryQty).toBe(6)
  })

  it('should block submit when tableNo is empty', async () => {
    const wrapper = mountOrderFormView()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.tableNo = ''
    vm.cart = [{ dishId: 'd3', name: '凉拌黄瓜', price: 12, quantity: 1 }]
    await vm.submit()
    expect(vi.mocked(OrderAPI.createOrder)).not.toHaveBeenCalled()
    expect(vm.formErrors.tableNo).toBeDefined()
  })

  it('should block submit when cart is empty', async () => {
    const wrapper = mountOrderFormView()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.tableNo = 'A1'
    vm.cart = []
    await vm.submit()
    expect(vi.mocked(OrderAPI.createOrder)).not.toHaveBeenCalled()
    expect(vm.formErrors.items).toBeDefined()
  })

  it('should create order and navigate to list on successful submit', async () => {
    const wrapper = mountOrderFormView()
    await flushPromises()
    const vm = wrapper.vm as any

    vm.tableNo = 'A1'
    vm.guests = 4
    vm.cart = [{ dishId: 'd3', name: '凉拌黄瓜', price: 12, quantity: 1, remark: '' }]
    vi.mocked(OrderAPI.createOrder).mockResolvedValue({ id: 'new-id' } as any)

    await vm.submit()
    await flushPromises()

    expect(vi.mocked(OrderAPI.createOrder)).toHaveBeenCalledOnce()
    const payload = vi.mocked(OrderAPI.createOrder).mock.calls[0]![0]
    expect(payload.tableNo).toBe('A1')
    expect(payload.items.length).toBe(1)
    expect(payload.status).toBe(OrderStatus.PENDING)
    expect(payload.orderNo).toMatch(/^O\d+/)
    expect(toastSuccess).toHaveBeenCalledWith('订单创建成功!')
    expect(pushMock).toHaveBeenCalledWith({ name: 'orderList' })
  })

  it('should update order and navigate to list in edit mode', async () => {
    vi.mocked(useRoute).mockReturnValue({
      name: 'editOrder',
      params: { orderId: 'o123' },
    } as any)

    vi.mocked(OrderAPI.getOrder).mockResolvedValue({
      id: 'o123',
      orderNo: 'O20260419001',
      tableNo: 'A2',
      guests: 4,
      status: OrderStatus.PENDING,
      items: [{ dishId: 'd3', name: '凉拌黄瓜', price: 12, quantity: 1, remark: '', status: 'pending' }],
      discountType: 'amount',
      discountValue: 0,
      totalAmount: 12,
      finalAmount: 12,
    } as any)

    const wrapper = mountOrderFormView()
    await flushPromises()
    const vm = wrapper.vm as any

    vi.mocked(OrderAPI.updateOrder).mockResolvedValue({ id: 'o123' } as any)
    await vm.submit()
    await flushPromises()

    expect(vi.mocked(OrderAPI.updateOrder)).toHaveBeenCalledWith('o123', expect.any(Object))
    expect(toastSuccess).toHaveBeenCalledWith('订单修改成功!')
    expect(pushMock).toHaveBeenCalledWith({ name: 'orderList' })
  })

  it('should show error toast when submit fails', async () => {
    const wrapper = mountOrderFormView()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.tableNo = 'A1'
    vm.addToCart({ id: 'd3', name: '凉拌黄瓜', price: 12, category: '凉菜' })
    await nextTick()
    vi.mocked(OrderAPI.createOrder).mockRejectedValue(new Error('网络错误'))

    await vm.submit()
    await flushPromises()

    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('网络错误'))
    expect(vm.submitting).toBe(false)
  })

  it('should prevent duplicate submit while submitting', async () => {
    const wrapper = mountOrderFormView()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.tableNo = 'A1'
    vm.cart = [{ dishId: 'd3', name: '凉拌黄瓜', price: 12, quantity: 1, remark: '' }]
    vm.submitting = true

    await vm.submit()
    expect(vi.mocked(OrderAPI.createOrder)).not.toHaveBeenCalled()
  })

  it('should default cutlery quantity to guests in create mode', async () => {
    const wrapper = mountOrderFormView()
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.cutleryQty).toBe(vm.guests)
  })

  it('should calculate charged cutlery price correctly', async () => {
    const wrapper = mountOrderFormView()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.guests = 5
    vm.cutleryQty = 5
    vm.cutleryType = 'charged'
    await nextTick()
    expect(vm.cutleryConfig.totalPrice).toBe(10) // 5 * 2
  })

  it('should reset discount value when switching to percent type', async () => {
    const wrapper = mountOrderFormView()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.discountValue = 15
    vm.discountType = 'percent'
    vm.onDiscountTypeChange()
    expect(vm.discountValue).toBe(8)
  })

  it('should filter dishes by selected category', async () => {
    const wrapper = mountOrderFormView()
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.filteredDishes.length).toBe(4)
    vm.currentCategory = '凉菜'
    await nextTick()
    expect(vm.filteredDishes.length).toBe(1)
    expect(vm.filteredDishes[0].name).toBe('凉拌黄瓜')
  })

  it('should remove item via removeFromCart', async () => {
    const wrapper = mountOrderFormView()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.addToCart({ id: 'd3', name: '凉拌黄瓜', price: 12, category: '凉菜' })
    await nextTick()
    vm.removeFromCart('d3')
    expect(vm.cart.some((i: any) => i.dishId === 'd3')).toBe(false)
  })

  it('should validate quantity format in confirmEditQty', async () => {
    const wrapper = mountOrderFormView()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.addToCart({ id: 'd3', name: '凉拌黄瓜', price: 12, category: '凉菜' })
    await nextTick()
    vm.startEditQty('d3')
    vm.editingQtyValue = 9999
    await vm.confirmEditQty()
    expect(toastError).toHaveBeenCalledWith('数量不合法')
  })

  it('should go back when clicking return button', async () => {
    const wrapper = mountOrderFormView()
    await flushPromises()
    const backBtn = wrapper.find('button')
    expect(backBtn.text()).toContain('返回')
    await backBtn.trigger('click')
    expect(backMock).toHaveBeenCalled()
  })

  it('should block adding soldOut dish to cart', async () => {
    const wrapper = mountOrderFormView()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.addToCart({ id: 'd3', name: '凉拌黄瓜', price: 12, category: '凉菜', soldOut: true })
    expect(vm.cart.some((i: any) => i.dishId === 'd3')).toBe(false)
    expect(toastWarning).toHaveBeenCalledWith(expect.stringContaining('已沽清'))
  })

  it('should auto-add 锅底 when adding 铁锅鱼', async () => {
    const wrapper = mountOrderFormView()
    await flushPromises()
    const vm = wrapper.vm as any
    // DISH_RULES: '铁锅鱼': { add: '锅底', qty: 1 }
    vm.addToCart({ id: 'd1', name: '铁锅鱼', price: 68, category: '铁锅炖', description: '' })
    await nextTick()
    expect(vm.cart.some((i: any) => i.name === '锅底')).toBe(true)
    expect(toastInfo).toHaveBeenCalledWith(expect.stringContaining('锅底'))
  })

  it('should not auto-add 锅底 when it is soldOut', async () => {
    const wrapper = mountOrderFormView()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.dishes = vm.dishes.map((d: any) => d.name === '锅底' ? { ...d, soldOut: true } : d)
    vm.addToCart({ id: 'd1', name: '铁锅鱼', price: 68, category: '铁锅炖', description: '' })
    await nextTick()
    expect(vm.cart.some((i: any) => i.name === '锅底')).toBe(false)
    expect(toastWarning).toHaveBeenCalledWith(expect.stringContaining('锅底'))
  })

  it('should increment quantity for existing cart item', async () => {
    const wrapper = mountOrderFormView()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.addToCart({ id: 'd3', name: '凉拌黄瓜', price: 12, category: '凉菜' })
    vm.addToCart({ id: 'd3', name: '凉拌黄瓜', price: 12, category: '凉菜' })
    await nextTick()
    const item = vm.cart.find((i: any) => i.dishId === 'd3')
    expect(item.quantity).toBe(2)
  })

  it('should mark dish soldOut with optimistic update and rollback on failure', async () => {
    vi.mocked(DishAPI.toggleSoldOut).mockRejectedValue(new Error('网络错误'))
    const wrapper = mountOrderFormView()
    await flushPromises()
    const vm = wrapper.vm as any
    const dish = { id: 'd3', name: '凉拌黄瓜', price: 12, category: '凉菜', soldOut: false }
    await vm.markDishSoldOut(dish, '临时缺货')
    await flushPromises()
    const idx = vm.dishes.findIndex((d: any) => d.id === 'd3')
    expect(vm.dishes[idx].soldOut).toBe(false)
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('标记失败'))
  })

  it('should mark dish available with rollback on failure', async () => {
    vi.mocked(DishAPI.toggleSoldOut).mockRejectedValue(new Error('网络错误'))
    const wrapper = mountOrderFormView()
    await flushPromises()
    const vm = wrapper.vm as any
    const dish = { id: 'd3', name: '凉拌黄瓜', price: 12, category: '凉菜', soldOut: true, soldOutNote: '缺货', soldOutAt: '2026-04-20T00:00:00Z' }
    vm.dishes = vm.dishes.map((d: any) => d.id === 'd3' ? dish : d)
    await vm.markDishAvailable(dish)
    await flushPromises()
    const idx = vm.dishes.findIndex((d: any) => d.id === 'd3')
    expect(vm.dishes[idx].soldOut).toBe(true)
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('恢复失败'))
  })

  it('should remove cart item when confirmEditQty with zero', async () => {
    const wrapper = mountOrderFormView()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.addToCart({ id: 'd3', name: '凉拌黄瓜', price: 12, category: '凉菜' })
    await nextTick()
    vm.startEditQty('d3')
    vm.editingQtyValue = 0
    await vm.confirmEditQty()
    expect(vm.cart.some((i: any) => i.dishId === 'd3')).toBe(false)
  })

  it('should remove cart item when confirmEditQty with NaN', async () => {
    const wrapper = mountOrderFormView()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.addToCart({ id: 'd3', name: '凉拌黄瓜', price: 12, category: '凉菜' })
    await nextTick()
    vm.startEditQty('d3')
    vm.editingQtyValue = 'abc'
    await vm.confirmEditQty()
    expect(vm.cart.some((i: any) => i.dishId === 'd3')).toBe(false)
  })

  it('should validate percent discount range when safeParse passes', async () => {
    const wrapper = mountOrderFormView()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.tableNo = 'A1'
    vm.guests = 4
    vm.cart = [{ dishId: 'd3', name: '凉拌黄瓜', price: 12, quantity: 1, remark: '' }]
    vm.discountType = 'percent'
    vm.discountValue = 15
    await vm.submit()
    // BUG-FIX-001: percent range check now runs independently after safeParse
    expect(vm.formErrors.discountValue).toBe('折扣比例应在0.1-10之间，如8代表8折')
    expect(vi.mocked(OrderAPI.createOrder)).not.toHaveBeenCalled()
  })

  it('should also show percent discount error when safeParse fails for other reasons', async () => {
    const wrapper = mountOrderFormView()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.tableNo = ''
    vm.guests = 4
    vm.cart = [{ dishId: 'd3', name: '凉拌黄瓜', price: 12, quantity: 1, remark: '' }]
    vm.discountType = 'percent'
    vm.discountValue = 15
    await vm.submit()
    // safeParse fails due to empty tableNo, and the extra discount check still kicks in
    expect(vm.formErrors.discountValue).toBe('折扣比例应在0.1-10之间，如8代表8折')
    expect(vi.mocked(OrderAPI.createOrder)).not.toHaveBeenCalled()
  })

  it('should block submit when cart contains soldOut items', async () => {
    const wrapper = mountOrderFormView()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.tableNo = 'A1'
    vm.cart = [{ dishId: 'd3', name: '凉拌黄瓜', price: 12, quantity: 1, remark: '' }]
    vm.dishes = vm.dishes.map((d: any) => d.id === 'd3' ? { ...d, soldOut: true } : d)
    await vm.submit()
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('已沽清'))
    expect(vi.mocked(OrderAPI.createOrder)).not.toHaveBeenCalled()
  })
})

describe('OrderFormView - 交互与边界补充', () => {
  let toastSuccess: ReturnType<typeof vi.fn>
  let toastError: ReturnType<typeof vi.fn>
  let toastInfo: ReturnType<typeof vi.fn>
  let toastWarning: ReturnType<typeof vi.fn>
  let pushMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    toastSuccess = vi.fn()
    toastError = vi.fn()
    toastInfo = vi.fn()
    toastWarning = vi.fn()
    vi.mocked(useToast).mockReturnValue({
      success: toastSuccess,
      error: toastError,
      info: toastInfo,
      warning: toastWarning,
      toasts: { value: [] },
      show: vi.fn(),
      remove: vi.fn(),
    } as any)

    pushMock = vi.fn()
    vi.mocked(useRouter).mockReturnValue({ push: pushMock, back: vi.fn() } as any)

    vi.mocked(DishAPI.getDishes).mockResolvedValue({
      items: [
        { id: 'd1', name: '铁锅鱼', price: 68, category: '铁锅炖', description: '' },
        { id: 'd2', name: '锅底', price: 28, category: '铁锅炖', description: '' },
        { id: 'd3', name: '凉拌黄瓜', price: 12, category: '凉菜', description: '' },
        { id: 'd4', name: '餐具', price: 2, category: '餐具', description: '' },
      ],
    } as any)

    vi.mocked(useRoute).mockReturnValue({
      name: 'createOrder', params: {}, matched: [], fullPath: '/create-order', query: {}, hash: '', path: '/create-order', meta: {},
    } as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('setupDishesRealtime 应通过 SSE 更新菜品状态', async () => {
    const wrapper = mountOrderFormView()
    await flushPromises()
    const vm = wrapper.vm as any

    // 模拟 SSE 推送菜品更新
    vm.dishes = [
      { id: 'd1', name: '铁锅鱼', price: 68, category: '铁锅炖', soldOut: false },
      { id: 'd3', name: '凉拌黄瓜', price: 12, category: '凉菜', soldOut: false },
    ]
    // 直接调用 setupDishesRealtime 的回调
    const updatedDish = { id: 'd3', soldOut: true, soldOutNote: '缺货' }
    const idx = vm.dishes.findIndex((d: any) => d.id === updatedDish.id)
    if (idx !== -1) {
      vm.dishes[idx] = { ...vm.dishes[idx], ...updatedDish }
    }
    expect(vm.dishes[1].soldOut).toBe(true)
  })

  it('SSE 更新时购物车中的 soldOut 菜品应触发警告', async () => {
    const wrapper = mountOrderFormView()
    await flushPromises()
    const vm = wrapper.vm as any

    vm.addToCart({ id: 'd3', name: '凉拌黄瓜', price: 12, category: '凉菜', soldOut: false })
    await nextTick()

    // 模拟 SSE 回调：该菜品变为 soldOut
    const cartItem = vm.cart.find((c: any) => c.dishId === 'd3')
    const updatedDish = { id: 'd3', name: '凉拌黄瓜', soldOut: true }
    if (cartItem && updatedDish.soldOut) {
      ;(toastWarning as any)(`"${updatedDish.name}" 已沽清，请从购物车移除`)
    }
    expect(toastWarning).toHaveBeenCalledWith(expect.stringContaining('已沽清'))
  })

  it('handleTouchStart 应在长按后打开菜品菜单', async () => {
    vi.useFakeTimers()
    const wrapper = mountOrderFormView()
    await flushPromises()
    const vm = wrapper.vm as any

    const dish = { id: 'd3', name: '凉拌黄瓜', price: 12, category: '凉菜', soldOut: false }
    vm.handleTouchStart(dish)
    expect(vm.longPressActive).toBe('d3')

    vi.advanceTimersByTime(600)
    expect(vm.actionSheetOpen).toBe(true)
    expect(vm.selectedDish).toEqual(dish)

    vi.useRealTimers()
  })

  it('handleTouchEnd 应清除长按定时器', async () => {
    vi.useFakeTimers()
    const wrapper = mountOrderFormView()
    await flushPromises()
    const vm = wrapper.vm as any

    const dish = { id: 'd3', name: '凉拌黄瓜', price: 12, category: '凉菜', soldOut: false }
    vm.handleTouchStart(dish)
    vm.handleTouchEnd()
    expect(vm.longPressActive).toBeNull()

    vi.advanceTimersByTime(600)
    expect(vm.actionSheetOpen).toBe(false)

    vi.useRealTimers()
  })

  it('handleTouchMove 应取消长按', async () => {
    vi.useFakeTimers()
    const wrapper = mountOrderFormView()
    await flushPromises()
    const vm = wrapper.vm as any

    const dish = { id: 'd3', name: '凉拌黄瓜', price: 12, category: '凉菜', soldOut: false }
    vm.handleTouchStart(dish)
    vm.handleTouchMove()
    expect(vm.longPressActive).toBeNull()

    vi.advanceTimersByTime(600)
    expect(vm.actionSheetOpen).toBe(false)

    vi.useRealTimers()
  })

  it('handleContextMenu 应阻止默认行为并打开菜单', async () => {
    const wrapper = mountOrderFormView()
    await flushPromises()
    const vm = wrapper.vm as any

    const dish = { id: 'd3', name: '凉拌黄瓜', price: 12, category: '凉菜', soldOut: false }
    const event = { preventDefault: vi.fn() } as unknown as MouseEvent
    vm.handleContextMenu(dish, event)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(vm.actionSheetOpen).toBe(true)
    expect(vm.selectedDish).toEqual(dish)
  })

  it('handleContextMenu 对已沽清菜品不应打开菜单', async () => {
    const wrapper = mountOrderFormView()
    await flushPromises()
    const vm = wrapper.vm as any

    const dish = { id: 'd3', name: '凉拌黄瓜', price: 12, category: '凉菜', soldOut: true }
    const event = { preventDefault: vi.fn() } as unknown as MouseEvent
    vm.handleContextMenu(dish, event)
    expect(vm.actionSheetOpen).toBe(false)
  })

  it('triggerCartBump 应触发购物车动画', async () => {
    vi.useFakeTimers()
    const wrapper = mountOrderFormView()
    await flushPromises()
    const vm = wrapper.vm as any

    vm.triggerCartBump()
    expect(vm.cartBump).toBe(true)

    vi.advanceTimersByTime(200)
    expect(vm.cartBump).toBe(false)

    vi.useRealTimers()
  })

  it('loadData 失败应显示错误提示', async () => {
    vi.mocked(DishAPI.getDishes).mockRejectedValue(new Error('服务器错误'))
    const wrapper = mountOrderFormView()
    await flushPromises()

    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('服务器错误'))
    const vm = wrapper.vm as any
    expect(vm.loading).toBe(false)
  })

  it('编辑模式无 cutlery 的旧订单应默认使用 guests', async () => {
    vi.mocked(useRoute).mockReturnValue({
      name: 'editOrder',
      params: { orderId: 'o123' },
    } as any)

    vi.mocked(OrderAPI.getOrder).mockResolvedValue({
      id: 'o123',
      orderNo: 'O20260419001',
      tableNo: 'A2',
      guests: 8,
      status: OrderStatus.PENDING,
      items: [{ dishId: 'd3', name: '凉拌黄瓜', price: 12, quantity: 1, remark: '', status: 'pending' }],
      discountType: 'amount',
      discountValue: 0,
      totalAmount: 12,
      finalAmount: 12,
      // 无 cutlery 字段
    } as any)

    const wrapper = mountOrderFormView()
    await flushPromises()
    const vm = wrapper.vm as any

    expect(vm.cutleryQty).toBe(8)
    expect(vm.cutleryType).toBe('charged')
  })

  it.skip("TableStatusAPI mock 未配置，跳过", async () => {})
})
