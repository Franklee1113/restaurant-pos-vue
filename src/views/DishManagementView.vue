<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { DishAPI, type Dish } from '@/api/pocketbase'
import { useSettingsStore } from '@/stores/settings.store'
import { escapeHtml } from '@/utils/security'
import { dishFormSchema } from '@/schemas/dish.schema'
import type { ZodError } from 'zod'

const settingsStore = useSettingsStore()

const dishes = ref<Dish[]>([])
const loading = ref(false)
const currentCategory = ref('all')
const showModal = ref(false)
const editingDish = ref<Dish | null>(null)

const form = ref({
  name: '',
  category: '',
  price: 0,
  description: '',
})

const filteredDishes = computed(() => {
  if (currentCategory.value === 'all') return dishes.value
  return dishes.value.filter((d) => d.category === currentCategory.value)
})

onMounted(() => {
  loadDishes()
  settingsStore.fetchSettings()
})

async function loadDishes() {
  loading.value = true
  try {
    const res = await DishAPI.getDishes()
    dishes.value = res.items
  } catch (err: any) {
    alert('加载菜品失败: ' + err.message)
  } finally {
    loading.value = false
  }
}

function openAdd() {
  editingDish.value = null
  form.value = {
    name: '',
    category: settingsStore.categories[0] || '',
    price: 0,
    description: '',
  }
  showModal.value = true
}

function openEdit(dish: Dish) {
  editingDish.value = dish
  form.value = {
    name: dish.name,
    category: dish.category,
    price: dish.price,
    description: (dish as any).description || '',
  }
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  editingDish.value = null
}

const formErrors = ref<Record<string, string>>({})

async function saveDish() {
  formErrors.value = {}
  const parsed = dishFormSchema.safeParse(form.value)
  if (!parsed.success) {
    ;(parsed.error as ZodError).issues.forEach((issue) => {
      const key = issue.path[0] as string
      if (!formErrors.value[key]) formErrors.value[key] = issue.message
    })
    return
  }
  try {
    const data = { ...form.value }
    if (editingDish.value) {
      await DishAPI.updateDish(editingDish.value.id, data)
      alert('菜品更新成功！')
    } else {
      await DishAPI.createDish(data)
      alert('菜品添加成功！')
    }
    closeModal()
    await loadDishes()
  } catch (err: any) {
    alert('保存失败: ' + err.message)
  }
}

async function deleteDish(dish: Dish) {
  if (!confirm(`确定要删除菜品 "${dish.name}" 吗？`)) return
  try {
    await DishAPI.deleteDish(dish.id)
    alert('删除成功！')
    await loadDishes()
  } catch (err: any) {
    alert('删除失败: ' + err.message)
  }
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-xl font-bold text-gray-800">菜品管理</h2>
      <button
        class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        @click="openAdd"
      >
        + 添加菜品
      </button>
    </div>

    <!-- 分类筛选 -->
    <div class="flex flex-wrap gap-2 mb-4">
      <button
        :class="[
          'px-3 py-1 rounded-md text-sm font-medium transition-colors',
          currentCategory === 'all'
            ? 'bg-blue-600 text-white'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
        ]"
        @click="currentCategory = 'all'"
      >
        全部
      </button>
      <button
        v-for="cat in settingsStore.categories"
        :key="cat"
        :class="[
          'px-3 py-1 rounded-md text-sm font-medium transition-colors',
          currentCategory === cat
            ? 'bg-blue-600 text-white'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
        ]"
        @click="currentCategory = cat"
      >
        {{ cat }}
      </button>
    </div>

    <!-- 表格 -->
    <div class="bg-white rounded-lg shadow overflow-x-auto">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">菜品名称</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">分类</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">价格</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">描述</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          <tr v-if="loading">
            <td colspan="5" class="px-6 py-4 text-center text-gray-500">加载中...</td>
          </tr>
          <tr v-else-if="filteredDishes.length === 0">
            <td colspan="5" class="px-6 py-4 text-center text-gray-500">暂无菜品</td>
          </tr>
          <tr v-for="dish in filteredDishes" :key="dish.id">
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{{ dish.name }}</td>
            <td class="px-6 py-4 whitespace-nowrap">
              <span class="px-2 py-1 text-xs rounded-md bg-gray-100 text-gray-700">{{ dish.category }}</span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">¥{{ dish.price.toFixed(2) }}</td>
            <td class="px-6 py-4 text-sm text-gray-500">{{ (dish as any).description || '-' }}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm space-x-2">
              <button
                class="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                @click="openEdit(dish)"
              >
                编辑
              </button>
              <button
                class="px-3 py-1 text-sm bg-red-50 text-red-600 rounded hover:bg-red-100"
                @click="deleteDish(dish)"
              >
                删除
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Modal -->
    <div
      v-if="showModal"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4"
      @click.self="closeModal"
    >
      <div class="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-gray-800">
            {{ editingDish ? '编辑菜品' : '添加菜品' }}
          </h3>
          <button class="text-2xl text-gray-400 hover:text-gray-600" @click="closeModal">×</button>
        </div>

        <form @submit.prevent="saveDish" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-600 mb-1">菜品名称 *</label>
            <input
              v-model="form.name"
              type="text"
              :class="[
                'w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2',
                formErrors.name ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500',
              ]"
            />
            <p v-if="formErrors.name" class="mt-1 text-xs text-red-600">{{ formErrors.name }}</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-600 mb-1">分类 *</label>
            <select
              v-model="form.category"
              :class="[
                'w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2',
                formErrors.category ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500',
              ]"
            >
              <option v-for="cat in settingsStore.categories" :key="cat" :value="cat">{{ cat }}</option>
            </select>
            <p v-if="formErrors.category" class="mt-1 text-xs text-red-600">{{ formErrors.category }}</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-600 mb-1">价格 *</label>
            <input
              v-model.number="form.price"
              type="number"
              min="0"
              step="0.01"
              :class="[
                'w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2',
                formErrors.price ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500',
              ]"
            />
            <p v-if="formErrors.price" class="mt-1 text-xs text-red-600">{{ formErrors.price }}</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-600 mb-1">描述</label>
            <textarea
              v-model="form.description"
              rows="3"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div class="flex justify-end gap-3 pt-2">
            <button
              type="button"
              class="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
              @click="closeModal"
            >
              取消
            </button>
            <button
              type="submit"
              class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
