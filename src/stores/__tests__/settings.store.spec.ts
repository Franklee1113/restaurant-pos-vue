import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSettingsStore } from '../settings.store'

const mockSettings = {
  id: 's1',
  restaurantName: '测试餐厅',
  address: '测试路1号',
  phone: '12345678901',
  categories: ['热菜', '凉菜'],
  tableNumbers: ['A1', 'A2'],
}

vi.mock('@/api/pocketbase', async () => {
  return {
    SettingsAPI: {
      getSettings: vi.fn(),
      updateSettings: vi.fn(),
      updateSettingsFiles: vi.fn(),
    },
  }
})

import { SettingsAPI } from '@/api/pocketbase'

describe('settings.store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('should initialize with null settings', () => {
    const store = useSettingsStore()
    expect(store.settings).toBeNull()
    expect(store.loading).toBe(false)
    expect(store.error).toBe('')
    expect(store.categories).toEqual([])
    expect(store.tableNumbers).toEqual([])
  })

  it('should fetch settings and cache them', async () => {
    vi.mocked(SettingsAPI.getSettings).mockResolvedValueOnce(mockSettings as any)

    const store = useSettingsStore()
    await store.fetchSettings()

    expect(store.settings).toEqual(mockSettings)
    expect(store.restaurantName).toBe('测试餐厅')
    expect(store.categories).toEqual(['热菜', '凉菜'])
    expect(SettingsAPI.getSettings).toHaveBeenCalledTimes(1)

    // Second call should not trigger API
    await store.fetchSettings()
    expect(SettingsAPI.getSettings).toHaveBeenCalledTimes(1)
  })

  it('should force refetch when force=true', async () => {
    vi.mocked(SettingsAPI.getSettings).mockResolvedValueOnce(mockSettings as any)

    const store = useSettingsStore()
    await store.fetchSettings()
    await store.fetchSettings(true)

    expect(SettingsAPI.getSettings).toHaveBeenCalledTimes(2)
  })

  it('should handle fetch error', async () => {
    vi.mocked(SettingsAPI.getSettings).mockRejectedValueOnce(new Error('Network down'))

    const store = useSettingsStore()
    await store.fetchSettings()

    expect(store.error).toBe('Network down')
    expect(store.settings).toBeNull()
  })

  it('should save settings and update local state', async () => {
    vi.mocked(SettingsAPI.getSettings).mockResolvedValueOnce(mockSettings as any)
    vi.mocked(SettingsAPI.updateSettings).mockResolvedValueOnce({ restaurantName: '新名字' } as any)

    const store = useSettingsStore()
    await store.fetchSettings()
    await store.saveSettings({ restaurantName: '新名字' })

    expect(SettingsAPI.updateSettings).toHaveBeenCalledWith('s1', { restaurantName: '新名字' })
    expect(store.settings?.restaurantName).toBe('新名字')
  })

  it('should reject save when settings id missing', async () => {
    const store = useSettingsStore()
    await store.saveSettings({ restaurantName: 'x' })
    expect(store.error).toBe('设置数据不存在')
    expect(SettingsAPI.updateSettings).not.toHaveBeenCalled()
  })

  it('should reject concurrent saves', async () => {
    vi.mocked(SettingsAPI.getSettings).mockResolvedValueOnce(mockSettings as any)
    vi.mocked(SettingsAPI.updateSettings).mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 50))
      return {} as any
    })

    const store = useSettingsStore()
    await store.fetchSettings()

    const p1 = store.saveSettings({ restaurantName: 'A' })
    const p2 = store.saveSettings({ restaurantName: 'B' })
    await Promise.all([p1, p2])

    expect(SettingsAPI.updateSettings).toHaveBeenCalledTimes(1)
  })

  it('should add category and save', async () => {
    vi.mocked(SettingsAPI.getSettings).mockResolvedValueOnce(mockSettings as any)
    vi.mocked(SettingsAPI.updateSettings).mockResolvedValueOnce({ categories: ['热菜', '凉菜', '汤'] } as any)

    const store = useSettingsStore()
    await store.fetchSettings()
    await store.addCategory('汤')

    expect(SettingsAPI.updateSettings).toHaveBeenCalledWith('s1', { categories: ['热菜', '凉菜', '汤'] })
  })

  it('should not add duplicate category', async () => {
    vi.mocked(SettingsAPI.getSettings).mockResolvedValueOnce(mockSettings as any)

    const store = useSettingsStore()
    await store.fetchSettings()
    await store.addCategory('热菜')

    expect(SettingsAPI.updateSettings).not.toHaveBeenCalled()
  })

  it('should remove category and save', async () => {
    vi.mocked(SettingsAPI.getSettings).mockResolvedValueOnce(mockSettings as any)
    vi.mocked(SettingsAPI.updateSettings).mockResolvedValueOnce({ categories: ['热菜'] } as any)

    const store = useSettingsStore()
    await store.fetchSettings()
    await store.removeCategory('凉菜')

    expect(SettingsAPI.updateSettings).toHaveBeenCalledWith('s1', { categories: ['热菜'] })
  })

  it('should add table number and save', async () => {
    vi.mocked(SettingsAPI.getSettings).mockResolvedValueOnce(mockSettings as any)
    vi.mocked(SettingsAPI.updateSettings).mockResolvedValueOnce({ tableNumbers: ['A1', 'A2', 'B1'] } as any)

    const store = useSettingsStore()
    await store.fetchSettings()
    await store.addTableNumber('B1')

    expect(SettingsAPI.updateSettings).toHaveBeenCalledWith('s1', { tableNumbers: ['A1', 'A2', 'B1'] })
  })

  it('should remove table number and save', async () => {
    vi.mocked(SettingsAPI.getSettings).mockResolvedValueOnce(mockSettings as any)
    vi.mocked(SettingsAPI.updateSettings).mockResolvedValueOnce({ tableNumbers: ['A1'] } as any)

    const store = useSettingsStore()
    await store.fetchSettings()
    await store.removeTableNumber('A2')

    expect(SettingsAPI.updateSettings).toHaveBeenCalledWith('s1', { tableNumbers: ['A1'] })
  })

  it('should save settings files', async () => {
    vi.mocked(SettingsAPI.getSettings).mockResolvedValueOnce(mockSettings as any)
    vi.mocked(SettingsAPI.updateSettingsFiles).mockResolvedValueOnce({ wechatPayQr: 'qr.png' } as any)

    const store = useSettingsStore()
    await store.fetchSettings()

    const fd = new FormData()
    fd.append('wechatPayQr', new Blob(['x']))
    await store.saveSettingsFiles(fd)

    expect(SettingsAPI.updateSettingsFiles).toHaveBeenCalledWith('s1', fd)
    expect(store.settings?.wechatPayQr).toBe('qr.png')
  })

  it('should reject saveSettingsFiles when settings id missing', async () => {
    const store = useSettingsStore()
    const fd = new FormData()
    await store.saveSettingsFiles(fd)
    expect(store.error).toBe('设置数据不存在')
    expect(SettingsAPI.updateSettingsFiles).not.toHaveBeenCalled()
  })

  it('should throw on saveSettings error', async () => {
    vi.mocked(SettingsAPI.getSettings).mockResolvedValueOnce(mockSettings as any)
    vi.mocked(SettingsAPI.updateSettings).mockRejectedValueOnce(new Error('DB down'))

    const store = useSettingsStore()
    await store.fetchSettings()
    await expect(store.saveSettings({ restaurantName: 'x' })).rejects.toThrow('DB down')
    expect(store.error).toBe('DB down')
  })

  it('should handle addCategory when settings is null', async () => {
    const store = useSettingsStore()
    await store.addCategory('汤')
    expect(SettingsAPI.updateSettings).not.toHaveBeenCalled()
  })

  it('should handle removeCategory when settings is null', async () => {
    const store = useSettingsStore()
    await store.removeCategory('凉菜')
    expect(SettingsAPI.updateSettings).not.toHaveBeenCalled()
  })

  it('should handle addTableNumber when settings is null', async () => {
    const store = useSettingsStore()
    await store.addTableNumber('B1')
    expect(SettingsAPI.updateSettings).not.toHaveBeenCalled()
  })
})
