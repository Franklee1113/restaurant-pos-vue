<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { DishAPI, type Dish } from '@/api/pocketbase'
import { useSettingsStore } from '@/stores/settings.store'
import { settingsFormSchema } from '@/schemas/settings.schema'
import { dishFormSchema } from '@/schemas/dish.schema'
import { useToast } from '@/composables/useToast'
import { globalConfirm } from '@/composables/useConfirm'
import { getFileUrl } from '@/utils/assets'
import QRCode from 'qrcode'
import SkeletonBox from '@/components/SkeletonBox.vue'
import EmptyState from '@/components/EmptyState.vue'

const settingsStore = useSettingsStore()
const toast = useToast()

// 餐厅信息
const restaurantName = ref('')
const address = ref('')
const phone = ref('')
const newCategory = ref('')
const newTableNumber = ref('')
const saving = ref(false)
const message = ref('')
const formErrors = ref<Record<string, string>>({})
const wechatQrFile = ref<File | null>(null)
const alipayQrFile = ref<File | null>(null)

// 菜品维护
const dishes = ref<Dish[]>([])
const dishesLoading = ref(false)
const currentCategory = ref('all')
const showModal = ref(false)
const editingDish = ref<Dish | null>(null)
const savingDish = ref(false)

const dishForm = ref({
  name: '',
  category: '',
  price: 0,
  description: '',
})

const dishFormErrors = ref<Record<string, string>>({})

const filteredDishes = computed(() => {
  if (currentCategory.value === 'all') return dishes.value
  return dishes.value.filter((d) => d.category === currentCategory.value)
})

onMounted(() => {
  settingsStore.fetchSettings()
  loadDishes()
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

// 餐厅设置
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

function getQrUrl(fieldName: 'wechatPayQr' | 'alipayQr'): string | null {
  return getFileUrl('settings', settingsStore.settings?.id, settingsStore.settings?.[fieldName])
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
    parsed.error.issues.forEach((issue) => {
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
    if (wechatQrFile.value || alipayQrFile.value) {
      const fd = new FormData()
      if (wechatQrFile.value) fd.append('wechatPayQr', wechatQrFile.value)
      if (alipayQrFile.value) fd.append('alipayQr', alipayQrFile.value)
      await settingsStore.saveSettingsFiles(fd)
      wechatQrFile.value = null
      alipayQrFile.value = null
    }
    toast.success('设置保存成功！')
  } catch (err: unknown) {
    toast.error('保存失败: ' + (err instanceof Error ? err.message : '未知错误'))
  } finally {
    saving.value = false
  }
}

// 菜品维护
async function loadDishes() {
  dishesLoading.value = true
  try {
    const res = await DishAPI.getDishes()
    dishes.value = res.items
  } catch (err: unknown) {
    toast.error('加载菜品失败: ' + (err instanceof Error ? err.message : '未知错误'))
  } finally {
    dishesLoading.value = false
  }
}

function openAddDish() {
  editingDish.value = null
  dishForm.value = {
    name: '',
    category: settingsStore.categories[0] || '',
    price: 0,
    description: '',
  }
  dishFormErrors.value = {}
  showModal.value = true
}

function openEditDish(dish: Dish) {
  editingDish.value = dish
  dishForm.value = {
    name: dish.name,
    category: dish.category,
    price: dish.price,
    description: dish.description || '',
  }
  dishFormErrors.value = {}
  showModal.value = true
}

function closeDishModal() {
  showModal.value = false
  editingDish.value = null
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

async function saveDish() {
  if (savingDish.value) return
  dishFormErrors.value = {}
  const parsed = dishFormSchema.safeParse(dishForm.value)
  if (!parsed.success) {
    parsed.error.issues.forEach((issue) => {
      const key = issue.path[0] as string
      if (!dishFormErrors.value[key]) dishFormErrors.value[key] = issue.message
    })
    return
  }
  savingDish.value = true
  try {
    const data = { ...dishForm.value }
    if (editingDish.value) {
      await DishAPI.updateDish(editingDish.value.id, data)
      toast.success('菜品更新成功！')
    } else {
      await DishAPI.createDish(data)
      toast.success('菜品添加成功！')
    }
    closeDishModal()
    await loadDishes()
  } catch (err: unknown) {
    toast.error('保存失败: ' + (err instanceof Error ? err.message : '未知错误'))
  } finally {
    savingDish.value = false
  }
}

async function deleteDish(dish: Dish) {
  const ok = await globalConfirm.confirm({
    title: '确认删除菜品',
    description: `确定要删除菜品 "${dish.name}" 吗？`,
    confirmText: '删除',
    type: 'danger',
  })
  if (!ok) return
  try {
    await DishAPI.deleteDish(dish.id)
    toast.success('删除成功！')
    await loadDishes()
  } catch (err: unknown) {
    toast.error('删除失败: ' + (err instanceof Error ? err.message : '未知错误'))
  }
}

async function downloadQrCodes() {
  const tables = settingsStore.tableNumbers
  if (tables.length === 0) {
    toast.error('暂无桌号，请先添加桌号')
    return
  }
  try {
    const baseUrl = window.location.origin
    const cards = await Promise.all(
      tables.map(async (t) => {
        const url = `${baseUrl}/customer-order?table=${encodeURIComponent(t)}`
        const dataUrl = await QRCode.toDataURL(url, { width: 200, margin: 2 })
        const safeT = escapeHtml(t)
        return `
          <div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:16px;border:1px dashed #ccc;border-radius:8px;width:240px;">
            <div style="font-size:20px;font-weight:bold;">${safeT} 号桌</div>
            <img src="${dataUrl}" style="width:180px;height:180px;" />
            <div style="font-size:12px;color:#666;text-align:center;">微信/支付宝扫码点餐</div>
          </div>
        `
      }),
    )
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>桌位二维码</title>
  <style>
    body { font-family: sans-serif; padding: 20px; background: #f5f5f5; }
    .grid { display: flex; flex-wrap: wrap; gap: 16px; justify-content: center; }
    .no-print { text-align: center; margin-bottom: 20px; }
    button { padding: 10px 20px; font-size: 14px; cursor: pointer; margin: 0 5px; }
    @media print {
      .no-print { display: none; }
      body { background: #fff; }
    }
  </style>
</head>
<body>
  <div class="no-print">
    <button onclick="window.print()">打印二维码</button>
    <button onclick="window.close()">关闭</button>
    <p style="color:#666;font-size:12px;">建议用 A4 纸打印后裁剪，贴在餐桌上</p>
  </div>
  <div class="grid">${cards.join('')}</div>
</body>
</html>`
    const w = window.open('', '_blank', 'width=900,height=700')
    if (w) {
      w.document.write(html)
      w.document.close()
    }
  } catch (err: unknown) {
    toast.error('生成二维码失败: ' + (err instanceof Error ? err.message : '未知错误'))
  }
}
</script>

<template>
  <div class="max-w-6xl">
    <h2 class="text-xl font-bold text-gray-800 mb-5">系统设置</h2>

    <div v-if="settingsStore.loading && !settingsStore.settings" class="space-y-4">
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-3">
        <SkeletonBox width="120px" height="20px" />
        <SkeletonBox width="100%" height="40px" />
        <SkeletonBox width="100%" height="40px" />
      </div>
    </div>

    <EmptyState v-else-if="!settingsStore.settings" title="加载失败" description="无法获取设置数据，请稍后重试" icon="⚠️" />

    <div v-else class="space-y-5">
      <!-- 餐厅信息 -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div class="flex items-center gap-2 mb-4">
          <div class="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-sm">🏪</div>
          <h3 class="text-base font-semibold text-gray-800">餐厅信息</h3>
        </div>
        <div class="space-y-4 max-w-3xl">
          <div>
            <label class="block text-sm font-medium text-gray-600 mb-1">餐厅名称</label>
            <input
              v-model="restaurantName"
              type="text"
              :class="[
                'w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 transition-shadow duration-200',
                formErrors.restaurantName ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500',
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
                'w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 transition-shadow duration-200',
                formErrors.address ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500',
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
                'w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 transition-shadow duration-200',
                formErrors.phone ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500',
              ]"
            />
            <p v-if="formErrors.phone" class="mt-1 text-xs text-red-600">{{ formErrors.phone }}</p>
          </div>
        </div>
      </div>

      <!-- 菜品分类 -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div class="flex items-center gap-2 mb-4">
          <div class="w-8 h-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center text-sm">🏷️</div>
          <h3 class="text-base font-semibold text-gray-800">菜品分类</h3>
        </div>
        <div class="flex flex-wrap gap-2 mb-4">
          <span
            v-for="cat in settingsStore.categories"
            :key="cat"
            class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm bg-blue-50 text-blue-700 border border-blue-100"
          >
            {{ cat }}
            <button
              class="text-blue-700 hover:text-blue-900 font-bold w-4 h-4 flex items-center justify-center rounded hover:bg-blue-100"
              @click="removeCategory(cat)"
            >
              ×
            </button>
          </span>
          <span v-if="settingsStore.categories.length === 0" class="text-sm text-gray-400">暂无分类</span>
        </div>
        <div class="flex gap-2 max-w-md">
          <input
            v-model="newCategory"
            type="text"
            placeholder="输入新分类"
            class="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow duration-200"
            @keyup.enter="addCategory"
          />
          <button
            class="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 active:scale-[0.98] transition-transform"
            @click="addCategory"
          >
            添加
          </button>
        </div>
      </div>

      <!-- 桌号管理 -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div class="flex items-center gap-2 mb-4">
          <div class="w-8 h-8 rounded-full bg-green-50 text-green-600 flex items-center justify-center text-sm">🪑</div>
          <h3 class="text-base font-semibold text-gray-800">桌号管理</h3>
        </div>
        <div class="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2 mb-4 max-w-3xl">
          <div
            v-for="table in settingsStore.tableNumbers"
            :key="table"
            class="relative group aspect-square flex items-center justify-center rounded-lg bg-green-50 text-green-700 border border-green-100 text-sm font-medium"
          >
            {{ table }}
            <button
              class="absolute -top-1 -right-1 w-5 h-5 bg-white text-green-700 rounded-full shadow border border-green-100 text-xs font-bold hidden group-hover:flex items-center justify-center"
              @click="removeTableNumber(table)"
            >
              ×
            </button>
          </div>
          <div v-if="settingsStore.tableNumbers.length === 0" class="col-span-full text-sm text-gray-400 py-2">
            暂无桌号
          </div>
        </div>
        <div class="flex flex-wrap gap-2 max-w-md">
          <input
            v-model="newTableNumber"
            type="text"
            placeholder="输入新桌号"
            class="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow duration-200"
            @keyup.enter="addTableNumber"
          />
          <button
            class="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 active:scale-[0.98] transition-transform"
            @click="addTableNumber"
          >
            添加
          </button>
          <button
            class="px-4 py-2 bg-white text-gray-700 border border-gray-300 font-medium rounded-lg hover:bg-gray-50 active:scale-[0.98] transition-transform"
            @click="downloadQrCodes"
          >
            下载点餐二维码
          </button>
        </div>
      </div>

      <!-- 收款码设置 -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div class="flex items-center gap-2 mb-4">
          <div class="w-8 h-8 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center text-sm">💰</div>
          <h3 class="text-base font-semibold text-gray-800">收款码设置</h3>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl">
          <div>
            <label class="block text-sm font-medium text-gray-600 mb-2">微信收款码</label>
            <input
              type="file"
              accept="image/*"
              class="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              @change="(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) wechatQrFile = f }"
            />
            <div v-if="getQrUrl('wechatPayQr')" class="mt-3">
              <img :src="getQrUrl('wechatPayQr')!" alt="微信收款码" class="w-32 h-32 object-contain border rounded-lg" />
            </div>
            <div v-else class="mt-3 text-sm text-gray-400">暂无图片</div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-600 mb-2">支付宝收款码</label>
            <input
              type="file"
              accept="image/*"
              class="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              @change="(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) alipayQrFile = f }"
            />
            <div v-if="getQrUrl('alipayQr')" class="mt-3">
              <img :src="getQrUrl('alipayQr')!" alt="支付宝收款码" class="w-32 h-32 object-contain border rounded-lg" />
            </div>
            <div v-else class="mt-3 text-sm text-gray-400">暂无图片</div>
          </div>
        </div>
        <p class="mt-4 text-xs text-gray-500">提示：上传个人收款码后，账单打印和订单详情页将展示二维码供顾客扫码付款。</p>
      </div>

      <!-- 菜品维护 -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center text-sm">🍽️</div>
            <h3 class="text-base font-semibold text-gray-800">菜品维护</h3>
          </div>
          <button
            class="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 shadow-sm active:scale-[0.98] transition-transform"
            @click="openAddDish"
          >
            + 添加菜品
          </button>
        </div>

        <!-- Mobile Category Tabs -->
        <div class="md:hidden flex gap-2 overflow-x-auto pb-2 mb-3">
          <button
            :class="[
              'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors',
              currentCategory === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
            ]"
            @click="currentCategory = 'all'"
          >
            全部
          </button>
          <button
            v-for="cat in settingsStore.categories"
            :key="cat"
            :class="[
              'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors',
              currentCategory === cat ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
            ]"
            @click="currentCategory = cat"
          >
            {{ cat }}
          </button>
        </div>

        <div class="flex flex-col md:flex-row gap-4">
          <!-- Desktop Sidebar -->
          <aside class="hidden md:block w-44 flex-shrink-0">
            <div class="bg-gray-50 rounded-xl p-3 border border-gray-100">
              <div class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-2">分类筛选</div>
              <div class="space-y-1">
                <button
                  :class="[
                    'w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    currentCategory === 'all'
                      ? 'bg-white text-blue-700 shadow-sm border border-gray-100'
                      : 'text-gray-700 hover:bg-white hover:shadow-sm',
                  ]"
                  @click="currentCategory = 'all'"
                >
                  全部菜品
                </button>
                <button
                  v-for="cat in settingsStore.categories"
                  :key="cat"
                  :class="[
                    'w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    currentCategory === cat
                      ? 'bg-white text-blue-700 shadow-sm border border-gray-100'
                      : 'text-gray-700 hover:bg-white hover:shadow-sm',
                  ]"
                  @click="currentCategory = cat"
                >
                  {{ cat }}
                </button>
              </div>
            </div>
          </aside>

          <!-- Main Content -->
          <div class="flex-1 min-w-0">
            <!-- Table Desktop -->
            <div class="hidden md:block bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200">
                  <thead class="bg-gray-50">
                    <tr>
                      <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">菜品</th>
                      <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">分类</th>
                      <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">价格</th>
                      <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">描述</th>
                      <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
                    </tr>
                  </thead>
                  <tbody class="bg-white divide-y divide-gray-200">
                    <tr v-if="dishesLoading">
                      <td colspan="5" class="px-4 py-6">
                        <div class="space-y-3">
                          <div v-for="i in 4" :key="i" class="flex gap-3">
                            <SkeletonBox width="160px" height="16px" />
                            <SkeletonBox width="60px" height="16px" />
                            <SkeletonBox width="60px" height="16px" />
                            <SkeletonBox width="120px" height="16px" />
                            <SkeletonBox width="80px" height="16px" />
                          </div>
                        </div>
                      </td>
                    </tr>
                    <tr v-else-if="filteredDishes.length === 0">
                      <td colspan="5">
                        <EmptyState title="暂无菜品" description="该分类下还没有菜品" icon="🍽️">
                          <button class="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700" @click="openAddDish">
                            添加菜品
                          </button>
                        </EmptyState>
                      </td>
                    </tr>
                    <tr v-for="dish in filteredDishes" :key="dish.id" class="hover:bg-gray-50 transition-colors">
                      <td class="px-4 py-3">
                        <div class="flex items-center gap-3">
                          <div class="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 text-lg">🍽️</div>
                          <div class="font-medium text-sm text-gray-900">{{ dish.name }}</div>
                        </div>
                      </td>
                      <td class="px-4 py-3 whitespace-nowrap">
                        <span class="px-2 py-1 text-xs rounded-lg bg-gray-100 text-gray-700">{{ dish.category }}</span>
                      </td>
                      <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{{ (dish.price ?? 0).toFixed(2) }}</td>
                      <td class="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">{{ dish.description || '-' }}</td>
                      <td class="px-4 py-3 whitespace-nowrap text-sm">
                        <div class="flex items-center gap-2">
                          <button
                            class="px-3 py-1.5 text-xs font-medium bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 active:scale-[0.98] transition-transform"
                            @click="openEditDish(dish)"
                          >
                            编辑
                          </button>
                          <button
                            class="px-3 py-1.5 text-xs font-medium bg-red-50 text-red-600 border border-red-100 rounded-lg hover:bg-red-100 active:scale-[0.98] transition-transform"
                            @click="deleteDish(dish)"
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Mobile Cards -->
            <div class="md:hidden space-y-3">
              <template v-if="dishesLoading">
                <div v-for="i in 4" :key="i" class="bg-white rounded-xl border border-gray-100 p-4 flex gap-3">
                  <SkeletonBox width="48px" height="48px" rounded="rounded-lg" />
                  <div class="flex-1 space-y-2">
                    <SkeletonBox width="60%" height="16px" />
                    <SkeletonBox width="40%" height="14px" />
                  </div>
                </div>
              </template>

              <EmptyState v-else-if="filteredDishes.length === 0" title="暂无菜品" description="该分类下还没有菜品" icon="🍽️" />

              <div
                v-for="dish in filteredDishes"
                :key="dish.id"
                class="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3"
              >
                <div class="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 text-xl flex-shrink-0">🍽️</div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2 mb-1">
                    <div class="font-medium text-gray-900 truncate">{{ dish.name }}</div>
                    <span class="px-1.5 py-0.5 text-[10px] rounded bg-gray-100 text-gray-600 flex-shrink-0">{{ dish.category }}</span>
                  </div>
                  <div class="text-sm text-red-500 font-semibold">{{ (dish.price ?? 0).toFixed(2) }}</div>
                  <div v-if="dish.description" class="text-xs text-gray-500 truncate">{{ dish.description }}</div>
                </div>
                <div class="flex flex-col gap-2 flex-shrink-0">
                  <button class="px-2.5 py-1 text-xs font-medium bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50" @click="openEditDish(dish)">编辑</button>
                  <button class="px-2.5 py-1 text-xs font-medium bg-red-50 text-red-600 border border-red-100 rounded-lg hover:bg-red-100" @click="deleteDish(dish)">删除</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 保存 -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div
          v-if="message"
          :class="[
            'mb-4 px-4 py-2 rounded-lg text-sm',
            message.includes('失败') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700',
          ]"
        >
          {{ message }}
        </div>
        <button
          :disabled="saving || settingsStore.loading"
          class="w-full py-3 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 active:scale-[0.98] transition-transform"
          @click="save"
        >
          {{ saving ? '保存中...' : '保存设置' }}
        </button>
      </div>
    </div>

    <!-- Dish Modal -->
    <div
      v-if="showModal"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4"
      @click.self="closeDishModal"
    >
      <div class="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div class="flex items-center justify-between mb-5">
          <h3 class="text-lg font-semibold text-gray-800">
            {{ editingDish ? '编辑菜品' : '添加菜品' }}
          </h3>
          <button class="text-2xl text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100" @click="closeDishModal">×</button>
        </div>

        <form @submit.prevent="saveDish" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-600 mb-1">菜品名称 *</label>
            <input
              v-model="dishForm.name"
              type="text"
              :class="[
                'w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 transition-shadow duration-200',
                dishFormErrors.name ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500',
              ]"
            />
            <p v-if="dishFormErrors.name" class="mt-1 text-xs text-red-600">{{ dishFormErrors.name }}</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-600 mb-1">分类 *</label>
            <select
              v-model="dishForm.category"
              :class="[
                'w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 transition-shadow duration-200',
                dishFormErrors.category ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500',
              ]"
            >
              <option v-for="cat in settingsStore.categories" :key="cat" :value="cat">{{ cat }}</option>
            </select>
            <p v-if="dishFormErrors.category" class="mt-1 text-xs text-red-600">{{ dishFormErrors.category }}</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-600 mb-1">价格 *</label>
            <input
              v-model.number="dishForm.price"
              type="number"
              min="0"
              step="0.01"
              :class="[
                'w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 transition-shadow duration-200',
                dishFormErrors.price ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500',
              ]"
            />
            <p v-if="dishFormErrors.price" class="mt-1 text-xs text-red-600">{{ dishFormErrors.price }}</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-600 mb-1">描述</label>
            <textarea
              v-model="dishForm.description"
              rows="3"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow duration-200"
            />
          </div>
          <div class="flex justify-end gap-3 pt-2">
            <button
              type="button"
              class="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium active:scale-[0.98] transition-transform"
              @click="closeDishModal"
            >
              取消
            </button>
            <button
              type="submit"
              :disabled="savingDish"
              class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              {{ savingDish ? '保存中...' : '保存' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
