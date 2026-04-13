<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'

const route = useRoute()
const authStore = useAuthStore()

const navItems = [
  { path: '/', label: '订单管理', name: 'orderList' },
  { path: '/create-order', label: '新建订单', name: 'createOrder' },
  { path: '/dishes', label: '菜品管理', name: 'dishManagement' },
  { path: '/statistics', label: '数据统计', name: 'statistics' },
  { path: '/settings', label: '系统设置', name: 'settings' },
]
</script>

<template>
  <div class="min-h-screen flex flex-col bg-gray-50">
    <!-- Navigation -->
    <nav class="bg-white shadow-sm border-b border-gray-200">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between h-16">
          <div class="flex items-center gap-8">
            <div class="text-xl font-bold text-blue-600">智能点菜系统</div>
            <div class="hidden md:flex gap-1">
              <RouterLink
                v-for="item in navItems"
                :key="item.name"
                :to="item.path"
                :class="[
                  'px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  route.name === item.name
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                ]"
              >
                {{ item.label }}
              </RouterLink>
            </div>
          </div>
          <div class="flex items-center gap-4">
            <span class="text-sm text-gray-500">{{ authStore.userEmail }}</span>
            <button
              class="text-sm text-gray-600 hover:text-red-600 font-medium"
              @click="authStore.logout"
            >
              退出
            </button>
          </div>
        </div>
      </div>
    </nav>

    <!-- Main Content -->
    <main class="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <RouterView />
    </main>
  </div>
</template>
