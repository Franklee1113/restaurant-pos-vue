import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { SettingsAPI, type Settings } from '@/api/pocketbase'

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<Settings | null>(null)
  const loading = ref(false)
  const error = ref('')
  const isSaving = ref(false)

  const restaurantName = computed(() => settings.value?.restaurantName || '')
  const address = computed(() => settings.value?.address || '')
  const phone = computed(() => settings.value?.phone || '')
  const categories = computed(() => settings.value?.categories || [])
  const tableNumbers = computed(() => settings.value?.tableNumbers || [])
  const settingsReadOnly = computed(() => settings.value)

  async function fetchSettings(force = false) {
    if (settings.value && !force) return // 已缓存
    loading.value = true
    error.value = ''
    try {
      const data = await SettingsAPI.getSettings()
      settings.value = data
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : '加载设置失败'
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
    if (isSaving.value) return
    isSaving.value = true
    loading.value = true
    error.value = ''
    try {
      const data = await SettingsAPI.updateSettings(settings.value.id, updates)
      settings.value = { ...settings.value, ...data }
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : '保存设置失败'
      throw err
    } finally {
      isSaving.value = false
      loading.value = false
    }
  }

  async function saveSettingsFiles(formData: FormData) {
    if (!settings.value?.id) {
      error.value = '设置数据不存在'
      return
    }
    if (isSaving.value) return
    isSaving.value = true
    loading.value = true
    error.value = ''
    try {
      const data = await SettingsAPI.updateSettingsFiles(settings.value.id, formData)
      settings.value = { ...settings.value, ...data }
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : '保存设置失败'
      throw err
    } finally {
      isSaving.value = false
      loading.value = false
    }
  }

  function addCategory(category: string) {
    if (isSaving.value) return
    const list = categories.value.slice()
    if (!list.includes(category)) {
      list.push(category)
      saveSettings({ categories: list })
    }
  }

  function removeCategory(category: string) {
    if (isSaving.value) return
    const list = categories.value.filter((c) => c !== category)
    saveSettings({ categories: list })
  }

  function addTableNumber(tableNo: string) {
    if (isSaving.value) return
    const list = tableNumbers.value.slice()
    if (!list.includes(tableNo)) {
      list.push(tableNo)
      saveSettings({ tableNumbers: list })
    }
  }

  function removeTableNumber(tableNo: string) {
    if (isSaving.value) return
    const list = tableNumbers.value.filter((t) => t !== tableNo)
    saveSettings({ tableNumbers: list })
  }

  return {
    settings: settingsReadOnly,
    loading,
    error,
    isSaving,
    restaurantName,
    address,
    phone,
    categories,
    tableNumbers,
    fetchSettings,
    saveSettings,
    saveSettingsFiles,
    addCategory,
    removeCategory,
    addTableNumber,
    removeTableNumber,
  }
})
