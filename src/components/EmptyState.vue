<script setup lang="ts">
withDefaults(defineProps<{
  title?: string
  description?: string
  icon?: string
}>(), {
  title: '暂无数据',
  description: '',
  icon: '📭',
})
</script>

<template>
  <div class="flex flex-col items-center justify-center py-12 text-center">
    <div class="text-5xl mb-4">{{ icon }}</div>
    <h3 class="text-base font-semibold text-gray-800 mb-1">{{ title }}</h3>
    <p v-if="description" class="text-sm text-gray-500 max-w-xs">{{ description }}</p>
    <div class="mt-4">
      <slot />
    </div>
  </div>
</template>
