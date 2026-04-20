import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import OrderDetailView from '../OrderDetailView.vue'
import { OrderAPI, TableStatusAPI } from '@/api/pocketbase'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from '@/composables/useToast'
import { globalConfirm, useConfirm } from '@/composables/useConfirm'
import { useClearTable } from '@/composables/useClearTable'
import { useBluetoothPrinter, isBluetoothPrintSupported } from '@/composables/useBluetoothPrinter'
import { printBill, printKitchenTicket } from '@/utils/printBill'
import { useSettingsStore } from '@/stores/settings.store'
import { OrderStatus } from '@/utils/orderStatus'

// ─── Module Mocks ───
vi.mock('vue-router', () => ({
  useRoute: vi.fn(() => ({ params: { orderId: 'o123' } })),
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() })),
}))

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

vi.mock('@/composables/useConfirm', () => ({
  useConfirm: vi.fn(() => ({ confirm: vi.fn(), open: ref(false), options: ref({}) })),
  globalConfirm: { confirm: vi.fn() },
}))

vi.mock('@/composables/useClearTable', () => ({
  useClearTable: vi.fn(() => ({
    checkCanClearTable: vi.fn(),
    executeClearTable: vi.fn(),
  })),
}))

vi.mock('@/utils/printBill', () => ({
  printBill: vi.fn(),
  printKitchenTicket: vi.fn(),
}))

vi.mock('@/composables/useBluetoothPrinter', () => ({
  useBluetoothPrinter: vi.fn(() => ({
    print: vi.fn(),
    isConnecting: ref(false),
    lastError: ref(''),
    connectedPrinter: ref(null),
  })),
  isBluetoothPrintSupported: vi.fn(() => true),
  BluetoothPrinterError: class extends Error {},
}))

vi.mock('@/stores/settings.store', () => ({
  useSettingsStore: vi.fn(() => ({
    settings: { restaurantName: '测试餐厅', address: '', phone: '' },
    fetchSettings: vi.fn(),
  })),
}))

vi.mock('@/api/pocketbase', async () => {
  const actual = await vi.importActual<typeof import('@/api/pocketbase')>('@/api/pocketbase')
  return {
    ...actual,
    OrderAPI: {
      getOrder: vi.fn(),
      updateOrderStatus: vi.fn(),
      deleteOrder: vi.fn(),
    },
    TableStatusAPI: {
      getTableStatus: vi.fn(),
    },
  }
})

function createMockOrder(status: string) {
  return {
    id: 'o123',
    orderNo: 'O20260419001',
    tableNo: 'A1',
    guests: 4,
    status,
    source: 'staff',
    items: [
      { dishId: 'd1', name: '铁锅鱼', price: 68, quantity: 1, remark: '', status: 'pending' },
      { dishId: 'd2', name: '锅底', price: 28, quantity: 1, remark: '', status: 'pending' },
    ],
    totalAmount: 96,
    discount: 0,
    finalAmount: 96,
    remark: '少辣',
    created: '2026-04-19T10:00:00.000Z',
    updated: '2026-04-19T10:00:00.000Z',
  }
}

function mountOrderDetailView() {
  return mount(OrderDetailView, {
    global: {
      stubs: {
        EmptyState: {
          template: '<div data-testid="empty-state"><div>{{ title }}</div><div>{{ description }}</div><slot /></div>',
          props: ['title', 'description', 'icon'],
        },
        SkeletonBox: true,
      },
    },
  })
}

describe('OrderDetailView', () => {
  let toastSuccess: ReturnType<typeof vi.fn>
  let toastError: ReturnType<typeof vi.fn>
  let pushMock: ReturnType<typeof vi.fn>
  let replaceMock: ReturnType<typeof vi.fn>
  let confirmMock: ReturnType<typeof vi.fn>
  let checkCanClearTableMock: ReturnType<typeof vi.fn>
  let executeClearTableMock: ReturnType<typeof vi.fn>
  let printBluetoothMock: ReturnType<typeof vi.fn>

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

    pushMock = vi.fn()
    replaceMock = vi.fn()
    vi.mocked(useRouter).mockReturnValue({ push: pushMock, replace: replaceMock, back: vi.fn() } as any)

    confirmMock = vi.fn()
    vi.mocked(useConfirm).mockReturnValue({ confirm: confirmMock, open: ref(false), options: ref({}) } as any)
    ;(globalConfirm as any).confirm = confirmMock

    checkCanClearTableMock = vi.fn()
    executeClearTableMock = vi.fn()
    vi.mocked(useClearTable).mockReturnValue({
      checkCanClearTable: checkCanClearTableMock,
      executeClearTable: executeClearTableMock,
    } as any)

    printBluetoothMock = vi.fn()
    vi.mocked(useBluetoothPrinter).mockReturnValue({
      print: printBluetoothMock,
      isConnecting: ref(false),
      lastError: ref('打印失败'),
      connectedPrinter: ref(null),
    } as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── Load Data ──
  it('should load and display order details on mount', async () => {
    vi.mocked(OrderAPI.getOrder).mockResolvedValue(createMockOrder(OrderStatus.PENDING) as any)
    const wrapper = mountOrderDetailView()
    await flushPromises()

    expect(vi.mocked(OrderAPI.getOrder)).toHaveBeenCalledWith('o123')
    expect(wrapper.text()).toContain('A1')
    expect(wrapper.text()).toContain('O20260419001')
    expect(wrapper.text()).toContain('铁锅鱼')
  })

  it('should show error state when loading fails', async () => {
    vi.mocked(OrderAPI.getOrder).mockRejectedValue(new Error('连接超时'))
    const wrapper = mountOrderDetailView()
    await flushPromises()

    expect(wrapper.text()).toContain('连接超时')
  })

  it('should refresh order when route orderId changes', async () => {
    vi.mocked(OrderAPI.getOrder).mockResolvedValue(createMockOrder(OrderStatus.PENDING) as any)
    mountOrderDetailView()
    await flushPromises()
    expect(vi.mocked(OrderAPI.getOrder)).toHaveBeenCalledTimes(1)

    vi.mocked(useRoute).mockReturnValue({ params: { orderId: 'o456' } } as any)
    vi.mocked(OrderAPI.getOrder).mockResolvedValue({ ...createMockOrder(OrderStatus.PENDING), id: 'o456' } as any)
    const wrapper = mountOrderDetailView()
    await flushPromises()
    expect(vi.mocked(OrderAPI.getOrder)).toHaveBeenCalledWith('o456')
  })

  // ── Status Flow Buttons ──
  it('should render correct status buttons for pending order', async () => {
    vi.mocked(OrderAPI.getOrder).mockResolvedValue(createMockOrder(OrderStatus.PENDING) as any)
    const wrapper = mountOrderDetailView()
    await flushPromises()

    const buttons = wrapper.findAll('button')
    const labels = buttons.map((b) => b.text())
    expect(labels.some((t) => t.includes('标记为制作中'))).toBe(true)
    expect(labels.some((t) => t.includes('取消'))).toBe(true)
  })

  it('should render correct status buttons for cooking order', async () => {
    vi.mocked(OrderAPI.getOrder).mockResolvedValue(createMockOrder(OrderStatus.COOKING) as any)
    const wrapper = mountOrderDetailView()
    await flushPromises()

    const buttons = wrapper.findAll('button')
    const labels = buttons.map((b) => b.text())
    expect(labels.some((t) => t.includes('标记为上菜中'))).toBe(true)
    expect(labels.some((t) => t.includes('取消'))).toBe(true)
  })

  it('should show "ended" hint for settled order', async () => {
    vi.mocked(OrderAPI.getOrder).mockResolvedValue(createMockOrder(OrderStatus.SETTLED) as any)
    const wrapper = mountOrderDetailView()
    await flushPromises()

    expect(wrapper.text()).toContain('已结束')
  })

  it('should show "ended" hint for cancelled order', async () => {
    vi.mocked(OrderAPI.getOrder).mockResolvedValue(createMockOrder(OrderStatus.CANCELLED) as any)
    const wrapper = mountOrderDetailView()
    await flushPromises()

    expect(wrapper.text()).toContain('已结束')
  })

  // ── Status Update ──
  it('should update status after confirmation', async () => {
    vi.mocked(OrderAPI.getOrder).mockResolvedValue(createMockOrder(OrderStatus.PENDING) as any)
    confirmMock.mockResolvedValue(true)
    vi.mocked(OrderAPI.updateOrderStatus).mockResolvedValue({} as any)

    const wrapper = mountOrderDetailView()
    await flushPromises()

    const statusBtn = wrapper.findAll('button').find((b) => b.text().includes('标记为制作中'))
    expect(statusBtn).toBeDefined()
    await statusBtn!.trigger('click')
    await flushPromises()

    expect(confirmMock).toHaveBeenCalled()
    expect(vi.mocked(OrderAPI.updateOrderStatus)).toHaveBeenCalledWith('o123', OrderStatus.COOKING)
    expect(toastSuccess).toHaveBeenCalledWith('状态更新成功！')
    expect(vi.mocked(OrderAPI.getOrder)).toHaveBeenCalledTimes(2) // refresh
  })

  it('should not update status when user cancels confirmation', async () => {
    vi.mocked(OrderAPI.getOrder).mockResolvedValue(createMockOrder(OrderStatus.PENDING) as any)
    confirmMock.mockResolvedValue(false)

    const wrapper = mountOrderDetailView()
    await flushPromises()

    const statusBtn = wrapper.findAll('button').find((b) => b.text().includes('标记为制作中'))
    await statusBtn!.trigger('click')
    await flushPromises()

    expect(vi.mocked(OrderAPI.updateOrderStatus)).not.toHaveBeenCalled()
  })

  it('should show error toast when status update fails', async () => {
    vi.mocked(OrderAPI.getOrder).mockResolvedValue(createMockOrder(OrderStatus.PENDING) as any)
    confirmMock.mockResolvedValue(true)
    vi.mocked(OrderAPI.updateOrderStatus).mockRejectedValue(new Error('状态非法'))

    const wrapper = mountOrderDetailView()
    await flushPromises()

    const statusBtn = wrapper.findAll('button').find((b) => b.text().includes('标记为制作中'))
    await statusBtn!.trigger('click')
    await flushPromises()

    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('状态非法'))
  })

  // ── Clear Table ──
  it('should block clear table when table is already idle', async () => {
    vi.mocked(OrderAPI.getOrder).mockResolvedValue(createMockOrder(OrderStatus.COMPLETED) as any)
    checkCanClearTableMock.mockResolvedValue({ canClear: false, reason: 'idle' })
    confirmMock.mockResolvedValue(true)

    const wrapper = mountOrderDetailView()
    await flushPromises()

    const clearBtn = wrapper.findAll('button').find((b) => b.text().includes('清台（'))
    await clearBtn!.trigger('click')
    await flushPromises()

    expect(checkCanClearTableMock).toHaveBeenCalledWith('A1')
    expect(executeClearTableMock).not.toHaveBeenCalled()
  })

  it('should block clear table when there are unfinished orders', async () => {
    vi.mocked(OrderAPI.getOrder).mockResolvedValue(createMockOrder(OrderStatus.COMPLETED) as any)
    checkCanClearTableMock.mockResolvedValue({ canClear: false, reason: 'unfinished' })
    confirmMock.mockResolvedValue(true)

    const wrapper = mountOrderDetailView()
    await flushPromises()

    const clearBtn = wrapper.findAll('button').find((b) => b.text().includes('清台（'))
    await clearBtn!.trigger('click')
    await flushPromises()

    expect(executeClearTableMock).not.toHaveBeenCalled()
  })

  it('should block clear table when order is still dining', async () => {
    vi.mocked(OrderAPI.getOrder).mockResolvedValue(createMockOrder(OrderStatus.DINING) as any)
    checkCanClearTableMock.mockResolvedValue({ canClear: false, reason: 'dining' })
    confirmMock.mockResolvedValue(true)

    const wrapper = mountOrderDetailView()
    await flushPromises()

    const clearBtn = wrapper.findAll('button').find((b) => b.text().includes('清台'))
    await clearBtn!.trigger('click')
    await flushPromises()

    expect(executeClearTableMock).not.toHaveBeenCalled()
  })

  it('should execute clear table when all checks pass', async () => {
    vi.mocked(OrderAPI.getOrder).mockResolvedValue(createMockOrder(OrderStatus.COMPLETED) as any)
    checkCanClearTableMock.mockResolvedValue({
      canClear: true,
      tableStatus: { id: 'ts1', tableNo: 'A1', status: 'dining', currentOrderId: 'o123' },
    })
    confirmMock.mockResolvedValue(true)
    executeClearTableMock.mockResolvedValue(undefined)

    const wrapper = mountOrderDetailView()
    await flushPromises()

    const clearBtn = wrapper.findAll('button').find((b) => b.text().includes('清台（'))
    await clearBtn!.trigger('click')
    await flushPromises()

    expect(executeClearTableMock).toHaveBeenCalled()
    expect(toastSuccess).toHaveBeenCalledWith('清台成功')
    expect(vi.mocked(OrderAPI.getOrder)).toHaveBeenCalledTimes(2)
  })

  // ── Delete Order ──
  it('should delete order after confirmation and navigate to list', async () => {
    vi.mocked(OrderAPI.getOrder).mockResolvedValue(createMockOrder(OrderStatus.PENDING) as any)
    confirmMock.mockResolvedValue(true)
    vi.mocked(OrderAPI.deleteOrder).mockResolvedValue(true)

    const wrapper = mountOrderDetailView()
    await flushPromises()

    const deleteBtn = wrapper.findAll('button').find((b) => b.text().includes('删除'))
    await deleteBtn!.trigger('click')
    await flushPromises()

    expect(confirmMock).toHaveBeenCalled()
    expect(vi.mocked(OrderAPI.deleteOrder)).toHaveBeenCalledWith('o123')
    expect(toastSuccess).toHaveBeenCalledWith('订单已删除！')
    expect(replaceMock).toHaveBeenCalledWith({ name: 'orderList' })
  })

  it('should not delete when user cancels', async () => {
    vi.mocked(OrderAPI.getOrder).mockResolvedValue(createMockOrder(OrderStatus.PENDING) as any)
    confirmMock.mockResolvedValue(false)

    const wrapper = mountOrderDetailView()
    await flushPromises()

    const deleteBtn = wrapper.findAll('button').find((b) => b.text().includes('删除'))
    await deleteBtn!.trigger('click')
    await flushPromises()

    expect(vi.mocked(OrderAPI.deleteOrder)).not.toHaveBeenCalled()
  })

  // ── Edit Order ──
  it('should navigate to edit order page', async () => {
    vi.mocked(OrderAPI.getOrder).mockResolvedValue(createMockOrder(OrderStatus.PENDING) as any)
    vi.mocked(TableStatusAPI.getTableStatus).mockResolvedValue({ id: 'ts1', tableNo: 'A1', status: 'dining' } as any)

    const wrapper = mountOrderDetailView()
    await flushPromises()

    const editBtn = wrapper.findAll('button').find((b) => b.text().includes('编辑订单'))
    await editBtn!.trigger('click')
    await flushPromises()

    expect(pushMock).toHaveBeenCalledWith({ name: 'editOrder', params: { orderId: 'o123' } })
  })

  it('should block editing settled order', async () => {
    vi.mocked(OrderAPI.getOrder).mockResolvedValue(createMockOrder(OrderStatus.SETTLED) as any)

    const wrapper = mountOrderDetailView()
    await flushPromises()

    const editBtn = wrapper.findAll('button').find((b) => b.text().includes('编辑订单'))
    await editBtn!.trigger('click')
    await flushPromises()

    expect(toastError).toHaveBeenCalledWith('已结账/已清台订单不可编辑')
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('should block editing completed order', async () => {
    vi.mocked(OrderAPI.getOrder).mockResolvedValue(createMockOrder(OrderStatus.COMPLETED) as any)

    const wrapper = mountOrderDetailView()
    await flushPromises()

    const editBtn = wrapper.findAll('button').find((b) => b.text().includes('编辑订单'))
    await editBtn!.trigger('click')
    await flushPromises()

    expect(toastError).toHaveBeenCalledWith('已结账/已清台订单不可编辑')
    expect(pushMock).not.toHaveBeenCalled()
  })

  // ── Print ──
  it('should call printBill when clicking print bill', async () => {
    vi.mocked(OrderAPI.getOrder).mockResolvedValue(createMockOrder(OrderStatus.PENDING) as any)

    const wrapper = mountOrderDetailView()
    await flushPromises()

    const printBtn = wrapper.findAll('button').find((b) => b.text().includes('打印账单'))
    await printBtn!.trigger('click')

    expect(vi.mocked(printBill)).toHaveBeenCalled()
  })

  it('should call printKitchenTicket when clicking print kitchen', async () => {
    vi.mocked(OrderAPI.getOrder).mockResolvedValue(createMockOrder(OrderStatus.PENDING) as any)

    const wrapper = mountOrderDetailView()
    await flushPromises()

    const printBtn = wrapper.findAll('button').find((b) => b.text().includes('打印厨单'))
    await printBtn!.trigger('click')

    expect(vi.mocked(printKitchenTicket)).toHaveBeenCalled()
  })

  it('should call bluetooth print and show success toast', async () => {
    vi.mocked(OrderAPI.getOrder).mockResolvedValue(createMockOrder(OrderStatus.PENDING) as any)
    printBluetoothMock.mockResolvedValue(true)

    const wrapper = mountOrderDetailView()
    await flushPromises()

    const btBtn = wrapper.findAll('button').find((b) => b.text().includes('蓝牙打印'))
    expect(btBtn).toBeDefined()
    await btBtn!.trigger('click')
    await flushPromises()

    expect(printBluetoothMock).toHaveBeenCalled()
    expect(toastSuccess).toHaveBeenCalledWith('蓝牙打印已发送')
  })

  it('should show bluetooth print error when print fails', async () => {
    vi.mocked(OrderAPI.getOrder).mockResolvedValue(createMockOrder(OrderStatus.PENDING) as any)
    printBluetoothMock.mockResolvedValue(false)

    const wrapper = mountOrderDetailView()
    await flushPromises()

    const btBtn = wrapper.findAll('button').find((b) => b.text().includes('蓝牙打印'))
    await btBtn!.trigger('click')
    await flushPromises()

    expect(printBluetoothMock).toHaveBeenCalled()
    expect(toastError).toHaveBeenCalled()
  })

  // ── UI Details ──
  it('should display customer source tag for customer orders', async () => {
    const order = createMockOrder(OrderStatus.PENDING)
    order.source = 'customer'
    vi.mocked(OrderAPI.getOrder).mockResolvedValue(order as any)

    const wrapper = mountOrderDetailView()
    await flushPromises()

    expect(wrapper.text()).toContain('顾客扫码')
  })

  it('should display remark if present', async () => {
    vi.mocked(OrderAPI.getOrder).mockResolvedValue(createMockOrder(OrderStatus.PENDING) as any)

    const wrapper = mountOrderDetailView()
    await flushPromises()

    expect(wrapper.text()).toContain('少辣')
  })

  it('should display correct item status labels', async () => {
    const order = createMockOrder(OrderStatus.PENDING)
    if (order.items[0]) {
      order.items[0].status = 'cooking'
    }
    vi.mocked(OrderAPI.getOrder).mockResolvedValue(order as any)

    const wrapper = mountOrderDetailView()
    await flushPromises()

    expect(wrapper.text()).toContain('制作中')
  })
})
