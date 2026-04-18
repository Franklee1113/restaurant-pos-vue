<script setup lang="ts">
withDefaults(defineProps<{
  width?: string
  height?: string
  rounded?: string
}>(), {
  width: '100%',
  height: '1rem',
  rounded: 'rounded',
})
</script>

<template>
  <div
    class="animate-pulse bg-gray-200"
    :class="rounded"
    :style="{ width, height }"
  />
</template>
