<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { OrderAPI, type Order, type OrderItem } from '@/api/pocketbase'
import { OrderStatus } from '@/utils/orderStatus'
import { useAutoRefresh } from '@/composables/useAutoRefresh'
import { useToast } from '@/composables/useToast'

const toast = useToast()
const orders = ref<Order[]>([])
const loading = ref(false)
const error = ref('')
const lastOrderIds = ref('')

function getItemStatus(item: OrderItem): string {
  return item.status || 'pending'
}

const pendingOrders = computed(() =>
  orders.value
    .filter((o) => (o.items || []).some((i) => getItemStatus(i) === 'pending'))
    .sort((a, b) => +new Date(a.created) - +new Date(b.created)),
)

const cookingOrders = computed(() =>
  orders.value
    .filter((o) => (o.items || []).some((i) => getItemStatus(i) === 'cooking'))
    .sort((a, b) => +new Date(a.created) - +new Date(b.created)),
)

const pendingItemsCount = computed(() =>
  orders.value.reduce((sum, o) => sum + (o.items || []).filter((i) => getItemStatus(i) === 'pending').length, 0),
)

const cookingItemsCount = computed(() =>
  orders.value.reduce((sum, o) => sum + (o.items || []).filter((i) => getItemStatus(i) === 'cooking').length, 0),
)

const cookingOrderMeta = computed(() => {
  const map = new Map<string, { minutes: number; isOverdue: boolean }>()
  const now = Date.now()
  for (const order of cookingOrders.value) {
    const minutes = Math.floor((now - new Date(order.created).getTime()) / 60000)
    map.set(order.id, { minutes, isOverdue: minutes > 15 })
  }
  return map
})

onMounted(() => {
  loadData()
  startAutoRefresh()
})

onUnmounted(() => {
  // cleanup if needed
})

const { start: startAutoRefresh } = useAutoRefresh(loadData, { interval: 10000, immediate: false })

async function loadData() {
  loading.value = true
  error.value = ''
  try {
    const filter = `status='${OrderStatus.PENDING}' || status='${OrderStatus.COOKING}'`
    const res = await OrderAPI.getOrders(1, 100, filter)
    const newIds = res.items.map((o) => o.id + o.status + o.updated).join(',')
    const hadNewPending = res.items.some((o) => {
      const hasNewPending = (o.items || []).some((i) => getItemStatus(i) === 'pending')
      const wasKnown = orders.value.find((old) => old.id === o.id)
      return hasNewPending && !wasKnown
    })
    orders.value = res.items
    if (hadNewPending && lastOrderIds.value !== '' && newIds !== lastOrderIds.value) {
      playAlertSound()
    }
    lastOrderIds.value = newIds
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : '加载失败'
  } finally {
    loading.value = false
  }
}

async function startCooking(order: Order, item: OrderItem) {
  try {
    await OrderAPI.updateOrderItemStatus(order.id, item.dishId, 'cooking')
    toast.success(`${order.tableNo}号桌 ${item.name} 开始制作`)
    await loadData()
  } catch (err: unknown) {
    toast.error('操作失败: ' + (err instanceof Error ? err.message : '未知错误'))
  }
}

async function finishCooking(order: Order, item: OrderItem) {
  try {
    await OrderAPI.updateOrderItemStatus(order.id, item.dishId, 'cooked')
    toast.success(`${order.tableNo}号桌 ${item.name} 已出餐`)
    await loadData()
  } catch (err: unknown) {
    toast.error('操作失败: ' + (err instanceof Error ? err.message : '未知错误'))
  }
}

function playAlertSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
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
    // 关闭 AudioContext 释放资源
    setTimeout(() => ctx.close(), 1000)
  } catch {
    // ignore
  }
}

function formatTime(created: string) {
  return new Date(created).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div class="min-h-screen bg-gray-900 text-white p-4 md:p-6">
    <!-- Header -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
      <h1 class="text-2xl md:text-3xl font-bold text-yellow-400">厨房大屏</h1>
      <div class="flex flex-wrap items-center gap-4">
        <div class="text-sm text-gray-400">
          待制作 <span class="text-red-400 font-bold text-lg">{{ pendingItemsCount }}</span> 道
        </div>
        <div class="text-sm text-gray-400">
          制作中 <span class="text-yellow-400 font-bold text-lg">{{ cookingItemsCount }}</span> 道
        </div>
        <div v-if="loading" class="text-xs text-gray-500">刷新中...</div>
        <div v-if="error" class="text-xs text-red-500">{{ error }}</div>
      </div>
    </div>

    <!-- Pending -->
    <section class="mb-8">
      <h2 class="text-xl md:text-2xl font-bold text-red-400 mb-4 flex items-center gap-2">
        <span>新订单</span>
        <span class="text-sm font-normal text-gray-400">（{{ pendingOrders.length }} 单 / {{ pendingItemsCount }} 道）</span>
      </h2>
      <div v-if="pendingOrders.length === 0" class="flex flex-col items-center justify-center text-gray-500 py-12">
        <div class="text-5xl mb-3">🍳</div>
        <div class="text-lg">暂无新订单</div>
      </div>
      <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        <div
          v-for="order in pendingOrders"
          :key="order.id + '-pending'"
          class="bg-red-600 rounded-2xl p-5 shadow-2xl border-4 border-red-400 flex flex-col"
        >
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2">
              <div class="text-4xl md:text-5xl font-extrabold">{{ order.tableNo }}</div>
              <span v-if="order.source === 'customer'" class="px-2 py-0.5 bg-white/20 rounded text-xs font-medium">顾客</span>
            </div>
            <div class="text-right">
              <div class="text-sm opacity-90">下单时间</div>
              <div class="text-xl font-bold">{{ formatTime(order.created) }}</div>
            </div>
          </div>
          <div class="space-y-0 mb-4 flex-1 divide-y divide-red-500/40">
            <div
              v-for="item in order.items.filter((i) => getItemStatus(i) === 'pending')"
              :key="item.dishId + '-pending'"
              class="grid grid-cols-[minmax(0,1fr)_3.5rem_auto] items-center gap-3 text-lg md:text-xl py-2"
            >
              <span class="font-semibold truncate">{{ item.name }}</span>
              <span class="font-bold text-2xl text-right tabular-nums leading-none">×{{ item.quantity }}</span>
              <button
                class="px-3 py-1.5 bg-white text-red-600 text-sm font-bold rounded-lg hover:bg-gray-100 active:scale-[0.98] transition-transform min-w-[5rem] justify-self-end"
                @click="startCooking(order, item)"
              >
                开始制作
              </button>
            </div>
          </div>
          <div v-if="order.remark" class="text-sm bg-red-700 rounded-lg px-3 py-2 mb-3">
            备注: {{ order.remark }}
          </div>
          <div class="text-xs opacity-80">人数: {{ order.guests || 1 }} 人</div>
        </div>
      </div>
    </section>

    <!-- Cooking -->
    <section>
      <h2 class="text-xl md:text-2xl font-bold text-yellow-400 mb-4 flex items-center gap-2">
        <span>制作中</span>
        <span class="text-sm font-normal text-gray-400">（{{ cookingOrders.length }} 单 / {{ cookingItemsCount }} 道）</span>
      </h2>
      <div v-if="cookingOrders.length === 0" class="flex flex-col items-center justify-center text-gray-500 py-12">
        <div class="text-5xl mb-3">🔥</div>
        <div class="text-lg">暂无制作中订单</div>
      </div>
      <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        <div
          v-for="order in cookingOrders"
          :key="order.id + '-cooking'"
          class="rounded-2xl p-5 shadow-2xl border-4 flex flex-col"
          :class="[
            cookingOrderMeta.get(order.id)?.isOverdue
              ? 'bg-orange-600 border-orange-400 flash-border'
              : 'bg-yellow-500 border-yellow-300 text-gray-900'
          ]"
        >
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2">
              <div class="text-4xl md:text-5xl font-extrabold">{{ order.tableNo }}</div>
              <span
                v-if="order.source === 'customer'"
                class="px-2 py-0.5 rounded text-xs font-medium"
                :class="cookingOrderMeta.get(order.id)?.isOverdue ? 'bg-white/20 text-white' : 'bg-gray-900/10 text-gray-900'"
              >
                顾客
              </span>
            </div>
            <div class="text-right">
              <div class="text-sm opacity-90">已制作</div>
              <div
                class="text-3xl font-bold"
                :class="cookingOrderMeta.get(order.id)?.isOverdue ? 'text-white' : ''"
              >
                {{ cookingOrderMeta.get(order.id)?.minutes }}<span class="text-lg">分</span>
                <span v-if="cookingOrderMeta.get(order.id)?.isOverdue" class="ml-1 text-2xl">🔥</span>
              </div>
            </div>
          </div>
          <div
            class="space-y-0 mb-4 flex-1"
            :class="cookingOrderMeta.get(order.id)?.isOverdue ? 'divide-y divide-white/20' : 'divide-y divide-black/10'"
          >
            <div
              v-for="item in order.items.filter((i) => getItemStatus(i) === 'cooking')"
              :key="item.dishId + '-cooking'"
              class="grid grid-cols-[minmax(0,1fr)_3.5rem_auto] items-center gap-3 text-lg md:text-xl py-2"
            >
              <span class="font-semibold truncate">{{ item.name }}</span>
              <span
                class="font-bold text-2xl text-right tabular-nums leading-none"
                :class="cookingOrderMeta.get(order.id)?.isOverdue ? 'text-white' : ''"
              >
                ×{{ item.quantity }}
              </span>
              <button
                class="px-3 py-1.5 text-sm font-bold rounded-lg active:scale-[0.98] transition-transform min-w-[5rem] justify-self-end"
                :class="cookingOrderMeta.get(order.id)?.isOverdue ? 'bg-white text-orange-600 hover:bg-gray-100' : 'bg-gray-900 text-white hover:bg-gray-800'"
                @click="finishCooking(order, item)"
              >
                已完成
              </button>
            </div>
          </div>
          <div
            v-if="order.remark"
            class="text-sm rounded-lg px-3 py-2 mb-3"
            :class="cookingOrderMeta.get(order.id)?.isOverdue ? 'bg-orange-700 text-white' : 'bg-yellow-600 text-white'"
          >
            备注: {{ order.remark }}
          </div>
          <div
            class="text-xs opacity-90"
            :class="cookingOrderMeta.get(order.id)?.isOverdue ? 'text-white' : 'text-gray-800'"
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

<style>
@keyframes flash-border {
  0%, 100% { border-color: rgba(251, 146, 60, 0.4); }
  50% { border-color: rgba(255, 255, 255, 0.9); }
}

.flash-border {
  animation: flash-border 1s infinite;
}

@media (prefers-reduced-motion: reduce) {
  .flash-border {
    animation: none;
  }
}
</style>
