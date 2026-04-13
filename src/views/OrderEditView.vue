<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()
const orderId = route.params.orderId as string

// TODO: 迁移 EditOrder.js 逻辑
</script>

<template>
  <div class="bg-white rounded-lg shadow p-6 text-gray-500">
    [编辑订单页面 - 待迁移] orderId: {{ orderId }}
  </div>
</template>
