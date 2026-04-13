<script setup lang="ts">
import { ref, onMounted } from 'vue'

const loading = ref(true)

onMounted(() => {
  // TODO: 迁移 OrderList.js 逻辑
  setTimeout(() => {
    loading.value = false
  }, 500)
})
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-xl font-bold text-gray-800">订单管理</h2>
      <button class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
        + 新建订单
      </button>
    </div>
    <div v-if="loading" class="text-gray-500">加载中...</div>
    <div v-else class="bg-white rounded-lg shadow p-6 text-gray-500">
      [订单列表页面 - 待迁移]
    </div>
  </div>
</template>
