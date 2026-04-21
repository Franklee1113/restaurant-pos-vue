import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import StatisticsView from '../StatisticsView.vue'
import { OrderAPI, StatsAPI } from '@/api/pocketbase'
import { useToast } from '@/composables/useToast'
import { OrderStatus } from '@/utils/orderStatus'

// Mock echarts to avoid canvas dependency in jsdom
const mockSetOption = vi.fn()
const mockResize = vi.fn()
const mockDispose = vi.fn()

vi.mock('echarts', () => ({
  init: vi.fn(() => ({
    setOption: mockSetOption,
    resize: mockResize,
    dispose: mockDispose,
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

vi.mock('@/api/pocketbase', async () => {
  const actual = await vi.importActual<typeof import('@/api/pocketbase')>('@/api/pocketbase')
  return {
    ...actual,
    OrderAPI: {
      getOrders: vi.fn(),
    },
    StatsAPI: {
      getStats: vi.fn(),
    },
  }
})

function createBackendStats() {
  return {
    totalRevenue: 1000,
    totalOrders: 10,
    settledOrders: 8,
    completedOrders: 1,
    cancelledOrders: 1,
    averageOrderValue: 125,
    daily: [
      { date: '2026-04-20', revenue: 500, count: 5 },
      { date: '2026-04-21', revenue: 500, count: 5 },
    ],
    hourly: [
      { hour: 11, count: 3, revenue: 300 },
      { hour: 12, count: 7, revenue: 700 },
    ],
    status: [
      { status: OrderStatus.SETTLED, count: 8 },
      { status: OrderStatus.COMPLETED, count: 1 },
      { status: OrderStatus.CANCELLED, count: 1 },
    ],
    dishes: [
      { name: '铁锅鱼', quantity: 5, revenue: 340 },
    ],
    tables: [
      { tableNo: 'A1', revenue: 500, count: 5 },
    ],
  }
}

function mountStatisticsView() {
  return mount(StatisticsView)
}

describe('StatisticsView', () => {
  let toastError: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    toastError = vi.fn()
    vi.mocked(useToast).mockReturnValue({
      success: vi.fn(),
      error: toastError,
      info: vi.fn(),
      warning: vi.fn(),
    } as any)
  })

  it('should load backend stats on mount', async () => {
    vi.mocked(StatsAPI.getStats).mockResolvedValue(createBackendStats() as any)

    const wrapper = mountStatisticsView()
    await flushPromises()

    expect(StatsAPI.getStats).toHaveBeenCalled()
    const vm = wrapper.vm as any
    expect(vm.statsData).not.toBeNull()
    expect(vm.stats.totalRevenue).toBe(1000)
    expect(vm.stats.totalOrders).toBe(10)
    expect(vm.stats.settledOrders).toBe(8)
    expect(vm.stats.completedOrders).toBe(1)
    expect(vm.stats.cancelledOrders).toBe(1)
  })

  it('should fallback to client aggregation when backend stats is null', async () => {
    vi.mocked(StatsAPI.getStats).mockResolvedValue(null)
    vi.mocked(OrderAPI.getOrders).mockResolvedValue({
      items: [
        { id: 'o1', orderNo: 'O001', status: OrderStatus.SETTLED, totalAmount: 100, created: '2026-04-21T10:00:00Z', items: [{ name: '铁锅鱼', price: 68, quantity: 1 }] },
        { id: 'o2', orderNo: 'O002', status: OrderStatus.COMPLETED, totalAmount: 50, created: '2026-04-21T11:00:00Z', items: [{ name: '凉菜', price: 12, quantity: 1 }] },
        { id: 'o3', orderNo: 'O003', status: OrderStatus.CANCELLED, totalAmount: 0, created: '2026-04-21T12:00:00Z', items: [] },
      ],
      totalItems: 3,
      page: 1,
      perPage: 500,
      totalPages: 1,
    } as any)

    const wrapper = mountStatisticsView()
    await flushPromises()

    const vm = wrapper.vm as any
    expect(vm.useBackendStats).toBe(false)
    expect(vm.stats.totalOrders).toBe(3)
    expect(vm.stats.settledOrders).toBe(1)
    expect(vm.stats.completedOrders).toBe(1)
    expect(vm.stats.cancelledOrders).toBe(1)
    expect(vm.stats.totalRevenue).toBe(150)
  })

  it('should handle load data failure', async () => {
    vi.mocked(StatsAPI.getStats).mockRejectedValue(new Error('网络错误'))

    mountStatisticsView()
    await flushPromises()

    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('加载数据失败'))
  })

  it('should change date range to month', async () => {
    vi.mocked(StatsAPI.getStats).mockResolvedValue(createBackendStats() as any)

    const wrapper = mountStatisticsView()
    await flushPromises()

    const vm = wrapper.vm as any
    vm.dateRange = 'month'
    await vm.onDateRangeChange()
    await flushPromises()

    expect(StatsAPI.getStats).toHaveBeenCalledTimes(2)
  })

  it('should change date range to year', async () => {
    vi.mocked(StatsAPI.getStats).mockResolvedValue(createBackendStats() as any)

    const wrapper = mountStatisticsView()
    await flushPromises()

    const vm = wrapper.vm as any
    vm.dateRange = 'year'
    await vm.onDateRangeChange()
    await flushPromises()

    expect(StatsAPI.getStats).toHaveBeenCalledTimes(2)
  })

  it('should switch to custom date range', async () => {
    vi.mocked(StatsAPI.getStats).mockResolvedValue(createBackendStats() as any)

    const wrapper = mountStatisticsView()
    await flushPromises()

    const vm = wrapper.vm as any
    vm.startDate = '2026-04-01'
    vm.endDate = '2026-04-21'
    await vm.onCustomDateChange()
    await flushPromises()

    expect(vm.dateRange).toBe('custom')
    expect(StatsAPI.getStats).toHaveBeenCalledTimes(2)
  })

  it('should calculate top dishes correctly', async () => {
    vi.mocked(StatsAPI.getStats).mockResolvedValue({
      ...createBackendStats(),
      dishes: [
        { name: '铁锅鱼', quantity: 10, revenue: 680 },
        { name: '凉菜', quantity: 5, revenue: 60 },
      ],
    } as any)

    const wrapper = mountStatisticsView()
    await flushPromises()

    const vm = wrapper.vm as any
    expect(vm.topDishes.length).toBe(2)
    expect(vm.topDishes[0].name).toBe('铁锅鱼')
  })

  it('should calculate table ranking correctly', async () => {
    vi.mocked(StatsAPI.getStats).mockResolvedValue({
      ...createBackendStats(),
      tables: [
        { tableNo: 'A1', revenue: 500, count: 5 },
        { tableNo: 'A2', revenue: 300, count: 3 },
      ],
    } as any)

    const wrapper = mountStatisticsView()
    await flushPromises()

    const vm = wrapper.vm as any
    expect(vm.tableRanking.length).toBe(2)
    expect(vm.tableRanking[0].tableNo).toBe('A1')
  })

  it('should filter status list to only show counts > 0', async () => {
    vi.mocked(StatsAPI.getStats).mockResolvedValue({
      ...createBackendStats(),
      status: [
        { status: OrderStatus.SETTLED, count: 8 },
        { status: OrderStatus.PENDING, count: 0 },
      ],
    } as any)

    const wrapper = mountStatisticsView()
    await flushPromises()

    const vm = wrapper.vm as any
    const list = vm.statusList
    expect(list.some((s: any) => s.count === 8)).toBe(true)
    expect(list.some((s: any) => s.count === 0)).toBe(false)
  })

  it('should generate correct date range', async () => {
    vi.mocked(StatsAPI.getStats).mockResolvedValue(createBackendStats() as any)

    const wrapper = mountStatisticsView()
    await flushPromises()

    const vm = wrapper.vm as any
    vm.startDate = '2026-04-20'
    vm.endDate = '2026-04-22'
    const range = vm.getDateRange()
    expect(range).toEqual(['2026-04-20', '2026-04-21', '2026-04-22'])
  })

  it('should sanitize invalid date filter to null', async () => {
    vi.mocked(StatsAPI.getStats).mockResolvedValue(createBackendStats() as any)

    const wrapper = mountStatisticsView()
    await flushPromises()

    const vm = wrapper.vm as any
    expect(vm.sanitizeDateFilter('', '00:00:00')).toBeNull()
    expect(vm.sanitizeDateFilter('invalid', '00:00:00')).toBeNull()
    expect(vm.sanitizeDateFilter('2026-04-21', '12:00:00')).toContain('2026-04-21')
  })

  it('should paginate loadAllOrders correctly', async () => {
    vi.mocked(StatsAPI.getStats).mockResolvedValue(null)
    const items = Array.from({ length: 3 }, (_, i) => ({
      id: `o${i}`, orderNo: `O00${i}`, status: OrderStatus.SETTLED, totalAmount: 100,
      created: '2026-04-21T10:00:00Z', items: [],
    }))
    vi.mocked(OrderAPI.getOrders).mockResolvedValue({
      items,
      totalItems: 3,
      page: 1,
      perPage: 500,
      totalPages: 1,
    } as any)

    const wrapper = mountStatisticsView()
    await flushPromises()

    const vm = wrapper.vm as any
    const orders = await vm.loadAllOrders('')
    expect(orders.length).toBe(3)
    expect(OrderAPI.getOrders).toHaveBeenCalledWith(1, 500, '')
  })
})
