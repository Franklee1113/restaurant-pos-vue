<script setup lang="ts">
import { RouterView } from 'vue-router'
import ErrorBoundary from '@/components/ErrorBoundary.vue'
import ToastContainer from '@/components/ToastContainer.vue'
</script>

<template>
  <ErrorBoundary>
    <RouterView v-slot="{ Component }">
      <Transition
        name="page"
        mode="out-in"
      >
        <component :is="Component" />
      </Transition>
    </RouterView>
  </ErrorBoundary>
  <ToastContainer />
</template>

<style>
.page-enter-active,
.page-leave-active {
  transition: opacity 150ms ease, transform 150ms ease;
}
.page-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.page-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (prefers-reduced-motion: reduce) {
  .page-enter-active,
  .page-leave-active {
    transition: none;
  }
}
</style>
