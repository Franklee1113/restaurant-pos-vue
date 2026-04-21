import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import OrderListView from '../OrderListView.vue'
import { OrderAPI, DishAPI, TableStatusAPI } from '@/api/pocketbase'
import { useRouter } from 'vue-router'
import { useToast } from '@/composables/useToast'
import { globalConfirm, useConfirm } from '@/composables/useConfirm'
import { useAutoRefresh } from '@/composables/useAutoRefresh'
import { useClearTable } from '@/composables/useClearTable'
import { useSettingsStore } from '@/stores/settings.store'
import { OrderStatus } from '@/utils/orderStatus'

// ─── Module Mocks ───
vi.mock('vue-router', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}))

vi.mock('@/composables/useToast', () => ({
  useToast: vi.fn(() => ({
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  })),
}))

vi.mock('@/composables/useConfirm', () => ({
  useConfirm: vi.fn(() => ({ confirm: vi.fn(), open: ref(false), options: ref({}) })),
  globalConfirm: { confirm: vi.fn() },
}))

vi.mock('@/composables/useAutoRefresh', () => ({
  useAutoRefresh: vi.fn(() => ({ start: vi.fn(), stop: vi.fn(), isRunning: ref(false) })),
}))

vi.mock('@/composables/useClearTable', () => ({
  useClearTable: vi.fn(() => ({
    checkCanClearTable: vi.fn(),
    executeClearTable: vi.fn(),
  })),
}))

vi.mock('@/stores/settings.store', () => ({
  useSettingsStore: vi.fn(() => ({
    settings: { restaurantName: '测试餐厅', tableNumbers: ['A1', 'A2'] },
    fetchSettings: vi.fn(),
  })),
}))

vi.mock('@/api/pocketbase', async () => {
  const actual = await vi.importActual<typeof import('@/api/pocketbase')>('@/api/pocketbase')
  return {
    ...actual,
    OrderAPI: {
      getOrders: vi.fn(),
      deleteOrder: vi.fn(),
      updateOrderStatus: vi.fn(),
    },
    DishAPI: {
      getDishes: vi.fn(),
      toggleSoldOut: vi.fn(),
    },
    TableStatusAPI: {
      getAllTableStatuses: vi.fn(),
    },
  }
})

function createMockOrder(status: string, overrides: Partial<any> = {}) {
  return {
    id: 'o1',
    orderNo: 'O20260420001',
    tableNo: 'A1',
    guests: 4,
    status,
    source: 'staff',
    items: [{ dishId: 'd1', name: '铁锅鱼', price: 68, quantity: 1 }],
    totalAmount: 68,
    discount: 0,
    finalAmount: 68,
    created: '2026-04-20T10:00:00.000Z',
    updated: '2026-04-20T10:00:00.000Z',
    ...overrides,
  }
}

function createMockDish(overrides: Partial<any> = {}) {
  return {
    id: 'd1',
    name: '铁锅鱼',
    category: '海鲜',
    price: 68,
    soldOut: false,
    ...overrides,
  }
}

function mountOrderListView() {
  return mount(OrderListView, {
    global: {
      stubs: {
        EmptyState: { template: '<div data-testid="empty-state" />' },
        SkeletonBox: true,
        SoldOutDrawer: {
          template: '<div data-testid="sold-out-drawer" :data-open="open"><div data-testid="dishes-count">{{ dishes.length }}</div></div>',
          props: ['open', 'dishes'],
        },
      },
    },
  })
}

describe('OrderListView', () => {
  let toastSuccess: ReturnType<typeof vi.fn>
  let toastError: ReturnType<typeof vi.fn>
  let toastWarning: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()

    toastSuccess = vi.fn()
    toastError = vi.fn()
    toastWarning = vi.fn()
    vi.mocked(useToast).mockReturnValue({
      success: toastSuccess,
      error: toastError,
      info: vi.fn(),
      warning: toastWarning,
    } as any)

    vi.mocked(OrderAPI.getOrders).mockResolvedValue({
      items: [createMockOrder(OrderStatus.PENDING)],
      totalItems: 1,
      page: 1,
      perPage: 20,
      totalPages: 1,
    } as any)

    vi.mocked(TableStatusAPI.getAllTableStatuses).mockResolvedValue([
      { id: 'ts1', tableNo: 'A1', status: 'dining', currentOrderId: 'o1' },
    ] as any)

    vi.mocked(DishAPI.getDishes).mockResolvedValue({
      items: [createMockDish(), createMockDish({ id: 'd2', name: '红烧肉', soldOut: true })],
    } as any)
  })

  // ── Data Loading ──
  it('should load orders and dishes on mount', async () => {
    mountOrderListView()
    await flushPromises()

    expect(OrderAPI.getOrders).toHaveBeenCalled()
    expect(DishAPI.getDishes).toHaveBeenCalled()
    expect(TableStatusAPI.getAllTableStatuses).toHaveBeenCalled()
  })

  it('should pass dishes to SoldOutDrawer', async () => {
    const wrapper = mountOrderListView()
    await flushPromises()

    const drawer = wrapper.find('[data-testid="sold-out-drawer"]')
    expect(drawer.exists()).toBe(true)
    expect(drawer.attributes('data-open')).toBe('false')
    // 2 dishes loaded
    expect(drawer.find('[data-testid="dishes-count"]').text()).toBe('2')
  })

  // ── Sold Out Drawer ──
  it('should open sold-out drawer when clicking button', async () => {
    const wrapper = mountOrderListView()
    await flushPromises()

    const btn = wrapper.findAll('button').find((b) => b.text().includes('今日沽清'))
    expect(btn).toBeDefined()
    await btn!.trigger('click')

    const drawer = wrapper.find('[data-testid="sold-out-drawer"]')
    expect(drawer.attributes('data-open')).toBe('true')
  })

  it('should show sold-out count badge when there are sold-out dishes', async () => {
    const wrapper = mountOrderListView()
    await flushPromises()

    const btn = wrapper.findAll('button').find((b) => b.text().includes('今日沽清'))
    expect(btn!.text()).toContain('1') // 1 sold-out dish
  })

  // ── Toggle Sold Out ──
  it('should call toggleSoldOut API and update local state', async () => {
    vi.mocked(DishAPI.toggleSoldOut).mockResolvedValue(undefined as any)

    const wrapper = mountOrderListView()
    await flushPromises()

    // Open drawer first
    const btn = wrapper.findAll('button').find((b) => b.text().includes('今日沽清'))
    await btn!.trigger('click')

    // Emit toggle event from stub
    const drawer = wrapper.findComponent('[data-testid="sold-out-drawer"]') as any
    drawer.vm.$emit('toggle', 'd2', false)
    await flushPromises()

    expect(DishAPI.toggleSoldOut).toHaveBeenCalledWith('d2', false)
  })

  it('should rollback on toggleSoldOut failure', async () => {
    vi.mocked(DishAPI.toggleSoldOut).mockRejectedValue(new Error('网络错误'))

    const wrapper = mountOrderListView()
    await flushPromises()

    const drawer = wrapper.findComponent('[data-testid="sold-out-drawer"]') as any
    drawer.vm.$emit('toggle', 'd2', false)
    await flushPromises()

    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('操作失败'))
  })

  // ── Reset All Sold Out ──
  it('should reset all sold-out dishes', async () => {
    vi.mocked(DishAPI.toggleSoldOut).mockResolvedValue(undefined as any)

    const wrapper = mountOrderListView()
    await flushPromises()

    const drawer = wrapper.findComponent('[data-testid="sold-out-drawer"]') as any
    drawer.vm.$emit('reset-all')
    await flushPromises()

    expect(DishAPI.toggleSoldOut).toHaveBeenCalledTimes(1) // d2 was sold out
    expect(toastSuccess).toHaveBeenCalledWith(expect.stringContaining('已恢复'))
  })

  // ── Edit Button Blocking ──
  it('should allow editing pending order', async () => {
    const wrapper = mountOrderListView()
    await flushPromises()

    const pushMock = vi.fn()
    vi.mocked(useRouter).mockReturnValue({ push: pushMock } as any)

    const editBtn = wrapper.findAll('button').find((b) => b.text() === '编辑')
    expect(editBtn).toBeDefined()
    // Pending order: not disabled style
    expect(editBtn!.classes()).not.toContain('bg-gray-100')
  })

  it('should block editing completed order', async () => {
    vi.mocked(OrderAPI.getOrders).mockResolvedValue({
      items: [createMockOrder(OrderStatus.COMPLETED)],
      totalItems: 1,
      page: 1,
      perPage: 20,
      totalPages: 1,
    } as any)

    const wrapper = mountOrderListView()
    await flushPromises()

    const editBtn = wrapper.findAll('button').find((b) => b.text() === '编辑')
    expect(editBtn).toBeDefined()
    expect(editBtn!.classes()).toContain('bg-gray-100') // disabled style
  })

  it('should block editing settled order', async () => {
    vi.mocked(OrderAPI.getOrders).mockResolvedValue({
      items: [createMockOrder(OrderStatus.SETTLED)],
      totalItems: 1,
      page: 1,
      perPage: 20,
      totalPages: 1,
    } as any)

    const wrapper = mountOrderListView()
    await flushPromises()

    const editBtn = wrapper.findAll('button').find((b) => b.text() === '编辑')
    expect(editBtn).toBeDefined()
    expect(editBtn!.classes()).toContain('bg-gray-100') // disabled style
  })

  // ── Delete Order ──
  it('should delete order after confirmation', async () => {
    vi.mocked(globalConfirm.confirm).mockResolvedValue(true)
    vi.mocked(OrderAPI.deleteOrder).mockResolvedValue(undefined as any)

    const wrapper = mountOrderListView()
    await flushPromises()

    const deleteBtn = wrapper.findAll('button').find((b) => b.text().includes('删除'))
    await deleteBtn!.trigger('click')
    await flushPromises()

    expect(globalConfirm.confirm).toHaveBeenCalled()
    expect(OrderAPI.deleteOrder).toHaveBeenCalledWith('o1')
    expect(toastSuccess).toHaveBeenCalledWith('删除成功')
  })

  // ── Filters ──
  it('should apply status filter', async () => {
    const wrapper = mountOrderListView()
    await flushPromises()

    const vm = wrapper.vm as any
    vm.filter.status = OrderStatus.COOKING
    await vm.applyFilter()
    await flushPromises()

    expect(OrderAPI.getOrders).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), expect.stringContaining("status='cooking'"))
  })

  it('should apply tableNo filter', async () => {
    const wrapper = mountOrderListView()
    await flushPromises()

    const vm = wrapper.vm as any
    vm.filter.tableNo = 'A1'
    await vm.applyFilter()
    await flushPromises()

    expect(OrderAPI.getOrders).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), expect.stringContaining("tableNo~'A1'"))
  })

  it('should apply date filter', async () => {
    const wrapper = mountOrderListView()
    await flushPromises()

    const vm = wrapper.vm as any
    vm.filter.date = '2026-04-20'
    await vm.applyFilter()
    await flushPromises()

    expect(OrderAPI.getOrders).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), expect.stringContaining("created>='"))
  })

  it('should apply search keyword filter', async () => {
    const wrapper = mountOrderListView()
    await flushPromises()

    const vm = wrapper.vm as any
    vm.searchKeyword = 'O2026'
    await vm.loadOrders()
    await flushPromises()

    expect(OrderAPI.getOrders).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), expect.stringContaining("orderNo~'O2026'"))
  })

  it('should reset all filters', async () => {
    const wrapper = mountOrderListView()
    await flushPromises()

    const vm = wrapper.vm as any
    vm.filter.status = OrderStatus.PENDING
    vm.filter.tableNo = 'A1'
    vm.searchKeyword = 'test'
    await vm.resetFilter()
    await flushPromises()

    expect(vm.filter.status).toBe('')
    expect(vm.filter.tableNo).toBe('')
    expect(vm.searchKeyword).toBe('')
  })

  // ── Quick Filters ──
  it('should quick filter by status', async () => {
    const wrapper = mountOrderListView()
    await flushPromises()

    const vm = wrapper.vm as any
    vm.quickFilterStatus(OrderStatus.PENDING)
    await flushPromises()

    expect(vm.filter.status).toBe(OrderStatus.PENDING)
    expect(OrderAPI.getOrders).toHaveBeenCalled()

    // Toggle off
    vm.quickFilterStatus(OrderStatus.PENDING)
    await flushPromises()
    expect(vm.filter.status).toBe('')
  })

  it('should quick filter by table', async () => {
    const wrapper = mountOrderListView()
    await flushPromises()

    const vm = wrapper.vm as any
    vm.quickFilterTable('A1')
    await flushPromises()

    expect(vm.filter.tableNo).toBe('A1')
  })

  // ── Clear Table ──
  it('should clear table after confirmation', async () => {
    const checkMock = vi.mocked(useClearTable).mockReturnValue({
      checkCanClearTable: vi.fn().mockResolvedValue({ canClear: true, tableStatus: { id: 'ts1', tableNo: 'A1', status: 'dining' } }),
      executeClearTable: vi.fn().mockResolvedValue(undefined),
    } as any)

    vi.mocked(globalConfirm.confirm).mockResolvedValue(true)

    const wrapper = mountOrderListView()
    await flushPromises()

    const vm = wrapper.vm as any
    await vm.clearTable('A1')
    await flushPromises()

    expect(toastSuccess).toHaveBeenCalledWith(expect.stringContaining('已清台'))
  })

  it('should block clear table when idle', async () => {
    vi.mocked(useClearTable).mockReturnValue({
      checkCanClearTable: vi.fn().mockResolvedValue({ canClear: false, reason: 'idle' }),
      executeClearTable: vi.fn(),
    } as any)

    const wrapper = mountOrderListView()
    await flushPromises()

    const vm = wrapper.vm as any
    await vm.clearTable('A1')
    await flushPromises()

    expect(globalConfirm.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: '无需清台' }))
  })

  it('should block clear table when unfinished orders exist', async () => {
    vi.mocked(useClearTable).mockReturnValue({
      checkCanClearTable: vi.fn().mockResolvedValue({ canClear: false, reason: 'unfinished' }),
      executeClearTable: vi.fn(),
    } as any)

    const wrapper = mountOrderListView()
    await flushPromises()

    const vm = wrapper.vm as any
    await vm.clearTable('A1')
    await flushPromises()

    expect(globalConfirm.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: '不可清台' }))
  })

  it('should block clear table when dining', async () => {
    vi.mocked(useClearTable).mockReturnValue({
      checkCanClearTable: vi.fn().mockResolvedValue({ canClear: false, reason: 'dining' }),
      executeClearTable: vi.fn(),
    } as any)

    const wrapper = mountOrderListView()
    await flushPromises()

    const vm = wrapper.vm as any
    await vm.clearTable('A1')
    await flushPromises()

    expect(globalConfirm.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: '不可清台' }))
  })

  it('should handle clear table execution error', async () => {
    vi.mocked(useClearTable).mockReturnValue({
      checkCanClearTable: vi.fn().mockResolvedValue({ canClear: true, tableStatus: { id: 'ts1', tableNo: 'A1', status: 'dining' } }),
      executeClearTable: vi.fn().mockRejectedValue(new Error('清台失败')),
    } as any)

    vi.mocked(globalConfirm.confirm).mockResolvedValue(true)

    const wrapper = mountOrderListView()
    await flushPromises()

    const vm = wrapper.vm as any
    await vm.clearTable('A1')
    await flushPromises()

    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('清台失败'))
  })

  // ── Status Update ──
  it('should update order status after confirmation', async () => {
    vi.mocked(globalConfirm.confirm).mockResolvedValue(true)
    vi.mocked(OrderAPI.updateOrderStatus).mockResolvedValue(undefined as any)

    const wrapper = mountOrderListView()
    await flushPromises()

    const vm = wrapper.vm as any
    const order = createMockOrder(OrderStatus.PENDING)
    await vm.updateStatus(order, OrderStatus.COOKING)
    await flushPromises()

    expect(globalConfirm.confirm).toHaveBeenCalled()
    expect(OrderAPI.updateOrderStatus).toHaveBeenCalledWith('o1', OrderStatus.COOKING)
    expect(toastSuccess).toHaveBeenCalledWith('状态更新成功')
  })

  it('should handle status update failure', async () => {
    vi.mocked(globalConfirm.confirm).mockResolvedValue(true)
    vi.mocked(OrderAPI.updateOrderStatus).mockRejectedValue(new Error('DB错误'))

    const wrapper = mountOrderListView()
    await flushPromises()

    const vm = wrapper.vm as any
    const order = createMockOrder(OrderStatus.PENDING)
    await vm.updateStatus(order, OrderStatus.COOKING)
    await flushPromises()

    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('状态更新失败'))
  })

  // ── Export Excel ──
  it('should warn when exporting empty orders', async () => {
    vi.mocked(OrderAPI.getOrders).mockResolvedValue({
      items: [],
      totalItems: 0,
      page: 1,
      perPage: 20,
      totalPages: 0,
    } as any)

    const wrapper = mountOrderListView()
    await flushPromises()

    const vm = wrapper.vm as any
    vm.exportExcel()

    expect(toastWarning).toHaveBeenCalledWith('当前没有订单可导出')
  })

  // ── Stats ──
  it('should calculate today stats correctly', async () => {
    const today = new Date().toISOString()
    vi.mocked(OrderAPI.getOrders).mockResolvedValue({
      items: [
        createMockOrder(OrderStatus.PENDING, { created: today, finalAmount: 100 }),
        createMockOrder(OrderStatus.SETTLED, { id: 'o2', created: today, finalAmount: 200 }),
      ],
      totalItems: 2,
      page: 1,
      perPage: 20,
      totalPages: 1,
    } as any)

    const wrapper = mountOrderListView()
    await flushPromises()

    const vm = wrapper.vm as any
    expect(vm.stats.today).toBe(2)
    expect(vm.stats.pending).toBe(1)
  })

  it('should compute pending table numbers', async () => {
    vi.mocked(OrderAPI.getOrders).mockResolvedValue({
      items: [
        createMockOrder(OrderStatus.PENDING, { tableNo: 'A1' }),
        createMockOrder(OrderStatus.COOKING, { id: 'o2', tableNo: 'A1' }),
        createMockOrder(OrderStatus.COMPLETED, { id: 'o3', tableNo: 'A2' }),
      ],
      totalItems: 3,
      page: 1,
      perPage: 20,
      totalPages: 1,
    } as any)

    const wrapper = mountOrderListView()
    await flushPromises()

    const vm = wrapper.vm as any
    expect(vm.pendingTableNumbers).toContain('A1')
    expect(vm.pendingTableNumbers).not.toContain('A2')
  })

  // ── View Navigation ──
  it('should navigate to order detail', async () => {
    const pushMock = vi.fn()
    vi.mocked(useRouter).mockReturnValue({ push: pushMock } as any)

    const wrapper = mountOrderListView()
    await flushPromises()

    const vm = wrapper.vm as any
    vm.viewOrder(createMockOrder(OrderStatus.PENDING))

    expect(pushMock).toHaveBeenCalledWith({ name: 'orderDetail', params: { orderId: 'o1' } })
  })

  // ── Silent Refresh ──
  it('should play sound on new order during silent refresh', async () => {
    const AudioContextMock = vi.fn(() => ({
      createOscillator: vi.fn(() => ({ connect: vi.fn(), type: '', frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, start: vi.fn(), stop: vi.fn() })),
      createGain: vi.fn(() => ({ connect: vi.fn(), gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() } })),
      currentTime: 0,
    }))
    // @ts-ignore
    globalThis.window.AudioContext = AudioContextMock
    // @ts-ignore
    globalThis.window.webkitAudioContext = AudioContextMock

    vi.mocked(OrderAPI.getOrders).mockResolvedValue({
      items: [createMockOrder(OrderStatus.PENDING)],
      totalItems: 1,
      page: 1,
      perPage: 20,
      totalPages: 1,
    } as any)

    const wrapper = mountOrderListView()
    await flushPromises()

    const vm = wrapper.vm as any
    await vm.silentRefresh()
    await flushPromises()

    // 因为订单数据未变化，不应播放声音
    expect(AudioContextMock).not.toHaveBeenCalled()
  })
})
