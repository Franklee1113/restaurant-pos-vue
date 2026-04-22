import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import KitchenDisplayView from '../KitchenDisplayView.vue'
import { OrderAPI, subscribeToOrders } from '@/api/pocketbase'
import { useAutoRefresh } from '@/composables/useAutoRefresh'
import { useToast } from '@/composables/useToast'
import { OrderStatus } from '@/utils/orderStatus'

// ─── Module Mocks ───
vi.mock('@/composables/useToast', () => ({
  useToast: vi.fn(() => ({
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    toasts: { value: [] },
    show: vi.fn(),
    warning: vi.fn(),
    remove: vi.fn(),
  })),
}))

vi.mock('@/composables/useAutoRefresh', () => ({
  useAutoRefresh: vi.fn((_callback, _options) => ({
    start: vi.fn(),
    stop: vi.fn(),
    isRunning: ref(false),
  })),
}))

vi.mock('@/api/pocketbase', async () => {
  const actual = await vi.importActual<typeof import('@/api/pocketbase')>('@/api/pocketbase')
  return {
    ...actual,
    OrderAPI: {
      getOrders: vi.fn(),
      updateOrderItemStatus: vi.fn(),
    },
    subscribeToOrders: vi.fn(() => Promise.resolve(vi.fn())),
  }
})

// Web Audio API mock
const audioContextMock = {
  createOscillator: vi.fn(() => ({
    connect: vi.fn(),
    type: 'sine',
    frequency: { value: 0 },
    start: vi.fn(),
    stop: vi.fn(),
  })),
  createGain: vi.fn(() => ({
    connect: vi.fn(),
    gain: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
  })),
  currentTime: 0,
  destination: {},
  close: vi.fn(),
}

Object.defineProperty(globalThis, 'AudioContext', {
  writable: true,
  configurable: true,
  value: vi.fn(() => audioContextMock),
})
Object.defineProperty(globalThis, 'webkitAudioContext', {
  writable: true,
  configurable: true,
  value: vi.fn(() => audioContextMock),
})

function createOrder(id: string, status: string, items: any[]) {
  return {
    id,
    orderNo: `O20260419${id}`,
    tableNo: `T${id}`,
    guests: 4,
    status,
    items,
    remark: '',
    source: 'staff',
    created: new Date(Date.now() - 1000 * 60 * 5).toISOString(), // 5 mins ago
    updated: new Date().toISOString(),
  }
}

function mountKitchenDisplay() {
  return mount(KitchenDisplayView)
}

describe('KitchenDisplayView', () => {
  let toastSuccess: ReturnType<typeof vi.fn>
  let toastError: ReturnType<typeof vi.fn>
  let startAutoRefreshMock: ReturnType<typeof vi.fn>
  let stopAutoRefreshMock: ReturnType<typeof vi.fn>
  let unsubscribeMock: ReturnType<typeof vi.fn>
  let subscribeCallback: (() => void) | null = null

  beforeEach(() => {
    vi.clearAllMocks()

    toastSuccess = vi.fn()
    toastError = vi.fn()
    vi.mocked(useToast).mockReturnValue({
      success: toastSuccess,
      error: toastError,
      info: vi.fn(),
      toasts: { value: [] },
      show: vi.fn(),
      warning: vi.fn(),
      remove: vi.fn(),
    } as any)

    startAutoRefreshMock = vi.fn()
    stopAutoRefreshMock = vi.fn()
    vi.mocked(useAutoRefresh).mockReturnValue({
      start: startAutoRefreshMock,
      stop: stopAutoRefreshMock,
      isRunning: ref(false),
    } as any)

    unsubscribeMock = vi.fn()
    vi.mocked(subscribeToOrders).mockImplementation((_filter, onUpdate) => {
      subscribeCallback = onUpdate as () => void
      return Promise.resolve(unsubscribeMock as () => void)
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── Load Data ──
  it('should load orders on mount', async () => {
    vi.mocked(OrderAPI.getOrders).mockResolvedValue({
      items: [
        createOrder('1', OrderStatus.PENDING, [
          { dishId: 'd1', name: '铁锅鱼', price: 68, quantity: 1, status: 'pending' },
        ]),
      ],
    } as any)

    mountKitchenDisplay()
    await flushPromises()

    expect(vi.mocked(OrderAPI.getOrders)).toHaveBeenCalledWith(
      1,
      100,
      expect.stringContaining("status!='completed'"),
    )
  })

  it('should display pending and cooking sections', async () => {
    vi.mocked(OrderAPI.getOrders).mockResolvedValue({
      items: [
        createOrder('1', OrderStatus.PENDING, [
          { dishId: 'd1', name: '铁锅鱼', price: 68, quantity: 1, status: 'pending' },
        ]),
        createOrder('2', OrderStatus.COOKING, [
          { dishId: 'd2', name: '锅底', price: 28, quantity: 1, status: 'cooking' },
        ]),
      ],
    } as any)

    const wrapper = mountKitchenDisplay()
    await flushPromises()

    expect(wrapper.text()).toContain('新订单')
    expect(wrapper.text()).toContain('制作中')
    expect(wrapper.text()).toContain('铁锅鱼')
    expect(wrapper.text()).toContain('锅底')
  })

  it('should show empty state when no orders', async () => {
    vi.mocked(OrderAPI.getOrders).mockResolvedValue({ items: [] } as any)

    const wrapper = mountKitchenDisplay()
    await flushPromises()

    expect(wrapper.text()).toContain('暂无新订单')
    expect(wrapper.text()).toContain('暂无制作中订单')
  })

  // ── SSE / Polling ──
  it('should subscribe to realtime updates on mount', async () => {
    vi.mocked(OrderAPI.getOrders).mockResolvedValue({ items: [] } as any)

    mountKitchenDisplay()
    await flushPromises()

    expect(vi.mocked(subscribeToOrders)).toHaveBeenCalled()
  })

  it('should fallback to auto refresh when SSE fails', async () => {
    vi.mocked(subscribeToOrders).mockRejectedValue(new Error('SSE not supported'))
    vi.mocked(OrderAPI.getOrders).mockResolvedValue({ items: [] } as any)

    mountKitchenDisplay()
    await flushPromises()

    expect(startAutoRefreshMock).toHaveBeenCalled()
  })

  it('should unsubscribe and stop refresh on unmount', async () => {
    vi.mocked(OrderAPI.getOrders).mockResolvedValue({ items: [] } as any)

    const wrapper = mountKitchenDisplay()
    await flushPromises()

    wrapper.unmount()
    expect(unsubscribeMock).toHaveBeenCalled()
    expect(stopAutoRefreshMock).toHaveBeenCalled()
  })

  it('should reload data when SSE callback triggered', async () => {
    vi.mocked(OrderAPI.getOrders).mockResolvedValue({ items: [] } as any)

    mountKitchenDisplay()
    await flushPromises()

    expect(vi.mocked(OrderAPI.getOrders)).toHaveBeenCalledTimes(1)
    subscribeCallback?.()
    await flushPromises()
    expect(vi.mocked(OrderAPI.getOrders)).toHaveBeenCalledTimes(2)
  })

  // ── Item Status Operations ──
  it('should call updateOrderItemStatus when start cooking', async () => {
    vi.mocked(OrderAPI.getOrders).mockResolvedValue({
      items: [
        createOrder('1', OrderStatus.PENDING, [
          { dishId: 'd1', name: '铁锅鱼', price: 68, quantity: 1, status: 'pending' },
        ]),
      ],
    } as any)
    vi.mocked(OrderAPI.updateOrderItemStatus).mockResolvedValue({} as any)

    const wrapper = mountKitchenDisplay()
    await flushPromises()

    const startBtn = wrapper.findAll('button').find((b) => b.text().includes('开始制作'))
    expect(startBtn).toBeDefined()
    await startBtn!.trigger('click')
    await flushPromises()

    expect(vi.mocked(OrderAPI.updateOrderItemStatus)).toHaveBeenCalledWith('1', 0, 'cooking')
    expect(toastSuccess).toHaveBeenCalledWith(expect.stringContaining('开始制作'))
  })

  it('should call updateOrderItemStatus when finish cooking', async () => {
    vi.mocked(OrderAPI.getOrders).mockResolvedValue({
      items: [
        createOrder('2', OrderStatus.COOKING, [
          { dishId: 'd2', name: '锅底', price: 28, quantity: 1, status: 'cooking' },
        ]),
      ],
    } as any)
    vi.mocked(OrderAPI.updateOrderItemStatus).mockResolvedValue({} as any)

    const wrapper = mountKitchenDisplay()
    await flushPromises()

    const finishBtn = wrapper.findAll('button').find((b) => b.text().includes('已完成'))
    expect(finishBtn).toBeDefined()
    await finishBtn!.trigger('click')
    await flushPromises()

    expect(vi.mocked(OrderAPI.updateOrderItemStatus)).toHaveBeenCalledWith('2', 0, 'cooked')
    expect(toastSuccess).toHaveBeenCalledWith(expect.stringContaining('已出餐'))
  })

  it('should show error toast when operation fails', async () => {
    vi.mocked(OrderAPI.getOrders).mockResolvedValue({
      items: [
        createOrder('1', OrderStatus.PENDING, [
          { dishId: 'd1', name: '铁锅鱼', price: 68, quantity: 1, status: 'pending' },
        ]),
      ],
    } as any)
    vi.mocked(OrderAPI.updateOrderItemStatus).mockRejectedValue(new Error('订单已结束'))

    const wrapper = mountKitchenDisplay()
    await flushPromises()

    const startBtn = wrapper.findAll('button').find((b) => b.text().includes('开始制作'))
    await startBtn!.trigger('click')
    await flushPromises()

    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('订单已结束'))
  })

  // ── Alert Sound ──
  it('should play alert sound when new pending items detected', async () => {
    vi.mocked(OrderAPI.getOrders).mockResolvedValue({
      items: [
        createOrder('1', OrderStatus.PENDING, [
          { dishId: 'd1', name: '铁锅鱼', price: 68, quantity: 1, status: 'pending' },
        ]),
      ],
    } as any)

    mountKitchenDisplay()
    await flushPromises()

    // Simulate SSE callback with a new pending item added
    vi.mocked(OrderAPI.getOrders).mockResolvedValue({
      items: [
        createOrder('1', OrderStatus.PENDING, [
          { dishId: 'd1', name: '铁锅鱼', price: 68, quantity: 1, status: 'pending' },
          { dishId: 'd2', name: '锅底', price: 28, quantity: 1, status: 'pending' },
        ]),
      ],
    } as any)
    subscribeCallback?.()
    await flushPromises()

    expect(globalThis.AudioContext).toHaveBeenCalled()
  })

  it('should not play sound on initial load', async () => {
    vi.mocked(OrderAPI.getOrders).mockResolvedValue({
      items: [
        createOrder('1', OrderStatus.PENDING, [
          { dishId: 'd1', name: '铁锅鱼', price: 68, quantity: 1, status: 'pending' },
        ]),
      ],
    } as any)

    mountKitchenDisplay()
    await flushPromises()

    expect(globalThis.AudioContext).not.toHaveBeenCalled()
  })

  // ── Overdue Detection ──
  it('should mark cooking order as overdue after 15 minutes', async () => {
    const oldDate = new Date(Date.now() - 1000 * 60 * 20).toISOString() // 20 mins ago
    vi.mocked(OrderAPI.getOrders).mockResolvedValue({
      items: [
        createOrder('2', OrderStatus.COOKING, [
          { dishId: 'd2', name: '锅底', price: 28, quantity: 1, status: 'cooking' },
        ]),
      ],
    } as any)

    const wrapper = mountKitchenDisplay()
    await flushPromises()

    // Manually override created to be 20 mins ago via vm
    const vm = wrapper.vm as any
    vm.orders[0].created = oldDate
    await nextTick()

    const meta = vm.cookingOrderMeta.get('2')
    expect(meta.minutes).toBeGreaterThanOrEqual(20)
    expect(meta.isOverdue).toBe(true)
  })

  // ── Statistics ──
  it('should compute correct pending and cooking counts', async () => {
    vi.mocked(OrderAPI.getOrders).mockResolvedValue({
      items: [
        createOrder('1', OrderStatus.PENDING, [
          { dishId: 'd1', name: '铁锅鱼', price: 68, quantity: 1, status: 'pending' },
          { dishId: 'd2', name: '锅底', price: 28, quantity: 1, status: 'pending' },
        ]),
        createOrder('2', OrderStatus.COOKING, [
          { dishId: 'd3', name: '凉拌黄瓜', price: 12, quantity: 1, status: 'cooking' },
        ]),
      ],
    } as any)

    const wrapper = mountKitchenDisplay()
    await flushPromises()

    const vm = wrapper.vm as any
    expect(vm.pendingItemsCount).toBe(2)
    expect(vm.cookingItemsCount).toBe(1)
    expect(vm.pendingOrders.length).toBe(1)
    expect(vm.cookingOrders.length).toBe(1)
  })

  // ── Split Order Display ──
  it('should show same order in both sections if items have mixed status', async () => {
    vi.mocked(OrderAPI.getOrders).mockResolvedValue({
      items: [
        createOrder('1', OrderStatus.PENDING, [
          { dishId: 'd1', name: '铁锅鱼', price: 68, quantity: 1, status: 'pending' },
          { dishId: 'd2', name: '锅底', price: 28, quantity: 1, status: 'cooking' },
        ]),
      ],
    } as any)

    const wrapper = mountKitchenDisplay()
    await flushPromises()

    const vm = wrapper.vm as any
    expect(vm.pendingOrders.length).toBe(1)
    expect(vm.cookingOrders.length).toBe(1)
  })

  // ── Customer Tag ──
  it('should display customer tag for customer source orders', async () => {
    const order = createOrder('1', OrderStatus.PENDING, [
      { dishId: 'd1', name: '铁锅鱼', price: 68, quantity: 1, status: 'pending' },
    ])
    order.source = 'customer'
    vi.mocked(OrderAPI.getOrders).mockResolvedValue({ items: [order] } as any)

    const wrapper = mountKitchenDisplay()
    await flushPromises()

    expect(wrapper.text()).toContain('顾客')
  })
})
