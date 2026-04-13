import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { SettingsAPI, type Settings } from '@/api/pocketbase'

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<Settings | null>(null)
  const loading = ref(false)
  const error = ref('')

  const restaurantName = computed(() => settings.value?.restaurantName || '')
  const address = computed(() => settings.value?.address || '')
  const phone = computed(() => settings.value?.phone || '')
  const categories = computed(() => settings.value?.categories || [])
  const tableNumbers = computed(() => settings.value?.tableNumbers || [])

  async function fetchSettings() {
    if (settings.value) return // 已缓存
    loading.value = true
    error.value = ''
    try {
      const data = await SettingsAPI.getSettings()
      settings.value = data
    } catch (err: any) {
      error.value = err.message || '加载设置失败'
      console.error('加载设置失败:', err)
    } finally {
      loading.value = false
    }
  }

  async function saveSettings(updates: Partial<Settings>) {
    if (!settings.value?.id) {
      error.value = '设置数据不存在'
      return
    }
    loading.value = true
    error.value = ''
    try {
      const data = await SettingsAPI.updateSettings(settings.value.id, updates)
      settings.value = { ...settings.value, ...data }
    } catch (err: any) {
      error.value = err.message || '保存设置失败'
      throw err
    } finally {
      loading.value = false
    }
  }

  function addCategory(category: string) {
    const list = categories.value.slice()
    if (!list.includes(category)) {
      list.push(category)
      saveSettings({ categories: list })
    }
  }

  function removeCategory(category: string) {
    const list = categories.value.filter((c) => c !== category)
    saveSettings({ categories: list })
  }

  function addTableNumber(tableNo: string) {
    const list = tableNumbers.value.slice()
    if (!list.includes(tableNo)) {
      list.push(tableNo)
      saveSettings({ tableNumbers: list })
    }
  }

  function removeTableNumber(tableNo: string) {
    const list = tableNumbers.value.filter((t) => t !== tableNo)
    saveSettings({ tableNumbers: list })
  }

  return {
    settings,
    loading,
    error,
    restaurantName,
    address,
    phone,
    categories,
    tableNumbers,
    fetchSettings,
    saveSettings,
    addCategory,
    removeCategory,
    addTableNumber,
    removeTableNumber,
  }
})
