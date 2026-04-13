<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { OrderAPI, type Order } from '@/api/pocketbase'

const orders = ref<Order[]>([])
const loading = ref(false)
const error = ref('')
const lastOrderIds = ref('')
let timer: ReturnType<typeof setInterval> | null = null

const pendingOrders = computed(() =>
  orders.value.filter((o) => o.status === 'pending').sort((a, b) => +new Date(a.created) - +new Date(b.created)),
)
const cookingOrders = computed(() =>
  orders.value.filter((o) => o.status === 'cooking').sort((a, b) => +new Date(a.created) - +new Date(b.created)),
)

onMounted(() => {
  loadData()
  timer = setInterval(loadData, 10000)
  window.addEventListener('resize', () => {
    // force re-render if needed
  })
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})

async function loadData() {
  loading.value = true
  error.value = ''
  try {
    const filter = `status='pending' || status='cooking'`
    const res = await OrderAPI.getOrders(1, 100, filter)
    const newIds = res.items.map((o) => o.id + o.status + o.updated).join(',')
    const hadNewPending = res.items.some(
      (o) => o.status === 'pending' && !orders.value.find((old) => old.id === o.id),
    )
    orders.value = res.items
    if (hadNewPending && lastOrderIds.value !== '' && newIds !== lastOrderIds.value) {
      playAlertSound()
    }
    lastOrderIds.value = newIds
  } catch (err: any) {
    error.value = err.message || '加载失败'
  } finally {
    loading.value = false
  }
}

function playAlertSound() {
  try {
    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const playTone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.15, ctx.currentTime + start)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration)
      osc.start(ctx.currentTime + start)
      osc.stop(ctx.currentTime + start + duration)
    }
    // 叮咚叮 - 三声提示新订单
    playTone(880, 0, 0.15)
    playTone(1100, 0.2, 0.15)
    playTone(880, 0.4, 0.2)
  } catch {
    // ignore
  }
}

function elapsedMinutes(order: Order) {
  const diff = Date.now() - new Date(order.created).getTime()
  return Math.floor(diff / 60000)
}

function formatTime(created: string) {
  return new Date(created).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div class="min-h-screen bg-gray-900 text-white p-4 md:p-6">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl md:text-3xl font-bold text-yellow-400">🍳 厨房大屏</h1>
      <div class="flex items-center gap-4">
        <div class="text-sm text-gray-400">
          待制作 <span class="text-red-400 font-bold text-lg">{{ pendingOrders.length }}</span> 单
        </div>
        <div class="text-sm text-gray-400">
          制作中 <span class="text-yellow-400 font-bold text-lg">{{ cookingOrders.length }}</span> 单
        </div>
        <div v-if="loading" class="text-xs text-gray-500">刷新中...</div>
        <div v-if="error" class="text-xs text-red-500">{{ error }}</div>
      </div>
    </div>

    <!-- Pending -->
    <section class="mb-8">
      <h2 class="text-xl md:text-2xl font-bold text-red-400 mb-4 flex items-center gap-2">
        <span>🔔 新订单</span>
        <span class="text-sm font-normal text-gray-400">（{{ pendingOrders.length }} 单）</span>
      </h2>
      <div v-if="pendingOrders.length === 0" class="text-gray-500 text-lg py-8">暂无新订单</div>
      <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        <div
          v-for="order in pendingOrders"
          :key="order.id"
          class="bg-red-600 rounded-2xl p-5 shadow-2xl border-4 border-red-400"
        >
          <div class="flex items-center justify-between mb-3">
            <div class="text-4xl md:text-5xl font-extrabold">{{ order.tableNo }}</div>
            <div class="text-right">
              <div class="text-sm opacity-90">下单时间</div>
              <div class="text-xl font-bold">{{ formatTime(order.created) }}</div>
            </div>
          </div>
          <div class="space-y-2 mb-4">
            <div
              v-for="item in order.items"
              :key="item.dishId"
              class="flex items-center justify-between text-lg md:text-xl"
            >
              <span class="font-semibold">{{ item.name }}</span>
              <span class="font-bold text-2xl">×{{ item.quantity }}</span>
            </div>
          </div>
          <div v-if="(order as any).remark" class="text-sm bg-red-700 rounded px-3 py-2 mb-3">
            备注: {{ (order as any).remark }}
          </div>
          <div class="text-xs opacity-80">人数: {{ order.guests || 1 }} 人</div>
        </div>
      </div>
    </section>

    <!-- Cooking -->
    <section>
      <h2 class="text-xl md:text-2xl font-bold text-yellow-400 mb-4 flex items-center gap-2">
        <span>🔥 制作中</span>
        <span class="text-sm font-normal text-gray-400">（{{ cookingOrders.length }} 单）</span>
      </h2>
      <div v-if="cookingOrders.length === 0" class="text-gray-500 text-lg py-8">暂无制作中订单</div>
      <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        <div
          v-for="order in cookingOrders"
          :key="order.id"
          class="rounded-2xl p-5 shadow-2xl border-4"
          :class="elapsedMinutes(order) > 15 ? 'bg-orange-600 border-orange-400 animate-pulse' : 'bg-yellow-500 border-yellow-300 text-gray-900'"
        >
          <div class="flex items-center justify-between mb-3">
            <div class="text-4xl md:text-5xl font-extrabold">{{ order.tableNo }}</div>
            <div class="text-right">
              <div class="text-sm opacity-90">已制作</div>
              <div class="text-3xl font-bold">{{ elapsedMinutes(order) }}<span class="text-lg">分</span></div>
            </div>
          </div>
          <div class="space-y-2 mb-4">
            <div
              v-for="item in order.items"
              :key="item.dishId"
              class="flex items-center justify-between text-lg md:text-xl"
            >
              <span class="font-semibold">{{ item.name }}</span>
              <span class="font-bold text-2xl">×{{ item.quantity }}</span>
            </div>
          </div>
          <div
            v-if="(order as any).remark"
            class="text-sm rounded px-3 py-2 mb-3"
            :class="elapsedMinutes(order) > 15 ? 'bg-orange-700 text-white' : 'bg-yellow-600 text-white'"
          >
            备注: {{ (order as any).remark }}
          </div>
          <div
            class="text-xs opacity-90"
            :class="elapsedMinutes(order) > 15 ? 'text-white' : 'text-gray-800'"
          >
            人数: {{ order.guests || 1 }} 人 | 下单: {{ formatTime(order.created) }}
          </div>
        </div>
      </div>
    </section>

    <!-- Footer hint -->
    <div class="fixed bottom-4 right-4 text-xs text-gray-600">
      厨房显示系统 v1.0 | 每 10 秒自动刷新
    </div>
  </div>
</template>
