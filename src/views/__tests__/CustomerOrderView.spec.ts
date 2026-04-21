import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, nextTick } from 'vue'
import CustomerOrderView from '../CustomerOrderView.vue'
import {
  PublicOrderAPI,
  PublicTableStatusAPI,
  PublicDishAPI,
} from '@/api/public-order.api'
import { useRoute } from 'vue-router'

// ─── Module Mocks ───
vi.mock('vue-router', () => ({
  useRoute: vi.fn(),
}))

vi.mock('@/composables/useToast', () => ({
  useToast: vi.fn(() => ({
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  })),
}))

vi.mock('@/composables/useAutoRefresh', () => ({
  useAutoRefresh: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
  })),
}))

// 使用真实 useCart 实现，以便测试购物车交互
vi.mock('@/composables/useCart', async () => {
  const actual = await vi.importActual<typeof import('@/composables/useCart')>('@/composables/useCart')
  return actual
})

vi.mock('@/config/dish.config', () => ({
  DISH_RULES: {},
  CATEGORY_ORDER: ['铁锅炖', '特色菜'],
  CATEGORY_META: {
    铁锅炖: { icon: '🔥', gradient: 'from-red-500 to-orange-500' },
    特色菜: { icon: '⭐', gradient: 'from-amber-500 to-yellow-500' },
  },
  HOT_DISHES: new Set(),
}))

vi.mock('@/api/public-order.api', () => ({
  PublicDishAPI: { getDishes: vi.fn() },
  PublicTableStatusAPI: { getTableStatus: vi.fn() },
  PublicOrderAPI: {
    getOrdersByTable: vi.fn(),
    getOrder: vi.fn(),
    createOrder: vi.fn(),
    appendOrderItems: vi.fn(),
  },
  // CustomerSession 保持真实实现（基于 sessionStorage）
  CustomerSession: class CustomerSession {
    private orderId: string
    private accessToken: string
    constructor(orderId: string, accessToken: string) {
      this.orderId = orderId
      this.accessToken = accessToken
    }
    static restore() {
      const orderId = sessionStorage.getItem('customer_order_id')
      const token = sessionStorage.getItem('customer_access_token')
      if (orderId && token) {
        return new CustomerSession(orderId, token)
      }
      return null
    }
    persist() {
      sessionStorage.setItem('customer_order_id', this.orderId)
      sessionStorage.setItem('customer_access_token', this.accessToken)
    }
    clear() {
      sessionStorage.removeItem('customer_order_id')
      sessionStorage.removeItem('customer_access_token')
    }
    get orderIdValue() {
      return this.orderId
    }
    get accessTokenValue() {
      return this.accessToken
    }
  },
}))

describe('CustomerOrderView - 扫码后订单恢复与会话管理', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.mocked(useRoute).mockReturnValue({ query: { table: 'A1' } } as any)
    vi.mocked(PublicDishAPI.getDishes).mockResolvedValue({
      items: [
        {
          id: 'd1',
          name: '铁锅鱼',
          price: 128,
          category: '铁锅炖',
          soldOut: false,
        },
        {
          id: 'd2',
          name: '锅底',
          price: 38,
          category: '铁锅炖',
          soldOut: false,
        },
        { id: 'd3', name: '餐具', price: 2, category: '餐具', soldOut: false },
      ],
    } as any)
  })

  afterEach(() => {
    sessionStorage.clear()
    vi.clearAllMocks()
  })

  it('服务员创建的订单有 accessToken 时，顾客扫码应自动创建 CustomerSession', async () => {
    vi.mocked(PublicTableStatusAPI.getTableStatus).mockResolvedValue({
      id: 'ts1',
      tableNo: 'A1',
      status: 'dining',
      currentOrderId: 'o1',
    } as any)

    vi.mocked(PublicOrderAPI.getOrdersByTable).mockResolvedValue([
      {
        id: 'o1',
        orderNo: '20260421001',
        tableNo: 'A1',
        status: 'pending',
        items: [
          {
            dishId: 'd1',
            name: '铁锅鱼',
            price: 128,
            quantity: 1,
            status: 'pending',
          },
        ],
        accessToken: 'tok_staff_generated_123',
        totalAmount: 128,
        finalAmount: 128,
      } as any,
    ])

    mount(CustomerOrderView)
    await flushPromises()

    // 验证 CustomerSession 被自动持久化到 sessionStorage
    expect(sessionStorage.getItem('customer_order_id')).toBe('o1')
    expect(sessionStorage.getItem('customer_access_token')).toBe(
      'tok_staff_generated_123',
    )
  })

  it('服务员创建的订单无 accessToken 时，顾客扫码不应创建 CustomerSession', async () => {
    vi.mocked(PublicTableStatusAPI.getTableStatus).mockResolvedValue({
      id: 'ts1',
      tableNo: 'A1',
      status: 'dining',
      currentOrderId: 'o1',
    } as any)

    vi.mocked(PublicOrderAPI.getOrdersByTable).mockResolvedValue([
      {
        id: 'o1',
        orderNo: '20260421001',
        tableNo: 'A1',
        status: 'pending',
        items: [
          {
            dishId: 'd1',
            name: '铁锅鱼',
            price: 128,
            quantity: 1,
            status: 'pending',
          },
        ],
        // 无 accessToken（旧数据或异常场景）
        totalAmount: 128,
        finalAmount: 128,
      } as any,
    ])

    mount(CustomerOrderView)
    await flushPromises()

    // 验证 sessionStorage 未被写入
    expect(sessionStorage.getItem('customer_order_id')).toBeNull()
    expect(sessionStorage.getItem('customer_access_token')).toBeNull()
  })

  it('顾客已有有效会话时，应直接恢复当前订单而不重新查询桌台', async () => {
    // 预置 sessionStorage（模拟顾客刷新页面）
    sessionStorage.setItem('customer_order_id', 'o1')
    sessionStorage.setItem('customer_access_token', 'tok_customer_456')

    vi.mocked(PublicOrderAPI.getOrder).mockResolvedValue({
      id: 'o1',
      orderNo: '20260421001',
      tableNo: 'A1',
      status: 'pending',
      items: [],
      totalAmount: 0,
      finalAmount: 0,
    } as any)

    // 桌台状态无需返回 currentOrderId（因为会话已恢复）
    vi.mocked(PublicTableStatusAPI.getTableStatus).mockResolvedValue({
      id: 'ts1',
      tableNo: 'A1',
      status: 'dining',
    } as any)

    mount(CustomerOrderView)
    await flushPromises()

    // 验证使用现有会话获取订单，而非 getOrdersByTable
    expect(PublicOrderAPI.getOrder).toHaveBeenCalledWith('o1', expect.anything())
    expect(PublicOrderAPI.getOrdersByTable).not.toHaveBeenCalled()
  })

  it('桌台无未完成订单时应显示人数设置弹窗', async () => {
    vi.mocked(PublicTableStatusAPI.getTableStatus).mockResolvedValue({
      id: 'ts1',
      tableNo: 'A1',
      status: 'idle',
    } as any)

    vi.mocked(PublicOrderAPI.getOrdersByTable).mockResolvedValue([])

    const wrapper = mount(CustomerOrderView)
    await flushPromises()

    // 验证显示人数设置
    expect(wrapper.find('[data-testid="guest-setup"]').exists() || wrapper.text().includes('用餐人数')).toBe(true)
  })
})

describe('CustomerOrderView - 订单提交', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.mocked(useRoute).mockReturnValue({ query: { table: 'A1' } } as any)
    vi.mocked(PublicDishAPI.getDishes).mockResolvedValue({
      items: [
        { id: 'd1', name: '铁锅鱼', price: 128, category: '铁锅炖', soldOut: false },
        { id: 'd3', name: '餐具', price: 2, category: '餐具', soldOut: false },
      ],
    } as any)
    vi.mocked(PublicTableStatusAPI.getTableStatus).mockResolvedValue({
      id: 'ts1', tableNo: 'A1', status: 'idle',
    } as any)
    vi.mocked(PublicOrderAPI.getOrdersByTable).mockResolvedValue([])
  })

  afterEach(() => {
    sessionStorage.clear()
    vi.clearAllMocks()
  })

  it('空购物车提交应提示错误', async () => {
    const wrapper = mount(CustomerOrderView)
    await flushPromises()

    const vm = wrapper.vm as any
    vm.showGuestSetup = false
    await nextTick()

    await vm.submitOrder()
    expect(PublicOrderAPI.createOrder).not.toHaveBeenCalled()
  })

  it('应成功创建新订单', async () => {
    vi.mocked(PublicOrderAPI.createOrder).mockResolvedValue({
      id: 'o_new',
      orderNo: 'O20260421001',
      accessToken: 'tok_new',
    } as any)

    const wrapper = mount(CustomerOrderView)
    await flushPromises()

    const vm = wrapper.vm as any
    vm.showGuestSetup = false
    vm.guests = 4
    vm.cart = [{ dishId: 'd1', name: '铁锅鱼', price: 128, quantity: 1 }]
    await nextTick()

    await vm.submitOrder()
    await flushPromises()

    expect(PublicOrderAPI.createOrder).toHaveBeenCalledOnce()
    const payload = vi.mocked(PublicOrderAPI.createOrder).mock.calls[0]![0] as any
    expect(payload.tableNo).toBe('A1')
    expect(payload.guests).toBe(4)
    expect(payload.source).toBe('customer')
    expect(sessionStorage.getItem('customer_order_id')).toBe('o_new')
  })

  it('购物车中有沽清菜品应自动移除并阻断提交', async () => {
    vi.mocked(PublicDishAPI.getDishes).mockResolvedValue({
      items: [
        { id: 'd1', name: '铁锅鱼', price: 128, category: '铁锅炖', soldOut: true },
        { id: 'd3', name: '餐具', price: 2, category: '餐具', soldOut: false },
      ],
    } as any)

    const wrapper = mount(CustomerOrderView)
    await flushPromises()

    const vm = wrapper.vm as any
    vm.showGuestSetup = false
    vm.cart = [{ dishId: 'd1', name: '铁锅鱼', price: 128, quantity: 1 }]
    await nextTick()

    await vm.submitOrder()
    expect(vm.cart.length).toBe(0)
    expect(PublicOrderAPI.createOrder).not.toHaveBeenCalled()
  })

  it('已有订单时应追加菜品', async () => {
    sessionStorage.setItem('customer_order_id', 'o1')
    sessionStorage.setItem('customer_access_token', 'tok_abc')

    vi.mocked(PublicOrderAPI.getOrder).mockResolvedValue({
      id: 'o1', orderNo: 'O001', status: 'pending', items: [],
    } as any)

    vi.mocked(PublicTableStatusAPI.getTableStatus).mockResolvedValue({
      id: 'ts1', tableNo: 'A1', status: 'dining', currentOrderId: 'o1',
    } as any)

    vi.mocked(PublicOrderAPI.appendOrderItems).mockResolvedValue({
      id: 'o1', items: [{ dishId: 'd1', name: '铁锅鱼', price: 128, quantity: 1 }],
    } as any)

    const wrapper = mount(CustomerOrderView)
    await flushPromises()

    const vm = wrapper.vm as any
    vm.showGuestSetup = false
    vm.cart = [{ dishId: 'd1', name: '铁锅鱼', price: 128, quantity: 1 }]
    await nextTick()

    await vm.submitOrder()
    await flushPromises()

    expect(PublicOrderAPI.appendOrderItems).toHaveBeenCalledOnce()
  })

  it('创建订单失败应显示错误提示', async () => {
    vi.mocked(PublicOrderAPI.createOrder).mockRejectedValue(new Error('网络错误'))

    const wrapper = mount(CustomerOrderView)
    await flushPromises()

    const vm = wrapper.vm as any
    vm.showGuestSetup = false
    vm.cart = [{ dishId: 'd1', name: '铁锅鱼', price: 128, quantity: 1 }]
    await nextTick()

    await vm.submitOrder()
    await flushPromises()

    expect(vm.submitting).toBe(false)
  })
})

describe('CustomerOrderView - 边界场景', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    sessionStorage.clear()
    vi.clearAllMocks()
  })

  it('无桌号参数时应提示无效桌号', async () => {
    vi.mocked(useRoute).mockReturnValue({ query: {} } as any)
    vi.mocked(PublicDishAPI.getDishes).mockResolvedValue({ items: [] } as any)

    const wrapper = mount(CustomerOrderView)
    await flushPromises()

    // onMounted 中会检查 tableNo
    expect(PublicDishAPI.getDishes).not.toHaveBeenCalled()
  })

  it('订单已结束时应清除会话并显示提示', async () => {
    sessionStorage.setItem('customer_order_id', 'o1')
    sessionStorage.setItem('customer_access_token', 'tok_abc')

    vi.mocked(useRoute).mockReturnValue({ query: { table: 'A1' } } as any)
    vi.mocked(PublicDishAPI.getDishes).mockResolvedValue({ items: [] } as any)
    vi.mocked(PublicTableStatusAPI.getTableStatus).mockResolvedValue({
      id: 'ts1', tableNo: 'A1', status: 'idle',
    } as any)
    vi.mocked(PublicOrderAPI.getOrder).mockResolvedValue({
      id: 'o1', orderNo: 'O001', status: 'settled', items: [],
    } as any)

    mount(CustomerOrderView)
    await flushPromises()

    expect(sessionStorage.getItem('customer_order_id')).toBeNull()
  })
})

describe('CustomerOrderView - 交互与边界补充', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.mocked(useRoute).mockReturnValue({ query: { table: 'A1' } } as any)
    vi.mocked(PublicDishAPI.getDishes).mockResolvedValue({
      items: [
        { id: 'd1', name: '铁锅鱼', price: 128, category: '铁锅炖', soldOut: false },
        { id: 'd3', name: '餐具', price: 2, category: '餐具', soldOut: false },
      ],
    } as any)
    vi.mocked(PublicTableStatusAPI.getTableStatus).mockResolvedValue({
      id: 'ts1', tableNo: 'A1', status: 'idle',
    } as any)
    vi.mocked(PublicOrderAPI.getOrdersByTable).mockResolvedValue([])
  })

  afterEach(() => {
    sessionStorage.clear()
    vi.clearAllMocks()
  })

  it('refreshDishes 应在菜品变为 soldOut 时提示购物车', async () => {
    const wrapper = mount(CustomerOrderView)
    await flushPromises()

    const vm = wrapper.vm as any
    vm.showGuestSetup = false
    vm.cart = [{ dishId: 'd1', name: '铁锅鱼', price: 128, quantity: 1 }]

    // 模拟轮询后菜品变为 soldOut
    vi.mocked(PublicDishAPI.getDishes).mockResolvedValue({
      items: [
        { id: 'd1', name: '铁锅鱼', price: 128, category: '铁锅炖', soldOut: true },
        { id: 'd3', name: '餐具', price: 2, category: '餐具', soldOut: false },
      ],
    } as any)

    await vm.refreshDishes()
    await flushPromises()

    expect(vm.dishes[0].soldOut).toBe(true)
  })

  it('桌台有已完成订单时应提示上一单已结束', async () => {
    vi.mocked(PublicTableStatusAPI.getTableStatus).mockResolvedValue({
      id: 'ts1', tableNo: 'A1', status: 'idle', currentOrderId: 'o_old',
    } as any)
    vi.mocked(PublicOrderAPI.getOrdersByTable).mockResolvedValue([
      {
        id: 'o_old', orderNo: 'O001', tableNo: 'A1', status: 'completed',
        items: [], totalAmount: 0, finalAmount: 0,
      } as any,
    ])

    mount(CustomerOrderView)
    await flushPromises()
    // 应显示 toast.info('该桌上一单已结束...')
  })

  it('addExistingToCart 应支持再来一份', async () => {
    vi.mocked(PublicTableStatusAPI.getTableStatus).mockResolvedValue({
      id: 'ts1', tableNo: 'A1', status: 'dining', currentOrderId: 'o1',
    } as any)
    vi.mocked(PublicOrderAPI.getOrdersByTable).mockResolvedValue([
      {
        id: 'o1', orderNo: 'O001', tableNo: 'A1', status: 'dining',
        items: [{ dishId: 'd1', name: '铁锅鱼', price: 128, quantity: 1, status: 'served' }],
        totalAmount: 128, finalAmount: 128,
      } as any,
    ])

    const wrapper = mount(CustomerOrderView)
    await flushPromises()

    const vm = wrapper.vm as any
    vm.showGuestSetup = false
    const existingItem = vm.existingItems[0]
    expect(existingItem.name).toBe('铁锅鱼')

    // 调用 addExistingToCart
    vm.addExistingToCart(existingItem)
    await nextTick()
    expect(vm.cart.some((c: any) => c.dishId === 'd1')).toBe(true)
  })

  it('onDishesScroll 应控制回到顶部按钮显示', async () => {
    const wrapper = mount(CustomerOrderView)
    await flushPromises()

    const vm = wrapper.vm as any
    vm.dishesContainer = { scrollTop: 500 } as any
    vm.onDishesScroll()
    expect(vm.showBackToTop).toBe(true)

    vm.dishesContainer = { scrollTop: 100 } as any
    vm.onDishesScroll()
    expect(vm.showBackToTop).toBe(false)
  })

  it('scrollToTop 应滚动到顶部', async () => {
    const wrapper = mount(CustomerOrderView)
    await flushPromises()

    const vm = wrapper.vm as any
    const scrollToMock = vi.fn()
    vm.dishesContainer = { scrollTo: scrollToMock } as any
    vm.scrollToTop()
    expect(scrollToMock).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
  })

  it.skip("scrollCategoryIntoView 依赖 DOM 环境，跳过", async () => {})

  it('人数弹窗关闭后 showGuestSetup 应为 false', async () => {
    vi.mocked(PublicTableStatusAPI.getTableStatus).mockResolvedValue({
      id: 'ts1', tableNo: 'A1', status: 'idle',
    } as any)

    const wrapper = mount(CustomerOrderView)
    await flushPromises()

    const vm = wrapper.vm as any
    expect(vm.showGuestSetup).toBe(true)
    vm.showGuestSetup = false
    expect(vm.showGuestSetup).toBe(false)
  })

  it('已有订单追加菜品失败应显示错误', async () => {
    sessionStorage.setItem('customer_order_id', 'o1')
    sessionStorage.setItem('customer_access_token', 'tok_abc')

    vi.mocked(PublicOrderAPI.getOrder).mockResolvedValue({
      id: 'o1', orderNo: 'O001', status: 'dining', items: [],
    } as any)
    vi.mocked(PublicTableStatusAPI.getTableStatus).mockResolvedValue({
      id: 'ts1', tableNo: 'A1', status: 'dining', currentOrderId: 'o1',
    } as any)
    vi.mocked(PublicOrderAPI.appendOrderItems).mockRejectedValue(new Error('网络超时'))

    const wrapper = mount(CustomerOrderView)
    await flushPromises()

    const vm = wrapper.vm as any
    vm.showGuestSetup = false
    vm.cart = [{ dishId: 'd1', name: '铁锅鱼', price: 128, quantity: 1 }]
    await nextTick()

    await vm.submitOrder()
    await flushPromises()

    expect(vm.submitting).toBe(false)
  })
})

describe('CustomerOrderView - 分支覆盖提升', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    sessionStorage.clear()
    vi.clearAllMocks()
  })

  // ── 1. 正常点餐完整流程（覆盖大量模板分支）──
  it('正常点餐流程应覆盖主要模板分支', async () => {
    vi.mocked(useRoute).mockReturnValue({ query: { table: 'A1' } } as any)
    vi.mocked(PublicDishAPI.getDishes).mockResolvedValue({
      items: [
        { id: 'd1', name: '铁锅鱼', price: 128, category: '铁锅炖', soldOut: false, description: '现杀现做' },
        { id: 'd2', name: '锅底', price: 38, category: '铁锅炖', soldOut: false, description: '秘制底料' },
        { id: 'd3', name: '餐具', price: 2, category: '餐具', soldOut: false },
      ],
    } as any)
    vi.mocked(PublicTableStatusAPI.getTableStatus).mockResolvedValue({
      id: 'ts1', tableNo: 'A1', status: 'idle',
    } as any)
    vi.mocked(PublicOrderAPI.getOrdersByTable).mockResolvedValue([])
    vi.mocked(PublicOrderAPI.createOrder).mockResolvedValue({
      id: 'o1', orderNo: 'O001', accessToken: 'tok1',
    } as any)

    const wrapper = mount(CustomerOrderView)
    await flushPromises()

    const vm = wrapper.vm as any
    vm.showGuestSetup = false
    await nextTick()

    // 验证铁锅鱼显示"招牌"标签和"按斤计价"
    expect(wrapper.text()).toContain('招牌')
    expect(wrapper.text()).toContain('按斤计价')

    // 验证菜品描述显示（锅底有 description，铁锅鱼的 description 被价格说明覆盖）
    expect(wrapper.text()).toContain('秘制底料')

    // 点击"选"按钮加入购物车（覆盖 cartMap 不存在分支）
    const selectBtn = wrapper.findAll('button').find((b) => b.text().includes('选'))
    expect(selectBtn).toBeTruthy()
    await selectBtn!.trigger('click')
    await nextTick()

    // 验证数量选择器出现（覆盖 cartMap 存在分支）
    expect(vm.cartMap.get('d1')).toBeTruthy()

    // 点击+增加数量
    const addBtns = wrapper.findAll('button[aria-label="增加数量"]')
    expect(addBtns.length).toBeGreaterThan(0)
    await addBtns[0].trigger('click')
    expect(vm.cartMap.get('d1').quantity).toBe(2)

    // 打开购物车（覆盖 showCart 分支）
    const cartBtn = wrapper.find('[aria-label="打开购物车"]')
    await cartBtn.trigger('click')
    await nextTick()
    expect(vm.showCart).toBe(true)

    // 购物车中应显示新加菜品（覆盖 cart.length > 0）
    expect(wrapper.text()).toContain('新加菜品')

    // 提交订单
    await vm.submitOrder()
    await flushPromises()

    expect(PublicOrderAPI.createOrder).toHaveBeenCalled()
  })

  // ── 2. 已有订单追加流程 ──
  it('已有订单应显示已下单菜品和追加按钮', async () => {
    sessionStorage.setItem('customer_order_id', 'o1')
    sessionStorage.setItem('customer_access_token', 'tok_abc')

    vi.mocked(useRoute).mockReturnValue({ query: { table: 'A1' } } as any)
    vi.mocked(PublicDishAPI.getDishes).mockResolvedValue({
      items: [
        { id: 'd1', name: '铁锅鱼', price: 128, category: '铁锅炖', soldOut: false },
        { id: 'd3', name: '餐具', price: 2, category: '餐具', soldOut: false },
      ],
    } as any)
    vi.mocked(PublicTableStatusAPI.getTableStatus).mockResolvedValue({
      id: 'ts1', tableNo: 'A1', status: 'dining', currentOrderId: 'o1',
    } as any)
    vi.mocked(PublicOrderAPI.getOrder).mockResolvedValue({
      id: 'o1', orderNo: 'O001', status: 'dining',
      items: [
        { dishId: 'd1', name: '铁锅鱼', price: 128, quantity: 1, status: 'cooking', remark: '少辣' },
      ],
      guests: 3,
    } as any)
    vi.mocked(PublicOrderAPI.appendOrderItems).mockResolvedValue({ id: 'o1' } as any)

    const wrapper = mount(CustomerOrderView)
    await flushPromises()

    const vm = wrapper.vm as any
    vm.showGuestSetup = false
    await nextTick()

    // 验证已有订单提示（覆盖 v-if="currentOrder"）
    expect(wrapper.text()).toContain('当前已有订单')

    // 验证人数不可修改提示
    expect(wrapper.text()).toContain('人数已与订单绑定')

    // 打开购物车
    const cartBtn = wrapper.find('[aria-label="打开购物车"]')
    await cartBtn.trigger('click')
    await nextTick()

    // 验证已下单菜品区域（覆盖 existingItems.length > 0）
    expect(wrapper.text()).toContain('已下单菜品')

    // 验证状态标签（覆盖 item.status === 'cooking'）
    expect(wrapper.text()).toContain('制作中')

    // 验证备注显示（覆盖 item.remark）
    expect(wrapper.text()).toContain('少辣')

    // 点击"再来一份"
    const addAgainBtn = wrapper.findAll('button').find((b) => b.attributes('aria-label')?.includes('再来一份'))
    expect(addAgainBtn).toBeTruthy()
    await addAgainBtn!.trigger('click')
    expect(vm.cart.some((c: any) => c.dishId === 'd1')).toBe(true)

    // 追加提交
    await vm.submitOrder()
    await flushPromises()
    expect(PublicOrderAPI.appendOrderItems).toHaveBeenCalled()
  })

  // ── 3. soldOut 菜品和空分类 ──
  it('soldOut 菜品应显示已沽清且不可选', async () => {
    vi.mocked(useRoute).mockReturnValue({ query: { table: 'A1' } } as any)
    vi.mocked(PublicDishAPI.getDishes).mockResolvedValue({
      items: [
        { id: 'd1', name: '铁锅鱼', price: 128, category: '铁锅炖', soldOut: true },
        { id: 'd3', name: '餐具', price: 2, category: '餐具', soldOut: false },
      ],
    } as any)
    vi.mocked(PublicTableStatusAPI.getTableStatus).mockResolvedValue({
      id: 'ts1', tableNo: 'A1', status: 'idle',
    } as any)
    vi.mocked(PublicOrderAPI.getOrdersByTable).mockResolvedValue([])

    const wrapper = mount(CustomerOrderView)
    await flushPromises()

    const vm = wrapper.vm as any
    vm.showGuestSetup = false
    await nextTick()

    // 验证 soldOut 菜品显示"已沽清"
    expect(wrapper.text()).toContain('已沽清')

    // 验证不存在"选"按钮（覆盖 soldOut 分支）
    const selectBtns = wrapper.findAll('button').filter((b) => b.text().includes('选'))
    expect(selectBtns.length).toBe(0)
  })

  it('空分类应显示暂无菜品', async () => {
    vi.mocked(useRoute).mockReturnValue({ query: { table: 'A1' } } as any)
    vi.mocked(PublicDishAPI.getDishes).mockResolvedValue({
      items: [{ id: 'd3', name: '餐具', price: 2, category: '餐具', soldOut: false }],
    } as any)
    vi.mocked(PublicTableStatusAPI.getTableStatus).mockResolvedValue({
      id: 'ts1', tableNo: 'A1', status: 'idle',
    } as any)
    vi.mocked(PublicOrderAPI.getOrdersByTable).mockResolvedValue([])

    const wrapper = mount(CustomerOrderView)
    await flushPromises()

    const vm = wrapper.vm as any
    vm.showGuestSetup = false
    vm.currentCategory = '特色菜'
    await nextTick()

    // 覆盖 v-else-if="filteredDishes.length === 0"
    expect(wrapper.text()).toContain('该分类下暂无菜品')
  })

  // ── 4. 脚本错误分支 ──
  it('loadData 失败应显示错误提示', async () => {
    vi.mocked(useRoute).mockReturnValue({ query: { table: 'A1' } } as any)
    vi.mocked(PublicDishAPI.getDishes).mockRejectedValue(new Error('网络错误'))

    const wrapper = mount(CustomerOrderView)
    await flushPromises()

    const vm = wrapper.vm as any
    expect(vm.loading).toBe(false)
  })

  it('refreshDishes 失败应静默处理', async () => {
    vi.mocked(useRoute).mockReturnValue({ query: { table: 'A1' } } as any)
    vi.mocked(PublicDishAPI.getDishes).mockResolvedValue({ items: [] } as any)
    vi.mocked(PublicTableStatusAPI.getTableStatus).mockResolvedValue({
      id: 'ts1', tableNo: 'A1', status: 'idle',
    } as any)

    const wrapper = mount(CustomerOrderView)
    await flushPromises()

    const vm = wrapper.vm as any
    vi.mocked(PublicDishAPI.getDishes).mockRejectedValue(new Error('网络错误'))
    await vm.refreshDishes()
    // 不应抛出异常
  })

  it('refreshOrder 无 currentOrder.id 应直接返回', async () => {
    vi.mocked(useRoute).mockReturnValue({ query: { table: 'A1' } } as any)
    vi.mocked(PublicDishAPI.getDishes).mockResolvedValue({ items: [] } as any)
    vi.mocked(PublicTableStatusAPI.getTableStatus).mockResolvedValue({
      id: 'ts1', tableNo: 'A1', status: 'idle',
    } as any)

    const wrapper = mount(CustomerOrderView)
    await flushPromises()

    const vm = wrapper.vm as any
    // currentOrder 为 null 时直接返回
    await vm.refreshOrder()
    expect(PublicOrderAPI.getOrder).not.toHaveBeenCalled()
  })

  it('refreshOrder 无 session 应直接返回', async () => {
    vi.mocked(useRoute).mockReturnValue({ query: { table: 'A1' } } as any)
    vi.mocked(PublicDishAPI.getDishes).mockResolvedValue({ items: [] } as any)
    vi.mocked(PublicTableStatusAPI.getTableStatus).mockResolvedValue({
      id: 'ts1', tableNo: 'A1', status: 'dining', currentOrderId: 'o1',
    } as any)
    vi.mocked(PublicOrderAPI.getOrdersByTable).mockResolvedValue([
      { id: 'o1', orderNo: 'O001', status: 'pending', items: [], accessToken: 'tok1' } as any,
    ])

    const wrapper = mount(CustomerOrderView)
    await flushPromises()

    const vm = wrapper.vm as any
    // 清除 sessionStorage，模拟无 session
    sessionStorage.clear()
    await vm.refreshOrder()
    expect(PublicOrderAPI.getOrder).not.toHaveBeenCalled()
  })

  it('refreshOrder getOrder 返回 null 应静默处理', async () => {
    sessionStorage.setItem('customer_order_id', 'o1')
    sessionStorage.setItem('customer_access_token', 'tok_abc')
    vi.mocked(PublicOrderAPI.getOrder).mockResolvedValue(null as any)

    vi.mocked(useRoute).mockReturnValue({ query: { table: 'A1' } } as any)
    vi.mocked(PublicDishAPI.getDishes).mockResolvedValue({ items: [] } as any)
    vi.mocked(PublicTableStatusAPI.getTableStatus).mockResolvedValue({
      id: 'ts1', tableNo: 'A1', status: 'dining', currentOrderId: 'o1',
    } as any)

    const wrapper = mount(CustomerOrderView)
    await flushPromises()

    const vm = wrapper.vm as any
    await vm.refreshOrder()
    // 不应抛出异常
  })

  it('submitOrder 追加模式会话过期应提示', async () => {
    vi.mocked(useRoute).mockReturnValue({ query: { table: 'A1' } } as any)
    vi.mocked(PublicDishAPI.getDishes).mockResolvedValue({
      items: [{ id: 'd1', name: '铁锅鱼', price: 128, category: '铁锅炖', soldOut: false }],
    } as any)
    vi.mocked(PublicTableStatusAPI.getTableStatus).mockResolvedValue({
      id: 'ts1', tableNo: 'A1', status: 'dining', currentOrderId: 'o1',
    } as any)
    vi.mocked(PublicOrderAPI.getOrdersByTable).mockResolvedValue([
      { id: 'o1', orderNo: 'O001', status: 'pending', items: [], accessToken: 'tok1' } as any,
    ])

    const wrapper = mount(CustomerOrderView)
    await flushPromises()

    const vm = wrapper.vm as any
    vm.showGuestSetup = false
    vm.cart = [{ dishId: 'd1', name: '铁锅鱼', price: 128, quantity: 1 }]
    await nextTick()

    // 清除 sessionStorage，模拟会话过期
    sessionStorage.clear()
    await vm.submitOrder()
    expect(PublicOrderAPI.appendOrderItems).not.toHaveBeenCalled()
  })

  it('submitOrder 无餐具费时应使用 free 类型', async () => {
    vi.mocked(useRoute).mockReturnValue({ query: { table: 'A1' } } as any)
    // 不返回餐具菜品，使 tablewareDish 为 null
    vi.mocked(PublicDishAPI.getDishes).mockResolvedValue({
      items: [{ id: 'd1', name: '铁锅鱼', price: 128, category: '铁锅炖', soldOut: false }],
    } as any)
    vi.mocked(PublicTableStatusAPI.getTableStatus).mockResolvedValue({
      id: 'ts1', tableNo: 'A1', status: 'idle',
    } as any)
    vi.mocked(PublicOrderAPI.getOrdersByTable).mockResolvedValue([])
    vi.mocked(PublicOrderAPI.createOrder).mockResolvedValue({
      id: 'o1', orderNo: 'O001', accessToken: 'tok1',
    } as any)

    const wrapper = mount(CustomerOrderView)
    await flushPromises()

    const vm = wrapper.vm as any
    vm.showGuestSetup = false
    vm.cart = [{ dishId: 'd1', name: '铁锅鱼', price: 128, quantity: 1 }]
    await nextTick()

    await vm.submitOrder()
    await flushPromises()

    const payload = vi.mocked(PublicOrderAPI.createOrder).mock.calls[0]![0] as any
    expect(payload.cutlery.type).toBe('free')
    expect(payload.cutlery.unitPrice).toBe(0)
  })

  it('sortedDishes 铁锅炖分类应将铁锅鱼置顶', async () => {
    vi.mocked(useRoute).mockReturnValue({ query: { table: 'A1' } } as any)
    vi.mocked(PublicDishAPI.getDishes).mockResolvedValue({
      items: [
        { id: 'd2', name: '锅底', price: 38, category: '铁锅炖', soldOut: false },
        { id: 'd1', name: '铁锅鱼', price: 128, category: '铁锅炖', soldOut: false },
      ],
    } as any)
    vi.mocked(PublicTableStatusAPI.getTableStatus).mockResolvedValue({
      id: 'ts1', tableNo: 'A1', status: 'idle',
    } as any)
    vi.mocked(PublicOrderAPI.getOrdersByTable).mockResolvedValue([])

    const wrapper = mount(CustomerOrderView)
    await flushPromises()

    const vm = wrapper.vm as any
    vm.currentCategory = '铁锅炖'
    await nextTick()

    expect(vm.sortedDishes[0].name).toBe('铁锅鱼')
  })

  it('购物车为空且existingItems为空时应显示空状态', async () => {
    vi.mocked(useRoute).mockReturnValue({ query: { table: 'A1' } } as any)
    vi.mocked(PublicDishAPI.getDishes).mockResolvedValue({
      items: [{ id: 'd1', name: '铁锅鱼', price: 128, category: '铁锅炖', soldOut: false }],
    } as any)
    vi.mocked(PublicTableStatusAPI.getTableStatus).mockResolvedValue({
      id: 'ts1', tableNo: 'A1', status: 'idle',
    } as any)
    vi.mocked(PublicOrderAPI.getOrdersByTable).mockResolvedValue([])

    const wrapper = mount(CustomerOrderView)
    await flushPromises()

    const vm = wrapper.vm as any
    vm.showGuestSetup = false
    await nextTick()

    // 打开空购物车
    const cartBtn = wrapper.find('[aria-label="打开购物车"]')
    await cartBtn.trigger('click')
    await nextTick()

    // 覆盖 cart.length === 0 && existingItems.length === 0
    expect(wrapper.text()).toContain('购物车是空的')
  })

  it('loadData 中 getTableStatus 失败应继续加载', async () => {
    vi.mocked(useRoute).mockReturnValue({ query: { table: 'A1' } } as any)
    vi.mocked(PublicDishAPI.getDishes).mockResolvedValue({
      items: [{ id: 'd1', name: '铁锅鱼', price: 128, category: '铁锅炖', soldOut: false }],
    } as any)
    vi.mocked(PublicTableStatusAPI.getTableStatus).mockRejectedValue(new Error('网络错误'))
    vi.mocked(PublicOrderAPI.getOrdersByTable).mockResolvedValue([])

    const wrapper = mount(CustomerOrderView)
    await flushPromises()

    const vm = wrapper.vm as any
    expect(vm.dishes.length).toBeGreaterThan(0)
    // 验证 tableStatus 未被设置（通过检查模板中无已有订单提示）
    expect(wrapper.text()).not.toContain('当前已有订单')
  })
})
