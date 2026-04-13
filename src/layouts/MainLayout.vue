<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'
import { useGlobalLoading } from '@/composables/useGlobalLoading'
import { globalConfirm } from '@/composables/useConfirm'
import AppLoading from '@/components/AppLoading.vue'
import ToastContainer from '@/components/ToastContainer.vue'
import DialogModal from '@/components/DialogModal.vue'

const route = useRoute()
const authStore = useAuthStore()
const { visible: loadingVisible, text: loadingText } = useGlobalLoading()
const mobileMenuOpen = ref(false)

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
    <AppLoading :visible="loadingVisible" :text="loadingText" />
    <ToastContainer />
    <DialogModal
      :open="globalConfirm.open.value"
      :title="globalConfirm.options.value.title"
      :description="globalConfirm.options.value.description"
      :confirm-text="globalConfirm.options.value.confirmText"
      :cancel-text="globalConfirm.options.value.cancelText"
      :type="globalConfirm.options.value.type"
      @confirm="globalConfirm.onConfirm"
      @cancel="globalConfirm.onCancel"
    />

    <!-- Navigation -->
    <nav class="bg-white shadow-sm border-b border-gray-200">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between h-16">
          <div class="flex items-center gap-4 md:gap-8">
            <div class="text-lg md:text-xl font-bold text-blue-600">智能点菜系统</div>
            <!-- Desktop Nav -->
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

          <div class="flex items-center gap-3 md:gap-4">
            <span class="text-sm text-gray-500 hidden sm:block">{{ authStore.userEmail }}</span>
            <button
              class="text-sm text-gray-600 hover:text-red-600 font-medium hidden md:block"
              @click="authStore.logout"
            >
              退出
            </button>
            <!-- Mobile menu button -->
            <button
              class="md:hidden p-2 rounded-md text-gray-600 hover:bg-gray-100"
              @click="mobileMenuOpen = !mobileMenuOpen"
            >
              <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  v-if="!mobileMenuOpen"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M4 6h16M4 12h16M4 18h16"
                />
                <path
                  v-else
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- Mobile Nav -->
      <div v-if="mobileMenuOpen" class="md:hidden border-t border-gray-200 bg-white">
        <div class="px-2 pt-2 pb-3 space-y-1">
          <RouterLink
            v-for="item in navItems"
            :key="item.name"
            :to="item.path"
            :class="[
              'block px-3 py-2 rounded-md text-base font-medium',
              route.name === item.name
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
            ]"
            @click="mobileMenuOpen = false"
          >
            {{ item.label }}
          </RouterLink>
          <div class="border-t border-gray-200 mt-2 pt-2">
            <div class="px-3 py-2 text-sm text-gray-500">{{ authStore.userEmail }}</div>
            <button
              class="block w-full text-left px-3 py-2 text-base font-medium text-gray-600 hover:text-red-600 hover:bg-gray-100 rounded-md"
              @click="authStore.logout"
            >
              退出
            </button>
          </div>
        </div>
      </div>
    </nav>

    <!-- Main Content -->
    <main class="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-6">
      <RouterView />
    </main>
  </div>
</template>
