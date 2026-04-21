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
