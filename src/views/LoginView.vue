<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'

const router = useRouter()
const authStore = useAuthStore()

const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')
const shake = ref(false)
const isDev = import.meta.env.DEV

async function handleSubmit() {
  loading.value = true
  error.value = ''
  const result = await authStore.login(email.value, password.value)
  loading.value = false
  if (result.success) {
    router.replace({ name: 'orderList' })
  } else {
    error.value = result.error || '登录失败'
    shake.value = true
    setTimeout(() => (shake.value = false), 300)
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 px-4">
    <div
      class="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8 transition-transform duration-300"
      :class="shake ? 'animate-[shake_0.3s_ease-in-out]' : ''"
    >
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 text-blue-600 text-3xl mb-4">
          🍽️
        </div>
        <h1 class="text-2xl font-bold text-gray-800">智能点菜系统</h1>
        <p class="text-sm text-gray-500 mt-1">餐厅数字化管理平台</p>
      </div>

      <form @submit.prevent="handleSubmit" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-600 mb-1">邮箱</label>
          <input
            v-model="email"
            type="email"
            required
            class="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow duration-200"
            placeholder="请输入邮箱"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-600 mb-1">密码</label>
          <input
            v-model="password"
            type="password"
            required
            class="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow duration-200"
            placeholder="请输入密码"
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
          class="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium rounded-lg transition-colors disabled:opacity-50 active:scale-[0.98] transform"
        >
          {{ loading ? '登录中...' : '登录' }}
        </button>
      </form>

      <div v-if="isDev" class="mt-6 text-xs text-gray-500 bg-gray-50 rounded-md p-3">
        <p class="font-medium mb-1">开发环境默认账号:</p>
        <p>邮箱: admin@restaurant.com</p>
        <p>密码: REDACTED_DEFAULT_PASSWORD</p>
      </div>
    </div>
  </div>
</template>

<style>
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-4px); }
  40%, 80% { transform: translateX(4px); }
}

@media (prefers-reduced-motion: reduce) {
  .animate-\[shake_0\.3s_ease-in-out\] {
    animation: none;
  }
}
</style>
