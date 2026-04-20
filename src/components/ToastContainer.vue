<script setup lang="ts">
import { useToast } from '@/composables/useToast'

const { toasts, remove } = useToast()

const bgMap = {
  success: 'bg-green-600',
  error: 'bg-red-600',
  warning: 'bg-amber-500',
  info: 'bg-blue-600',
}

const iconMap = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 pointer-events-none min-w-[240px] max-w-md">
      <TransitionGroup
        enter-active-class="transition-all duration-300 ease-out"
        enter-from-class="opacity-0 translate-x-4"
        enter-to-class="opacity-100 translate-x-0"
        leave-active-class="transition-all duration-200 ease-in"
        leave-from-class="opacity-100 translate-x-0"
        leave-to-class="opacity-0 translate-x-4"
      >
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="pointer-events-auto min-w-[200px] max-w-sm rounded-lg shadow-lg text-white px-4 py-3 flex items-start gap-3"
          :class="bgMap[toast.type]"
        >
          <span class="font-bold text-lg leading-none mt-0.5">{{ iconMap[toast.type] }}</span>
          <div class="flex-1 text-sm font-medium min-w-0">{{ toast.message }}</div>
          <button
            v-if="toast.action"
            class="ml-1 px-2 py-1 bg-white/20 rounded text-xs hover:bg-white/30 transition-colors shrink-0"
            @click="toast.action.onClick()"
          >
            {{ toast.action.label }}
          </button>
          <button class="text-white/80 hover:text-white text-lg leading-none shrink-0" @click="remove(toast.id)">×</button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>
