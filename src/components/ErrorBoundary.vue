<script setup lang="ts">
import { ref, onErrorCaptured } from 'vue'

const error = ref<Error | null>(null)
const errorInfo = ref('')

onErrorCaptured((err, instance, info) => {
  error.value = err instanceof Error ? err : new Error(String(err))
  errorInfo.value = info
  console.error('[ErrorBoundary] 捕获到错误:', err, info)
  return false // 阻止错误继续向上传播
})

function reset() {
  error.value = null
  errorInfo.value = ''
  window.location.reload()
}
</script>

<template>
  <div v-if="error" class="min-h-[50vh] flex items-center justify-center p-6">
    <div class="max-w-md w-full bg-white rounded-lg shadow-lg p-6 text-center">
      <div class="mx-auto mb-4 h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
        <span class="text-2xl">⚠️</span>
      </div>
      <h2 class="text-lg font-semibold text-gray-800 mb-2">页面出现错误</h2>
      <p class="text-sm text-gray-600 mb-4">
        系统运行过程中遇到了意外问题，请尝试刷新页面或返回首页。
      </p>
      <div class="bg-gray-50 rounded-md p-3 text-left mb-4">
        <p class="text-xs text-gray-500 font-mono break-all">{{ error.message }}</p>
        <p v-if="errorInfo" class="text-xs text-gray-400 mt-1">{{ errorInfo }}</p>
      </div>
      <div class="flex justify-center gap-3">
        <button
          class="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
          @click="reset"
        >
          刷新页面
        </button>
        <a
          href="/"
          class="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-md hover:bg-gray-200"
        >
          返回首页
        </a>
      </div>
    </div>
  </div>
  <slot v-else />
</template>
