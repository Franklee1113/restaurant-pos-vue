<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  open: boolean
  title?: string
  description?: string
  confirmText?: string
  cancelText?: string
  type?: 'default' | 'danger'
}>()

const emit = defineEmits<{
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()

function onKeydown(ev: KeyboardEvent) {
  if (ev.key === 'Escape') emit('cancel')
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

const typeClass =
  props.type === 'danger'
    ? 'bg-red-600 hover:bg-red-700 text-white'
    : 'bg-blue-600 hover:bg-blue-700 text-white'
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-200"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-[90] bg-black/50 backdrop-blur-[1px] flex items-center justify-center p-4"
        @click.self="$emit('cancel')"
      >
        <div class="bg-white rounded-lg shadow-xl w-full max-w-sm p-6">
          <h3 v-if="title" class="text-lg font-semibold text-gray-800 mb-2">{{ title }}</h3>
          <p v-if="description" class="text-sm text-gray-600 mb-6">{{ description }}</p>
          <slot />
          <div class="flex justify-end gap-3 mt-6">
            <button
              class="px-4 py-2 rounded-md text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
              @click="$emit('cancel')"
            >
              {{ cancelText || '取消' }}
            </button>
            <button
              class="px-4 py-2 rounded-md text-sm font-medium"
              :class="typeClass"
              @click="$emit('confirm')"
            >
              {{ confirmText || '确定' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
