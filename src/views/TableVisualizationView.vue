<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  OrderAPI,
  TableStatusAPI,
  subscribeToOrders,
  type Order,
  type TableStatus,
  escapePbString,
} from '@/api/pocketbase'
import { useSettingsStore } from '@/stores/settings.store'
import { OrderStatus } from '@/utils/orderStatus'
import { useAutoRefresh } from '@/composables/useAutoRefresh'
import { useToast } from '@/composables/useToast'
import TableCard from '@/components/TableCard.vue'
import EmptyState from '@/components/EmptyState.vue'
import SkeletonBox from '@/components/SkeletonBox.vue'

const router = useRouter()
const settingsStore = useSettingsStore()
const toast = useToast()

// ── State ──
const tableStatuses = ref<TableStatus[]>([])
const activeOrders = ref<Order[]>([])
const loading = ref(false)
const error = ref('')
const searchKeyword = ref('')
const filterCookedOnly = ref(false)
const unsubscribeRealtime = ref<(() => void) | null>(null)
const lastCookedCount = ref(0)
const hasInitialData = ref(false)

// ── Derived ──
const tableStatusMap = computed(() => {
  const map = new Map<string, TableStatus>()
  for (const ts of tableStatuses.value) {
    if (ts.tableNo) map.set(ts.tableNo, ts)
  }
  return map
})

const ordersByTable = computed(() => {
  const map = new Map<string, Order[]>()
  for (const order of activeOrders.value) {
    const list = map.get(order.tableNo) || []
    list.push(order)
    map.set(order.tableNo, list)
  }
  return map
})

function resolveDisplayStatus(ts: TableStatus | undefined, order: Order | null): 'idle' | 'dining' | 'pending_clear' {
  if (!ts || ts.status === 'idle') return 'idle'
  if (order?.status === 'completed') return 'pending_clear'
  return 'dining'
}

function resolvePrimaryOrder(orderList: Order[], currentOrderId?: string): Order | null {
  if (orderList.length === 0) return null
  if (orderList.length === 1) return orderList[0]!
  const matched = orderList.find((o) => o.id === currentOrderId)
  return matched || orderList[0]!
}

const tableCards = computed(() => {
  const allTableNos = settingsStore.settings?.tableNumbers || []
  return allTableNos
    .map((tableNo) => {
      const ts = tableStatusMap.value.get(tableNo)
      const orderList = ordersByTable.value.get(tableNo) || []
      const primaryOrder = resolvePrimaryOrder(orderList, ts?.currentOrderId)
      const displayStatus = resolveDisplayStatus(ts, primaryOrder)
      return {
        tableNo,
        displayStatus,
        tableStatus: ts?.status || 'idle',
        currentOrderId: ts?.currentOrderId,
        order: primaryOrder,
        extraOrders: orderList.length > 1 ? orderList.length - 1 : 0,
      }
    })
    .filter((card) => card.displayStatus !== 'idle')
})

const filteredCards = computed(() => {
  let cards = tableCards.value
  if (searchKeyword.value.trim()) {
    const kw = searchKeyword.value.trim()
    cards = cards.filter((c) => c.tableNo.includes(kw))
  }
  if (filterCookedOnly.value) {
    cards = cards.filter((c) =>
      (c.order?.items || []).some((item) => item.status === 'cooked'),
    )
  }
  return cards
})

const stats = computed(() => {
  const cards = tableCards.value
  const totalTables = settingsStore.settings?.tableNumbers?.length || 0
  const dining = cards.filter((c) => c.displayStatus === 'dining').length
  const pendingClear = cards.filter((c) => c.displayStatus === 'pending_clear').length
  const idle = totalTables - dining - pendingClear
  const cookedCount = cards.reduce((sum, c) => {
    return sum + (c.order?.items || []).filter((i) => i.status === 'cooked').length
  }, 0)
  return { totalTables, dining, pendingClear, idle, cookedCount }
})

// ── Methods ──
function playAlertSound() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const playTone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.12, ctx.currentTime + start)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration)
      osc.start(ctx.currentTime + start)
      osc.stop(ctx.currentTime + start + duration)
    }
    // 嘀嘟 — 两声提示待上菜
    playTone(880, 0, 0.15)
    playTone(1100, 0.2, 0.15)
    setTimeout(() => ctx.close(), 600)
  } catch {
    // ignore
  }
}

function checkNewCooked() {
  const currentCooked = tableCards.value.reduce((sum, c) => {
    return sum + (c.order?.items || []).filter((i) => i.status === 'cooked').length
  }, 0)
  if (hasInitialData.value && currentCooked > lastCookedCount.value) {
    playAlertSound()
  }
  lastCookedCount.value = currentCooked
  hasInitialData.value = true
}

async function loadData() {
  loading.value = true
  error.value = ''
  try {
    // 强制刷新 settings，确保桌号列表最新
    await settingsStore.fetchSettings(true)

    const tableRes = await TableStatusAPI.getAllTableStatuses()
    tableStatuses.value = tableRes

    const diningTables = tableRes.filter((ts) => ts.status === 'dining')

    if (diningTables.length === 0) {
      activeOrders.value = []
      checkNewCooked()
      return
    }

    const tableFilter = diningTables
      .map((t) => `tableNo='${escapePbString(t.tableNo)}'`)
      .join(' || ')
    const filter = `(${tableFilter}) && status!='${OrderStatus.SETTLED}' && status!='${OrderStatus.CANCELLED}'`
    const orderRes = await OrderAPI.getOrders(1, 100, filter)
    activeOrders.value = orderRes.items
    checkNewCooked()
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : '加载失败'
    toast.error(error.value)
  } finally {
    loading.value = false
  }
}

function handleRealtimeUpdate(record: Order) {
  if (record.status === OrderStatus.SETTLED || record.status === OrderStatus.CANCELLED) {
    const idx = activeOrders.value.findIndex((o) => o.id === record.id)
    if (idx !== -1) {
      activeOrders.value.splice(idx, 1)
    }
  } else {
    const idx = activeOrders.value.findIndex((o) => o.id === record.id)
    if (idx !== -1) {
      activeOrders.value[idx] = record
    } else {
      activeOrders.value.push(record)
    }
  }
  // 延迟检测，等待 Vue 响应式更新完成后计算 tableCards
  setTimeout(() => checkNewCooked(), 0)
}

const { start: startAutoRefresh, stop: stopAutoRefresh } = useAutoRefresh(loadData, {
  interval: 10000,
  immediate: false,
})

// ── Lifecycle ──
onMounted(() => {
  loadData()
  subscribeToOrders('', handleRealtimeUpdate)
    .then((unsub) => {
      unsubscribeRealtime.value = unsub
    })
    .catch(() => {
      startAutoRefresh()
    })
})

onUnmounted(() => {
  if (unsubscribeRealtime.value) {
    unsubscribeRealtime.value()
    unsubscribeRealtime.value = null
  }
  stopAutoRefresh()
})
</script>

<template>
  <div>
    <!-- Header -->
    <div class="flex items-center justify-between mb-5">
      <h1 class="text-xl font-bold text-gray-800">桌台全景</h1>
      <div v-if="loading && filteredCards.length === 0" class="text-xs text-gray-400">加载中...</div>
    </div>

    <!-- Error -->
    <div v-if="error && !loading" class="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg">
      {{ error }}
      <button class="ml-2 underline" @click="loadData">重试</button>
    </div>

    <!-- Stats Bar -->
    <div class="grid grid-cols-4 gap-3 mb-5">
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-center">
        <div class="text-2xl font-bold text-orange-600">{{ stats.dining }}</div>
        <div class="text-xs text-gray-500 mt-1">占用中</div>
      </div>
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-center">
        <div class="text-2xl font-bold text-yellow-600">{{ stats.pendingClear }}</div>
        <div class="text-xs text-gray-500 mt-1">待清台</div>
      </div>
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-center">
        <div class="text-2xl font-bold text-green-600">{{ stats.idle }}</div>
        <div class="text-xs text-gray-500 mt-1">空闲</div>
      </div>
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-center">
        <div class="text-2xl font-bold text-green-700">{{ stats.cookedCount }}</div>
        <div class="text-xs text-gray-500 mt-1">待上菜</div>
      </div>
    </div>

    <!-- Filter Bar -->
    <div class="flex flex-wrap items-center gap-3 mb-5">
      <div class="flex items-center gap-2 bg-white rounded-lg shadow-sm border border-gray-100 p-1">
        <button
          class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors"
          :class="!filterCookedOnly ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'"
          @click="filterCookedOnly = false"
        >
          全部桌台
        </button>
        <button
          class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors"
          :class="filterCookedOnly ? 'bg-green-50 text-green-700' : 'text-gray-600 hover:bg-gray-50'"
          @click="filterCookedOnly = true"
        >
          🔔 有待上菜
        </button>
      </div>
      <div class="flex-1 min-w-[200px]">
        <input
          v-model="searchKeyword"
          type="text"
          placeholder="搜索桌号..."
          class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
      <button
        class="px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 active:scale-[0.98] transition-transform"
        @click="loadData"
      >
        ⟳ 刷新
      </button>
    </div>

    <!-- Loading Skeleton -->
    <div v-if="loading && filteredCards.length === 0" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      <div v-for="i in 6" :key="i" class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-3">
        <div class="flex justify-between">
          <SkeletonBox width="60px" height="32px" rounded="rounded-lg" />
          <SkeletonBox width="80px" height="24px" rounded="rounded-full" />
        </div>
        <SkeletonBox width="120px" height="16px" />
        <SkeletonBox width="100%" height="80px" rounded="rounded-lg" />
        <div class="flex gap-2">
          <SkeletonBox width="50px" height="28px" rounded="rounded-md" />
          <SkeletonBox width="50px" height="28px" rounded="rounded-md" />
        </div>
      </div>
    </div>

    <!-- Cards Grid -->
    <div
      v-else-if="filteredCards.length > 0"
      class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
    >
      <TableCard
        v-for="card in filteredCards"
        :key="card.tableNo"
        :table-no="card.tableNo"
        :display-status="card.displayStatus"
        :table-status="card.tableStatus"
        :current-order-id="card.currentOrderId"
        :order="card.order"
        :extra-orders="card.extraOrders"
        @mark-served="loadData"
        @refresh="loadData"
      />
    </div>

    <!-- Empty State -->
    <div v-else-if="!loading">
      <EmptyState
        v-if="tableCards.length === 0"
        title="所有桌台空闲"
        :description="`当前 ${stats.idle} 张桌台可供使用`"
        icon="🎉"
      />
      <EmptyState
        v-else-if="filterCookedOnly"
        title="暂无待上菜的菜品"
        description="厨房暂无出菜，休息一下吧~"
        icon="🍽️"
      />
      <EmptyState
        v-else
        title="没有找到符合条件的桌台"
        description="试试调整搜索关键词"
        icon="🔍"
      />
    </div>
  </div>
</template>
