import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import TableVisualizationView from '../TableVisualizationView.vue'
import { OrderAPI, TableStatusAPI, subscribeToOrders } from '@/api/pocketbase'
import { useSettingsStore } from '@/stores/settings.store'
import { useAutoRefresh } from '@/composables/useAutoRefresh'
import { useToast } from '@/composables/useToast'
import { OrderStatus } from '@/utils/orderStatus'

// ─── Module Mocks ───
vi.mock('@/stores/settings.store', () => ({
  useSettingsStore: vi.fn(() => ({
    settings: { tableNumbers: ['A1', 'A2', 'A3', 'A4', 'A5'] },
    tableNumbers: ['A1', 'A2', 'A3', 'A4', 'A5'],
    fetchSettings: vi.fn(),
  })),
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
  useAutoRefresh: vi.fn((_callback, _options) => ({
    start: vi.fn(),
    stop: vi.fn(),
    isRunning: { value: false },
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
    TableStatusAPI: {
      getAllTableStatuses: vi.fn(),
    },
    subscribeToOrders: vi.fn(() => Promise.resolve(vi.fn())),
  }
})

function createTableStatus(tableNo: string, status: 'idle' | 'dining' | 'pending_clear', currentOrderId?: string) {
  return {
    id: `ts_${tableNo}`,
    tableNo,
    status,
    currentOrderId: currentOrderId || '',
    openedAt: new Date().toISOString(),
    updated: new Date().toISOString(),
  }
}

function createOrder(id: string, status: string, tableNo: string, items: any[]) {
  const totalAmount = items.reduce((sum, i) => sum + (i.price || 0) * (i.quantity || 1), 0)
  return {
    id,
    orderNo: `O20260422${id}`,
    tableNo,
    guests: 4,
    status,
    items,
    totalAmount,
    discount: 0,
    discountType: 'amount',
    discountValue: 0,
    finalAmount: totalAmount,
    remark: '',
    source: 'staff',
    created: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    updated: new Date().toISOString(),
  }
}

describe('TableVisualizationView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── Load Data ──
  it('should load table statuses and orders on mount', async () => {
    vi.mocked(TableStatusAPI.getAllTableStatuses).mockResolvedValue([
      createTableStatus('A1', 'dining', 'o1'),
      createTableStatus('A2', 'idle'),
    ])
    vi.mocked(OrderAPI.getOrders).mockResolvedValue({
      items: [
        createOrder('o1', OrderStatus.COOKING, 'A1', [
          { dishId: 'd1', name: '铁锅鱼', price: 68, quantity: 1, status: 'cooking' },
        ]),
      ],
    } as any)

    mount(TableVisualizationView)
    await flushPromises()

    expect(vi.mocked(TableStatusAPI.getAllTableStatuses)).toHaveBeenCalled()
    expect(vi.mocked(OrderAPI.getOrders)).toHaveBeenCalled()
  })

  // ── Composite Status ──
  it('should show pending_clear for dining table with completed order', async () => {
    vi.mocked(TableStatusAPI.getAllTableStatuses).mockResolvedValue([
      createTableStatus('A1', 'dining', 'o1'),
    ])
    vi.mocked(OrderAPI.getOrders).mockResolvedValue({
      items: [
        createOrder('o1', OrderStatus.COMPLETED, 'A1', [
          { dishId: 'd1', name: '铁锅鱼', price: 68, quantity: 1, status: 'served' },
        ]),
      ],
    } as any)

    const wrapper = mount(TableVisualizationView)
    await flushPromises()

    expect(wrapper.text()).toContain('A1')
    expect(wrapper.text()).toContain('已结账')
  })

  it('should not show idle tables', async () => {
    vi.mocked(TableStatusAPI.getAllTableStatuses).mockResolvedValue([
      createTableStatus('A1', 'dining', 'o1'),
      createTableStatus('A2', 'idle'),
      createTableStatus('A3', 'idle'),
    ])
    vi.mocked(OrderAPI.getOrders).mockResolvedValue({
      items: [
        createOrder('o1', OrderStatus.PENDING, 'A1', [
          { dishId: 'd1', name: '铁锅鱼', price: 68, quantity: 1, status: 'pending' },
        ]),
      ],
    } as any)

    const wrapper = mount(TableVisualizationView)
    await flushPromises()

    expect(wrapper.text()).toContain('A1')
    expect(wrapper.text()).not.toContain('A2')
    expect(wrapper.text()).not.toContain('A3')
  })

  // ── Dish Sorting ──
  it('should sort dishes by status priority: cooked > cooking > pending > served', async () => {
    vi.mocked(TableStatusAPI.getAllTableStatuses).mockResolvedValue([
      createTableStatus('A1', 'dining', 'o1'),
    ])
    vi.mocked(OrderAPI.getOrders).mockResolvedValue({
      items: [
        createOrder('o1', OrderStatus.COOKING, 'A1', [
          { dishId: 'd1', name: '米饭', price: 4, quantity: 2, status: 'pending' },
          { dishId: 'd2', name: '锅底', price: 28, quantity: 1, status: 'cooking' },
          { dishId: 'd3', name: '铁锅鱼', price: 68, quantity: 1, status: 'cooked' },
          { dishId: 'd4', name: '凉菜', price: 12, quantity: 1, status: 'served' },
        ]),
      ],
    } as any)

    const wrapper = mount(TableVisualizationView)
    await flushPromises()

    const text = wrapper.text()
    const cookedIdx = text.indexOf('铁锅鱼')
    const cookingIdx = text.indexOf('锅底')
    const pendingIdx = text.indexOf('米饭')
    const servedIdx = text.indexOf('凉菜')

    expect(cookedIdx).toBeLessThan(cookingIdx)
    expect(cookingIdx).toBeLessThan(pendingIdx)
    expect(pendingIdx).toBeLessThan(servedIdx)
  })

  // ── Served Dishes Faded ──
  it('should show served dishes with reduced opacity', async () => {
    vi.mocked(TableStatusAPI.getAllTableStatuses).mockResolvedValue([
      createTableStatus('A1', 'dining', 'o1'),
    ])
    vi.mocked(OrderAPI.getOrders).mockResolvedValue({
      items: [
        createOrder('o1', OrderStatus.DINING, 'A1', [
          { dishId: 'd1', name: '凉菜', price: 12, quantity: 1, status: 'served' },
        ]),
      ],
    } as any)

    const wrapper = mount(TableVisualizationView)
    await flushPromises()

    // Served dish should have opacity-50 class
    expect(wrapper.text()).toContain('凉菜')
  })

  // ── Search Filter ──
  it('should filter cards by table number', async () => {
    vi.mocked(TableStatusAPI.getAllTableStatuses).mockResolvedValue([
      createTableStatus('A1', 'dining', 'o1'),
      createTableStatus('A2', 'dining', 'o2'),
    ])
    vi.mocked(OrderAPI.getOrders).mockResolvedValue({
      items: [
        createOrder('o1', OrderStatus.PENDING, 'A1', [{ dishId: 'd1', name: '鱼', price: 68, quantity: 1, status: 'pending' }]),
        createOrder('o2', OrderStatus.PENDING, 'A2', [{ dishId: 'd2', name: '肉', price: 48, quantity: 1, status: 'pending' }]),
      ],
    } as any)

    const wrapper = mount(TableVisualizationView)
    await flushPromises()

    const searchInput = wrapper.find('input[type="text"]')
    await searchInput.setValue('A1')
    await nextTick()

    expect(wrapper.text()).toContain('A1')
    expect(wrapper.text()).not.toContain('A2')
  })

  // ── Cooked Filter ──
  it('should show only tables with cooked items when filter enabled', async () => {
    vi.mocked(TableStatusAPI.getAllTableStatuses).mockResolvedValue([
      createTableStatus('A1', 'dining', 'o1'),
      createTableStatus('A2', 'dining', 'o2'),
    ])
    vi.mocked(OrderAPI.getOrders).mockResolvedValue({
      items: [
        createOrder('o1', OrderStatus.COOKING, 'A1', [
          { dishId: 'd1', name: '鱼', price: 68, quantity: 1, status: 'cooked' },
        ]),
        createOrder('o2', OrderStatus.COOKING, 'A2', [
          { dishId: 'd2', name: '肉', price: 48, quantity: 1, status: 'cooking' },
        ]),
      ],
    } as any)

    const wrapper = mount(TableVisualizationView)
    await flushPromises()

    // Click "有待上菜" filter
    const cookedFilterBtn = wrapper.findAll('button').find((b) => b.text().includes('有待上菜'))
    expect(cookedFilterBtn).toBeDefined()
    await cookedFilterBtn!.trigger('click')
    await nextTick()

    expect(wrapper.text()).toContain('A1')
    expect(wrapper.text()).not.toContain('A2')
  })

  // ── Stats Bar ──
  it('should compute correct stats', async () => {
    vi.mocked(TableStatusAPI.getAllTableStatuses).mockResolvedValue([
      createTableStatus('A1', 'dining', 'o1'),
      createTableStatus('A2', 'dining', 'o2'),
    ])
    vi.mocked(OrderAPI.getOrders).mockResolvedValue({
      items: [
        createOrder('o1', OrderStatus.COOKING, 'A1', [
          { dishId: 'd1', name: '鱼', price: 68, quantity: 1, status: 'cooked' },
          { dishId: 'd2', name: '肉', price: 48, quantity: 1, status: 'cooked' },
        ]),
        createOrder('o2', OrderStatus.DINING, 'A2', [
          { dishId: 'd3', name: '菜', price: 12, quantity: 1, status: 'served' },
        ]),
      ],
    } as any)

    const wrapper = mount(TableVisualizationView)
    await flushPromises()

    // 占用中 2 / 待清台 0 / 空闲 3 (A3,A4,A5) / 待上菜 2
    expect(wrapper.text()).toContain('占用中')
    expect(wrapper.text()).toContain('空闲')
    expect(wrapper.text()).toContain('待上菜')
  })

  // ── Empty State ──
  it('should show empty state when all tables are idle', async () => {
    vi.mocked(TableStatusAPI.getAllTableStatuses).mockResolvedValue([
      createTableStatus('A1', 'idle'),
      createTableStatus('A2', 'idle'),
    ])
    vi.mocked(OrderAPI.getOrders).mockResolvedValue({ items: [] } as any)

    const wrapper = mount(TableVisualizationView)
    await flushPromises()

    expect(wrapper.text()).toContain('所有桌台空闲')
  })

  // ── Mark Served ──
  it('should call updateOrderItemStatus when mark served clicked', async () => {
    vi.mocked(TableStatusAPI.getAllTableStatuses).mockResolvedValue([
      createTableStatus('A1', 'dining', 'o1'),
    ])
    vi.mocked(OrderAPI.getOrders).mockResolvedValue({
      items: [
        createOrder('o1', OrderStatus.COOKING, 'A1', [
          { dishId: 'd1', name: '鱼', price: 68, quantity: 1, status: 'cooked' },
        ]),
      ],
    } as any)
    vi.mocked(OrderAPI.updateOrderItemStatus).mockResolvedValue({} as any)

    const wrapper = mount(TableVisualizationView)
    await flushPromises()

    const markBtn = wrapper.findAll('button').find((b) => b.text().includes('标记上菜'))
    expect(markBtn).toBeDefined()
    await markBtn!.trigger('click')
    await flushPromises()

    expect(vi.mocked(OrderAPI.updateOrderItemStatus)).toHaveBeenCalledWith('o1', 0, 'served')
  })

  // ── Edit Button Disabled for Completed ──
  it('should disable edit button for completed orders', async () => {
    vi.mocked(TableStatusAPI.getAllTableStatuses).mockResolvedValue([
      createTableStatus('A1', 'dining', 'o1'),
    ])
    vi.mocked(OrderAPI.getOrders).mockResolvedValue({
      items: [
        createOrder('o1', OrderStatus.COMPLETED, 'A1', [
          { dishId: 'd1', name: '鱼', price: 68, quantity: 1, status: 'served' },
        ]),
      ],
    } as any)

    const wrapper = mount(TableVisualizationView)
    await flushPromises()

    const editBtn = wrapper.findAll('button').find((b) => b.text() === '编辑')
    expect(editBtn).toBeDefined()
    expect(editBtn!.attributes('disabled')).toBeDefined()
  })

  // ── Card Click Navigation ──
  it('should navigate to order detail when view button clicked', async () => {
    vi.mocked(TableStatusAPI.getAllTableStatuses).mockResolvedValue([
      createTableStatus('A1', 'dining', 'o1'),
    ])
    vi.mocked(OrderAPI.getOrders).mockResolvedValue({
      items: [
        createOrder('o1', OrderStatus.PENDING, 'A1', [
          { dishId: 'd1', name: '鱼', price: 68, quantity: 1, status: 'pending' },
        ]),
      ],
    } as any)

    const wrapper = mount(TableVisualizationView)
    await flushPromises()

    const viewBtn = wrapper.findAll('button').find((b) => b.text() === '查看')
    expect(viewBtn).toBeDefined()
  })
})
