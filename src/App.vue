<script setup lang="ts">
import { RouterView } from 'vue-router'
import ErrorBoundary from '@/components/ErrorBoundary.vue'
import ToastContainer from '@/components/ToastContainer.vue'
import { useNetworkStatus } from '@/composables/useNetworkStatus'

const { online } = useNetworkStatus()
</script>

<template>
  <!-- P3-1: 离线状态提示条 -->
  <Transition name="fade">
    <div
      v-if="!online"
      class="fixed top-0 left-0 right-0 z-[100] bg-gray-800 text-white text-center text-xs py-1.5 px-4"
    >
      <span class="inline-block w-2 h-2 rounded-full bg-amber-400 mr-2 animate-pulse"></span>
      当前处于离线模式，部分数据可能不是最新的
    </div>
  </Transition>
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

/* P3-1: 离线提示条过渡 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 200ms ease, transform 200ms ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-100%);
}

@media (prefers-reduced-motion: reduce) {
  .page-enter-active,
  .page-leave-active,
  .fade-enter-active,
  .fade-leave-active {
    transition: none;
  }
}
</style>
