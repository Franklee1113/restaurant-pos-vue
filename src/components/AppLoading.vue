<script setup lang="ts">
defineProps<{
  visible: boolean
  text?: string
}>()
</script>

<template>
  <Transition
    enter-active-class="transition-opacity duration-200"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition-opacity duration-200"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      v-if="visible"
      class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/30 backdrop-blur-[1px]"
    >
      <div
        class="h-10 w-10 animate-spin rounded-full border-4 border-white border-t-blue-600"
      />
      <p v-if="text" class="mt-3 text-sm font-medium text-white">{{ text }}</p>
    </div>
  </Transition>
</template>
