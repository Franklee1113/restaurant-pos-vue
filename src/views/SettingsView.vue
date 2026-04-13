<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useSettingsStore } from '@/stores/settings.store'
import { settingsFormSchema } from '@/schemas/settings.schema'
import type { ZodError } from 'zod'

const settingsStore = useSettingsStore()

const restaurantName = ref('')
const address = ref('')
const phone = ref('')
const newCategory = ref('')
const newTableNumber = ref('')
const saving = ref(false)
const message = ref('')
const formErrors = ref<Record<string, string>>({})

onMounted(() => {
  settingsStore.fetchSettings()
})

watch(
  () => settingsStore.settings,
  (s) => {
    if (s) {
      restaurantName.value = s.restaurantName || '智能点菜系统'
      address.value = s.address || ''
      phone.value = s.phone || ''
    }
  },
  { immediate: true },
)

function addCategory() {
  const v = newCategory.value.trim()
  if (!v) return
  settingsStore.addCategory(v)
  newCategory.value = ''
}

function removeCategory(category: string) {
  settingsStore.removeCategory(category)
}

function addTableNumber() {
  const v = newTableNumber.value.trim()
  if (!v) return
  settingsStore.addTableNumber(v)
  newTableNumber.value = ''
}

function removeTableNumber(tableNo: string) {
  settingsStore.removeTableNumber(tableNo)
}

async function save() {
  saving.value = true
  message.value = ''
  formErrors.value = {}
  const payload = {
    restaurantName: restaurantName.value.trim(),
    address: address.value.trim(),
    phone: phone.value.trim(),
    categories: settingsStore.categories,
    tableNumbers: settingsStore.tableNumbers,
  }
  const parsed = settingsFormSchema.safeParse(payload)
  if (!parsed.success) {
    ;(parsed.error as ZodError).issues.forEach((issue) => {
      const key = issue.path[0] as string
      if (!formErrors.value[key]) formErrors.value[key] = issue.message
    })
    saving.value = false
    return
  }
  try {
    await settingsStore.saveSettings({
      restaurantName: payload.restaurantName,
      address: payload.address,
      phone: payload.phone,
    })
    message.value = '设置保存成功！'
    setTimeout(() => (message.value = ''), 3000)
  } catch (err: any) {
    message.value = '保存失败: ' + (err.message || '未知错误')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="max-w-3xl">
    <h2 class="text-xl font-bold text-gray-800 mb-6">系统设置</h2>

    <div v-if="settingsStore.loading && !settingsStore.settings" class="text-gray-500">
      加载中...
    </div>

    <div v-else class="space-y-6">
      <!-- 餐厅信息 -->
      <div class="bg-white rounded-lg shadow p-6">
        <h3 class="text-lg font-semibold text-gray-800 mb-4">餐厅信息</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-600 mb-1">餐厅名称</label>
            <input
              v-model="restaurantName"
              type="text"
              :class="[
                'w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2',
                formErrors.restaurantName ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500',
              ]"
            />
            <p v-if="formErrors.restaurantName" class="mt-1 text-xs text-red-600">{{ formErrors.restaurantName }}</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-600 mb-1">地址</label>
            <input
              v-model="address"
              type="text"
              :class="[
                'w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2',
                formErrors.address ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500',
              ]"
            />
            <p v-if="formErrors.address" class="mt-1 text-xs text-red-600">{{ formErrors.address }}</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-600 mb-1">电话</label>
            <input
              v-model="phone"
              type="text"
              :class="[
                'w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2',
                formErrors.phone ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500',
              ]"
            />
            <p v-if="formErrors.phone" class="mt-1 text-xs text-red-600">{{ formErrors.phone }}</p>
          </div>
        </div>
      </div>

      <!-- 菜品分类 -->
      <div class="bg-white rounded-lg shadow p-6">
        <h3 class="text-lg font-semibold text-gray-800 mb-4">菜品分类</h3>
        <div class="flex flex-wrap gap-2 mb-4">
          <span
            v-for="cat in settingsStore.categories"
            :key="cat"
            class="inline-flex items-center gap-1 px-3 py-1 rounded-md text-sm bg-blue-50 text-blue-700"
          >
            {{ cat }}
            <button
              class="text-blue-700 hover:text-blue-900 font-bold"
              @click="removeCategory(cat)"
            >
              ×
            </button>
          </span>
        </div>
        <div class="flex gap-2">
          <input
            v-model="newCategory"
            type="text"
            placeholder="输入新分类"
            class="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            @keyup.enter="addCategory"
          />
          <button
            class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            @click="addCategory"
          >
            添加
          </button>
        </div>
      </div>

      <!-- 桌号管理 -->
      <div class="bg-white rounded-lg shadow p-6">
        <h3 class="text-lg font-semibold text-gray-800 mb-4">桌号管理</h3>
        <div class="flex flex-wrap gap-2 mb-4">
          <span
            v-for="table in settingsStore.tableNumbers"
            :key="table"
            class="inline-flex items-center gap-1 px-3 py-1 rounded-md text-sm bg-green-50 text-green-700"
          >
            {{ table }}
            <button
              class="text-green-700 hover:text-green-900 font-bold"
              @click="removeTableNumber(table)"
            >
              ×
            </button>
          </span>
        </div>
        <div class="flex gap-2">
          <input
            v-model="newTableNumber"
            type="text"
            placeholder="输入新桌号"
            class="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            @keyup.enter="addTableNumber"
          />
          <button
            class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            @click="addTableNumber"
          >
            添加
          </button>
        </div>
      </div>

      <!-- 保存 -->
      <div class="bg-white rounded-lg shadow p-6">
        <div
          v-if="message"
          :class="[
            'mb-4 px-4 py-2 rounded-md text-sm',
            message.includes('失败') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700',
          ]"
        >
          {{ message }}
        </div>
        <button
          :disabled="saving || settingsStore.loading"
          class="w-full py-3 px-4 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
          @click="save"
        >
          {{ saving ? '保存中...' : '保存设置' }}
        </button>
      </div>
    </div>
  </div>
</template>
