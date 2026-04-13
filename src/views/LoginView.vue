<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'

const router = useRouter()
const authStore = useAuthStore()

const email = ref('admin@restaurant.com')
const password = ref('REDACTED_DEFAULT_PASSWORD')
const loading = ref(false)
const error = ref('')

async function handleSubmit() {
  loading.value = true
  error.value = ''
  const result = await authStore.login(email.value, password.value)
  loading.value = false
  if (result.success) {
    router.replace({ name: 'orderList' })
  } else {
    error.value = result.error || '登录失败'
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 px-4">
    <div class="w-full max-w-sm bg-white rounded-lg shadow-xl p-8">
      <h1 class="text-2xl font-bold text-center text-gray-800 mb-6">智能点菜系统</h1>

      <form @submit.prevent="handleSubmit" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-600 mb-1">邮箱</label>
          <input
            v-model="email"
            type="email"
            required
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-600 mb-1">密码</label>
          <input
            v-model="password"
            type="password"
            required
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div
          v-if="error"
          class="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md"
        >
          {{ error }}
        </div>

        <button
          type="submit"
          :disabled="loading"
          class="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors disabled:opacity-50"
        >
          {{ loading ? '登录中...' : '登录' }}
        </button>
      </form>

      <div class="mt-6 text-xs text-gray-500 bg-gray-50 rounded-md p-3">
        <p class="font-medium mb-1">默认账号:</p>
        <p>邮箱: admin@restaurant.com</p>
        <p>密码: REDACTED_DEFAULT_PASSWORD</p>
      </div>
    </div>
  </div>
</template>
