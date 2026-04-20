<script setup lang="ts">
import type { Dish } from '@/api/pocketbase'

defineProps<{
  open: boolean
  dish: Dish | null
}>()

defineEmits<{
  (e: 'close'): void
  (e: 'mark-sold-out', note?: string): void
  (e: 'mark-available'): void
}>()
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="fixed inset-0 z-50" @click="$emit('close')">
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" />
        <div
          class="absolute bottom-0 left-0 right-0 bg-white rounded-t-xl p-4 space-y-2 animate-slide-up"
          @click.stop
        >
          <div class="w-12 h-1 bg-gray-300 rounded-full mx-auto mb-3" />
          <div class="text-center text-sm text-gray-500 pb-2">
            {{ dish?.name }} — ¥{{ dish?.price }}
          </div>

          <!-- 备注输入（仅标记沽清时） -->
          <div v-if="!dish?.soldOut" class="space-y-2">
            <input
              type="text"
              placeholder="备注（如：今日无货、约30分钟后恢复）"
              class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-red-300 focus:outline-none"
              @keydown.enter="$emit('mark-sold-out', ($event.target as HTMLInputElement).value)"
            />
            <button
              class="w-full py-3.5 text-red-600 font-medium bg-red-50 rounded-xl hover:bg-red-100 active:scale-[0.98] transition-transform"
              @click="$emit('mark-sold-out')"
            >
              ⚠️ 标记为"已沽清"
            </button>
          </div>

          <button
            v-else
            class="w-full py-3.5 text-green-600 font-medium bg-green-50 rounded-xl hover:bg-green-100 active:scale-[0.98] transition-transform"
            @click="$emit('mark-available')"
          >
            ✅ 恢复售卖
          </button>

          <button
            class="w-full py-3.5 text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 active:scale-[0.98] transition-transform"
            @click="$emit('close')"
          >
            取消
          </button>
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

.animate-slide-up {
  animation: slideUp 0.25s ease-out;
}

@keyframes slideUp {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}
</style>
