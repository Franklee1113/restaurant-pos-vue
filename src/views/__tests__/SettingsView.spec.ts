import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, nextTick } from 'vue'
import SettingsView from '../SettingsView.vue'
import { useSettingsStore } from '@/stores/settings.store'
import { DishAPI } from '@/api/pocketbase'
import { useToast } from '@/composables/useToast'
import { globalConfirm } from '@/composables/useConfirm'

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,abc123'),
  },
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

vi.mock('@/utils/assets', () => ({
  getFileUrl: vi.fn(() => null),
}))

vi.mock('@/stores/settings.store', () => ({
  useSettingsStore: vi.fn(),
}))

vi.mock('@/api/pocketbase', async () => {
  const actual = await vi.importActual<typeof import('@/api/pocketbase')>('@/api/pocketbase')
  return {
    ...actual,
    DishAPI: {
      getDishes: vi.fn(),
      createDish: vi.fn(),
      updateDish: vi.fn(),
      deleteDish: vi.fn(),
    },
  }
})

function createMockSettingsStore() {
  const categories = ['铁锅炖', '凉菜', '主食']
  const tableNumbers = ['A1', 'A2', 'A3']
  return {
    settings: {
      id: 's1',
      restaurantName: '测试餐厅',
      address: '测试地址',
      phone: '13800138000',
      categories,
      tableNumbers,
    },
    categories,
    tableNumbers,
    loading: false,
    fetchSettings: vi.fn(),
    saveSettings: vi.fn(),
    saveSettingsFiles: vi.fn(),
    addCategory: vi.fn(),
    removeCategory: vi.fn(),
    addTableNumber: vi.fn(),
    removeTableNumber: vi.fn(),
  }
}

function mountSettingsView() {
  return mount(SettingsView, {
    global: {
      stubs: {
        SkeletonBox: { template: '<div data-testid="skeleton" />' },
        EmptyState: { template: '<div data-testid="empty-state" />' },
      },
    },
  })
}

describe('SettingsView', () => {
  let store: ReturnType<typeof createMockSettingsStore>
  let toastSuccess: ReturnType<typeof vi.fn>
  let toastError: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    store = createMockSettingsStore()
    toastSuccess = vi.fn()
    toastError = vi.fn()
    vi.mocked(useSettingsStore).mockReturnValue(store as any)
    vi.mocked(useToast).mockReturnValue({
      success: toastSuccess,
      error: toastError,
      info: vi.fn(),
      warning: vi.fn(),
    } as any)
    vi.mocked(DishAPI.getDishes).mockResolvedValue({
      items: [
        { id: 'd1', name: '铁锅鱼', category: '铁锅炖', price: 68, description: '' },
        { id: 'd2', name: '凉拌黄瓜', category: '凉菜', price: 12, description: '' },
      ],
    } as any)
  })

  it('should render settings form on mount', async () => {
    const wrapper = mountSettingsView()
    await flushPromises()
    expect(wrapper.find('h2').text()).toBe('系统设置')
    const vm = wrapper.vm as any
    expect(vm.restaurantName).toBe('测试餐厅')
    expect(vm.address).toBe('测试地址')
  })

  it('should save settings successfully', async () => {
    store.saveSettings.mockResolvedValue(undefined)
    const wrapper = mountSettingsView()
    await flushPromises()

    const vm = wrapper.vm as any
    vm.restaurantName = '新餐厅名'
    await vm.save()
    await flushPromises()

    expect(store.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ restaurantName: '新餐厅名' }))
    expect(toastSuccess).toHaveBeenCalledWith('设置保存成功！')
  })

  it('should show validation errors on invalid settings', async () => {
    const wrapper = mountSettingsView()
    await flushPromises()

    const vm = wrapper.vm as any
    vm.restaurantName = ''
    await vm.save()
    await flushPromises()

    expect(vm.formErrors.restaurantName).toBeDefined()
    expect(store.saveSettings).not.toHaveBeenCalled()
  })

  it('should handle save failure', async () => {
    store.saveSettings.mockRejectedValue(new Error('DB错误'))
    const wrapper = mountSettingsView()
    await flushPromises()

    const vm = wrapper.vm as any
    await vm.save()
    await flushPromises()

    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('保存失败'))
  })

  it('should add category', async () => {
    const wrapper = mountSettingsView()
    await flushPromises()

    const vm = wrapper.vm as any
    vm.newCategory = '新分类'
    await vm.addCategory()
    expect(store.addCategory).toHaveBeenCalledWith('新分类')
    expect(vm.newCategory).toBe('')
  })

  it('should not add empty category', async () => {
    const wrapper = mountSettingsView()
    await flushPromises()

    const vm = wrapper.vm as any
    vm.newCategory = '   '
    await vm.addCategory()
    expect(store.addCategory).not.toHaveBeenCalled()
  })

  it('should remove category', async () => {
    const wrapper = mountSettingsView()
    await flushPromises()

    const vm = wrapper.vm as any
    vm.removeCategory('凉菜')
    expect(store.removeCategory).toHaveBeenCalledWith('凉菜')
  })

  it('should add table number', async () => {
    const wrapper = mountSettingsView()
    await flushPromises()

    const vm = wrapper.vm as any
    vm.newTableNumber = 'B1'
    await vm.addTableNumber()
    expect(store.addTableNumber).toHaveBeenCalledWith('B1')
    expect(vm.newTableNumber).toBe('')
  })

  it('should remove table number', async () => {
    const wrapper = mountSettingsView()
    await flushPromises()

    const vm = wrapper.vm as any
    vm.removeTableNumber('A1')
    expect(store.removeTableNumber).toHaveBeenCalledWith('A1')
  })

  it('should load dishes on mount', async () => {
    mountSettingsView()
    await flushPromises()
    expect(DishAPI.getDishes).toHaveBeenCalled()
  })

  it('should open add dish modal', async () => {
    const wrapper = mountSettingsView()
    await flushPromises()

    const vm = wrapper.vm as any
    vm.openAddDish()
    expect(vm.showModal).toBe(true)
    expect(vm.editingDish).toBeNull()
    expect(vm.dishForm.name).toBe('')
  })

  it('should open edit dish modal', async () => {
    const wrapper = mountSettingsView()
    await flushPromises()

    const vm = wrapper.vm as any
    const dish = { id: 'd1', name: '铁锅鱼', category: '铁锅炖', price: 68, description: '' }
    vm.openEditDish(dish)
    expect(vm.showModal).toBe(true)
    expect(vm.editingDish).toEqual(dish)
    expect(vm.dishForm.name).toBe('铁锅鱼')
  })

  it('should create new dish successfully', async () => {
    vi.mocked(DishAPI.createDish).mockResolvedValue(undefined as any)
    const wrapper = mountSettingsView()
    await flushPromises()

    const vm = wrapper.vm as any
    vm.openAddDish()
    vm.dishForm = { name: '新菜品', category: '凉菜', price: 20, description: '好吃' }
    await vm.saveDish()
    await flushPromises()

    expect(DishAPI.createDish).toHaveBeenCalledWith(expect.objectContaining({ name: '新菜品' }))
    expect(toastSuccess).toHaveBeenCalledWith('菜品添加成功！')
    expect(vm.showModal).toBe(false)
  })

  it('should update existing dish', async () => {
    vi.mocked(DishAPI.updateDish).mockResolvedValue(undefined as any)
    const wrapper = mountSettingsView()
    await flushPromises()

    const vm = wrapper.vm as any
    vm.openEditDish({ id: 'd1', name: '铁锅鱼', category: '铁锅炖', price: 68, description: '' })
    vm.dishForm.price = 78
    await vm.saveDish()
    await flushPromises()

    expect(DishAPI.updateDish).toHaveBeenCalledWith('d1', expect.objectContaining({ price: 78 }))
    expect(toastSuccess).toHaveBeenCalledWith('菜品更新成功！')
  })

  it('should validate dish form before save', async () => {
    const wrapper = mountSettingsView()
    await flushPromises()

    const vm = wrapper.vm as any
    vm.openAddDish()
    vm.dishForm = { name: '', category: '', price: -1, description: '' }
    await vm.saveDish()

    expect(DishAPI.createDish).not.toHaveBeenCalled()
    expect(vm.dishFormErrors.name).toBeDefined()
  })

  it('should delete dish after confirmation', async () => {
    vi.mocked(globalConfirm.confirm).mockResolvedValue(true)
    vi.mocked(DishAPI.deleteDish).mockResolvedValue(undefined as any)

    const wrapper = mountSettingsView()
    await flushPromises()

    const vm = wrapper.vm as any
    await vm.deleteDish({ id: 'd1', name: '铁锅鱼' })
    await flushPromises()

    expect(globalConfirm.confirm).toHaveBeenCalled()
    expect(DishAPI.deleteDish).toHaveBeenCalledWith('d1')
    expect(toastSuccess).toHaveBeenCalledWith('删除成功！')
  })

  it('should handle delete dish failure', async () => {
    vi.mocked(globalConfirm.confirm).mockResolvedValue(true)
    vi.mocked(DishAPI.deleteDish).mockRejectedValue(new Error('DB错误'))

    const wrapper = mountSettingsView()
    await flushPromises()

    const vm = wrapper.vm as any
    await vm.deleteDish({ id: 'd1', name: '铁锅鱼' })
    await flushPromises()

    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('删除失败'))
  })

  it('should filter dishes by category', async () => {
    const wrapper = mountSettingsView()
    await flushPromises()

    const vm = wrapper.vm as any
    expect(vm.filteredDishes.length).toBe(2)
    vm.currentCategory = '凉菜'
    await nextTick()
    expect(vm.filteredDishes.length).toBe(1)
    expect(vm.filteredDishes[0].name).toBe('凉拌黄瓜')
  })

  it('should block downloadQrCodes when no tables', async () => {
    const emptyStore = { ...store, tableNumbers: [] }
    vi.mocked(useSettingsStore).mockReturnValue(emptyStore as any)
    const wrapper = mountSettingsView()
    await flushPromises()

    const vm = wrapper.vm as any
    await vm.downloadQrCodes()
    expect(toastError).toHaveBeenCalledWith('暂无桌号，请先添加桌号')
  })
})
