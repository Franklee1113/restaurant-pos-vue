<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Dish } from '@/api/pocketbase'

const props = defineProps<{
  open: boolean
  dishes: Dish[]
}>()

defineEmits<{
  (e: 'close'): void
  (e: 'toggle', id: string, soldOut: boolean): void
  (e: 'reset-all'): void
}>()

const searchQuery = ref('')
const activeCategory = ref('全部')

const categories = computed(() => {
  const cats = new Set(props.dishes.map((d) => d.category))
  return ['全部', ...Array.from(cats).sort()]
})

const filteredDishes = computed(() => {
  let list = props.dishes
  if (activeCategory.value !== '全部') {
    list = list.filter((d) => d.category === activeCategory.value)
  }
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase()
    list = list.filter((d) => d.name.toLowerCase().includes(q))
  }
  // 已沽清的排在前面，方便管理
  return list.sort((a, b) => {
    if (a.soldOut && !b.soldOut) return -1
    if (!a.soldOut && b.soldOut) return 1
    return a.name.localeCompare(b.name, 'zh-CN')
  })
})

const soldOutCount = computed(() => props.dishes.filter((d) => d.soldOut).length)
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="fixed inset-0 z-50" @click="$emit('close')">
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" />
        <div
          class="absolute right-0 top-0 bottom-0 w-80 max-w-[85vw] bg-white shadow-2xl p-4 flex flex-col"
          @click.stop
        >
          <!-- Header -->
          <div class="flex items-center justify-between mb-4">
            <div>
              <h3 class="font-bold text-lg">今日沽清</h3>
              <div class="text-xs text-gray-500">
                {{ soldOutCount > 0 ? `当前 ${soldOutCount} 道菜品已沽清` : '所有菜品均可正常售卖' }}
              </div>
            </div>
            <button
              class="p-1.5 rounded-full hover:bg-gray-100 transition-colors"
              @click="$emit('close')"
            >
              ✕
            </button>
          </div>

          <!-- Search -->
          <input
            v-model="searchQuery"
            placeholder="搜索菜品"
            class="w-full px-3 py-2 border rounded-lg text-sm mb-3 focus:ring-2 focus:ring-blue-300 focus:outline-none"
          />

          <!-- Category Filter -->
          <div class="flex gap-2 mb-3 overflow-x-auto pb-1">
            <button
              v-for="cat in categories"
              :key="cat"
              :class="[
                'px-2.5 py-1 text-xs rounded-full whitespace-nowrap transition-colors',
                activeCategory === cat
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              ]"
              @click="activeCategory = cat"
            >
              {{ cat }}
            </button>
          </div>

          <!-- List -->
          <div class="flex-1 overflow-y-auto space-y-1.5">
            <div
              v-for="dish in filteredDishes"
              :key="dish.id"
              class="flex items-center justify-between p-3 rounded-lg transition-colors"
              :class="dish.soldOut ? 'bg-red-50' : 'bg-gray-50 hover:bg-gray-100'"
            >
              <div class="min-w-0">
                <div class="text-sm font-medium truncate">{{ dish.name }}</div>
                <div class="text-xs text-gray-500">{{ dish.category }}</div>
                <div v-if="dish.soldOutNote" class="text-xs text-red-400 mt-0.5 truncate">
                  {{ dish.soldOutNote }}
                </div>
              </div>
              <button
                v-if="!dish.soldOut"
                class="ml-2 px-2.5 py-1.5 text-xs bg-red-100 text-red-600 rounded-lg hover:bg-red-200 active:scale-95 transition-transform shrink-0"
                @click="$emit('toggle', dish.id, true)"
              >
                标记
              </button>
              <button
                v-else
                class="ml-2 px-2.5 py-1.5 text-xs bg-green-100 text-green-600 rounded-lg hover:bg-green-200 active:scale-95 transition-transform shrink-0"
                @click="$emit('toggle', dish.id, false)"
              >
                恢复
              </button>
            </div>
          </div>

          <!-- Footer -->
          <div class="pt-3 border-t mt-3 space-y-2">
            <button
              class="w-full py-2.5 text-sm text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 active:scale-[0.98] transition-transform"
              @click="$emit('reset-all')"
            >
              ⚡ 一键清空所有沽清
            </button>
            <div class="text-xs text-gray-400 text-center">
              每日凌晨 04:00 自动清空
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
