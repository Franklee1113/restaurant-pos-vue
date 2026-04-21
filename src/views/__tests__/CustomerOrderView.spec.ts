import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
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

vi.mock('@/composables/useCart', () => ({
  useCart: vi.fn(() => ({
    cart: ref([]),
    cartMap: ref(new Map()),
    cartTotalQty: ref(0),
    cartTotalAmount: ref(0),
    addToCart: vi.fn(),
    addExistingToCart: vi.fn(),
    updateQty: vi.fn(),
    setQty: vi.fn(),
    updateRemark: vi.fn(),
    clearCart: vi.fn(),
  })),
}))

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
