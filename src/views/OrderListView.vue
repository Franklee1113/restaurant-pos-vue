<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import * as XLSX from 'xlsx'
import { OrderAPI, type Order } from '@/api/pocketbase'
import { useSettingsStore } from '@/stores/settings.store'
import { OrderStatus, StatusLabels, StatusColors, getStatusButtons } from '@/utils/orderStatus'
import { MoneyCalculator } from '@/utils/security'
import { useToast } from '@/composables/useToast'
import { globalConfirm } from '@/composables/useConfirm'

const router = useRouter()
const settingsStore = useSettingsStore()
const toast = useToast()

const orders = ref<Order[]>([])
const loading = ref(false)
const currentPage = ref(1)
const totalPages = ref(1)
const searchKeyword = ref('')

const filter = ref({
  status: '',
  tableNo: '',
  date: '',
})

let autoRefreshTimer: ReturnType<typeof setInterval> | null = null
let lastOrderIds = ''

const statusOptions = [
  { value: OrderStatus.PENDING, label: StatusLabels[OrderStatus.PENDING] },
  { value: OrderStatus.COOKING, label: StatusLabels[OrderStatus.COOKING] },
  { value: OrderStatus.SERVING, label: StatusLabels[OrderStatus.SERVING] },
  { value: OrderStatus.COMPLETED, label: StatusLabels[OrderStatus.COMPLETED] },
  { value: OrderStatus.CANCELLED, label: StatusLabels[OrderStatus.CANCELLED] },
]

const today = new Date().toDateString()

const pendingTableNumbers = computed(() => {
  const set = new Set<string>()
  orders.value
    .filter((o) => o.status === OrderStatus.PENDING || o.status === OrderStatus.COOKING)
    .forEach((o) => set.add(o.tableNo))
  return Array.from(set)
})

const stats = computed(() => {
  const todayOrders = orders.value.filter((o) => new Date(o.created).toDateString() === today)
  const pendingOrders = orders.value.filter(
    (o) => o.status === OrderStatus.PENDING || o.status === OrderStatus.COOKING,
  )
  const todayAmount = todayOrders.reduce((sum, o) => sum + (o.finalAmount || 0), 0)
  return {
    today: todayOrders.length,
    pending: pendingOrders.length,
    amount: MoneyCalculator.format(todayAmount),
  }
})

onMounted(() => {
  loadOrders()
  settingsStore.fetchSettings()
  startAutoRefresh()
})

onUnmounted(() => {
  stopAutoRefresh()
})

function startAutoRefresh() {
  stopAutoRefresh()
  autoRefreshTimer = setInterval(() => {
    silentRefresh()
  }, 30000)
}

function stopAutoRefresh() {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer)
    autoRefreshTimer = null
  }
}

async function silentRefresh() {
  try {
    const filters: string[] = []
    if (filter.value.status) filters.push(`status='${filter.value.status}'`)
    if (filter.value.tableNo) {
      const safe = filter.value.tableNo.replace(/'/g, "\\'")
      filters.push(`tableNo~'${safe}'`)
    }
    if (filter.value.date) {
      const start = new Date(filter.value.date).toISOString()
      const end = new Date(new Date(filter.value.date).getTime() + 86400000).toISOString()
      filters.push(`created>='${start}' && created<'${end}'`)
    }
    if (searchKeyword.value.trim()) {
      const kw = searchKeyword.value.trim().replace(/'/g, "\\'")
      filters.push(`(orderNo~'${kw}' || tableNo~'${kw}')`)
    }
    const filterStr = filters.join(' && ')
    const res = await OrderAPI.getOrders(currentPage.value, 20, filterStr)

    const newIds = res.items.map((o) => o.id + o.status).join(',')
    const hasNewOrder = res.items.some((o) => !orders.value.find((old) => old.id === o.id))
    const hasCompleted = res.items.some(
      (o) => o.status === OrderStatus.COMPLETED && !orders.value.find((old) => old.id === o.id && old.status === OrderStatus.COMPLETED),
    )

    if (newIds !== lastOrderIds) {
      orders.value = res.items
      totalPages.value = res.totalPages || 1
      lastOrderIds = newIds
      if (hasNewOrder || hasCompleted) {
        playNotificationSound()
      }
    }
  } catch {
    // silent fail on auto refresh
  }
}

function playNotificationSound() {
  try {
    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15)
    gain.gain.setValueAtTime(0.1, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15)
    osc.start()
    osc.stop(ctx.currentTime + 0.2)
  } catch {
    // ignore audio errors
  }
}

async function loadOrders() {
  loading.value = true
  try {
    const filters: string[] = []
    if (filter.value.status) {
      filters.push(`status='${filter.value.status}'`)
    }
    if (filter.value.tableNo) {
      const safe = filter.value.tableNo.replace(/'/g, "\\'")
      filters.push(`tableNo~'${safe}'`)
    }
    if (filter.value.date) {
      const start = new Date(filter.value.date).toISOString()
      const end = new Date(new Date(filter.value.date).getTime() + 86400000).toISOString()
      filters.push(`created>='${start}' && created<'${end}'`)
    }
    if (searchKeyword.value.trim()) {
      const kw = searchKeyword.value.trim().replace(/'/g, "\\'")
      filters.push(`(orderNo~'${kw}' || tableNo~'${kw}')`)
    }
    const filterStr = filters.join(' && ')

    const res = await OrderAPI.getOrders(currentPage.value, 20, filterStr)
    orders.value = res.items
    totalPages.value = res.totalPages || 1
    lastOrderIds = res.items.map((o) => o.id + o.status).join(',')
  } catch (err: any) {
    toast.error('加载订单失败: ' + err.message)
  } finally {
    loading.value = false
  }
}

function applyFilter() {
  currentPage.value = 1
  loadOrders()
}

function resetFilter() {
  filter.value = { status: '', tableNo: '', date: '' }
  searchKeyword.value = ''
  currentPage.value = 1
  loadOrders()
}

function quickFilterTable(tableNo: string) {
  filter.value.tableNo = tableNo
  currentPage.value = 1
  loadOrders()
}

let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null
function onSearchInput() {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
  searchDebounceTimer = setTimeout(() => {
    currentPage.value = 1
    loadOrders()
  }, 400)
}

function goToPage(page: number) {
  if (page < 1 || page > totalPages.value) return
  currentPage.value = page
  loadOrders()
}

function viewOrder(order: Order) {
  router.push({ name: 'orderDetail', params: { orderId: order.id } })
}

function editOrder(order: Order) {
  router.push({ name: 'editOrder', params: { orderId: order.id } })
}

async function deleteOrder(order: Order) {
  const ok = await globalConfirm.confirm({
    title: '确认删除订单',
    description: `确定要删除订单 "${order.orderNo}" 吗？此操作不可恢复。`,
    confirmText: '删除',
    type: 'danger',
  })
  if (!ok) return
  try {
    await OrderAPI.deleteOrder(order.id)
    toast.success('删除成功')
    await loadOrders()
  } catch (err: any) {
    toast.error('删除失败: ' + err.message)
  }
}

async function updateStatus(order: Order, toStatus: string) {
  const statusName = StatusLabels[toStatus as keyof typeof StatusLabels]
  const ok = await globalConfirm.confirm({
    title: '确认变更状态',
    description: `确定要将订单状态变更为"${statusName}"吗？`,
    confirmText: '确定变更',
    type: toStatus === OrderStatus.CANCELLED ? 'danger' : 'default',
  })
  if (!ok) return
  try {
    await OrderAPI.updateOrderStatus(order.id, toStatus)
    toast.success('状态更新成功')
    await loadOrders()
  } catch (err: any) {
    toast.error('状态更新失败: ' + err.message)
  }
}

function getActionButtons(order: Order) {
  return getStatusButtons(order.status as any).map((btn) => ({
    ...btn,
    onClick: () => updateStatus(order, btn.status),
  }))
}

function exportExcel() {
  if (orders.value.length === 0) {
    toast.warning('当前没有订单可导出')
    return
  }
  const rows = orders.value.map((o) => ({
    订单号: o.orderNo,
    桌号: o.tableNo,
    人数: o.guests || 1,
    状态: StatusLabels[o.status as keyof typeof StatusLabels] || o.status,
    菜品数: o.items?.length || 0,
    菜品明细: (o.items || []).map((i) => `${i.name}×${i.quantity}`).join('，'),
    总金额: o.totalAmount || 0,
    折扣: o.discount || 0,
    实付金额: o.finalAmount || 0,
    创建时间: new Date(o.created).toLocaleString('zh-CN'),
    备注: (o as any).remark || '',
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '订单明细')
  const dateStr = new Date().toISOString().split('T')[0]
  XLSX.writeFile(wb, `订单明细_${dateStr}.xlsx`)
  toast.success('导出成功')
}

const visiblePages = computed(() => {
  const pages: (number | string)[] = []
  for (let i = 1; i <= totalPages.value; i++) {
    if (i === 1 || i === totalPages.value || (i >= currentPage.value - 2 && i <= currentPage.value + 2)) {
      pages.push(i)
    } else if (i === currentPage.value - 3 || i === currentPage.value + 3) {
      pages.push('...')
    }
  }
  return pages
})
</script>

<template>
  <div>
    <!-- Header -->
    <div class="flex flex-wrap items-center justify-between gap-3 mb-6">
      <h2 class="text-xl font-bold text-gray-800">订单管理</h2>
      <div class="flex items-center gap-2">
        <button
          class="px-3 py-2 bg-green-50 text-green-700 rounded-md text-sm hover:bg-green-100"
          @click="exportExcel"
        >
          📥 导出 Excel
        </button>
        <button
          class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          @click="$router.push({ name: 'createOrder' })"
        >
          + 新建订单
        </button>
      </div>
    </div>

    <!-- Search & Filters -->
    <div class="bg-white rounded-lg shadow p-4 mb-4 flex flex-wrap items-center gap-3">
      <input
        v-model="searchKeyword"
        type="text"
        placeholder="搜索订单号 / 桌号"
        class="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
        @input="onSearchInput"
      />
      <select
        v-model="filter.status"
        class="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        @change="applyFilter"
      >
        <option value="">全部状态</option>
        <option v-for="s in statusOptions" :key="s.value" :value="s.value">{{ s.label }}</option>
      </select>

      <select
        v-model="filter.tableNo"
        class="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        @change="applyFilter"
      >
        <option value="">全部桌号</option>
        <option v-for="t in settingsStore.tableNumbers" :key="t" :value="t">{{ t }}</option>
      </select>

      <input
        v-model="filter.date"
        type="date"
        class="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        @change="applyFilter"
      />

      <button
        class="px-4 py-2 text-gray-500 text-sm hover:text-gray-700"
        @click="resetFilter"
      >
        重置
      </button>
    </div>

    <!-- Quick Table Filters -->
    <div v-if="pendingTableNumbers.length" class="flex flex-wrap items-center gap-2 mb-4">
      <span class="text-sm text-gray-500">待处理桌号快捷筛选:</span>
      <button
        v-for="t in pendingTableNumbers"
        :key="t"
        :class="[
          'px-2 py-1 rounded-md text-xs font-medium',
          filter.tableNo === t
            ? 'bg-blue-600 text-white'
            : 'bg-blue-50 text-blue-700 hover:bg-blue-100',
        ]"
        @click="quickFilterTable(t)"
      >
        {{ t }}
      </button>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
      <div class="bg-white rounded-lg shadow p-4">
        <div class="text-2xl font-bold text-gray-800">{{ stats.today }}</div>
        <div class="text-sm text-gray-500">今日订单</div>
      </div>
      <div class="bg-white rounded-lg shadow p-4">
        <div class="text-2xl font-bold text-gray-800">{{ stats.pending }}</div>
        <div class="text-sm text-gray-500">待处理</div>
      </div>
      <div class="bg-white rounded-lg shadow p-4">
        <div class="text-2xl font-bold text-gray-800">{{ stats.amount }}</div>
        <div class="text-sm text-gray-500">今日营业额</div>
      </div>
    </div>

    <!-- Table -->
    <div class="bg-white rounded-lg shadow overflow-x-auto">
      <table class="min-w-full divide-y divide-gray-200 whitespace-nowrap">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">订单号</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">桌号</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">人数</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">菜品数</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">金额</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">状态</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">创建时间</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200">
          <tr v-if="loading && orders.length === 0">
            <td colspan="8" class="px-4 py-4 text-center text-gray-500">加载中...</td>
          </tr>
          <tr v-else-if="orders.length === 0">
            <td colspan="8" class="px-4 py-4 text-center text-gray-500">暂无订单</td>
          </tr>
          <tr v-for="order in orders" :key="order.id">
            <td class="px-4 py-3 text-sm text-gray-900 font-medium">{{ order.orderNo || '-' }}</td>
            <td class="px-4 py-3 text-sm text-gray-700">{{ order.tableNo || '-' }}</td>
            <td class="px-4 py-3 text-sm text-gray-700">{{ order.guests || '-' }}人</td>
            <td class="px-4 py-3 text-sm text-gray-700">{{ order.items?.length || 0 }}道</td>
            <td class="px-4 py-3 text-sm text-gray-900 font-medium">{{ MoneyCalculator.format(order.finalAmount || 0) }}</td>
            <td class="px-4 py-3">
              <span
                class="inline-block px-2 py-1 text-xs rounded text-white"
                :style="{ backgroundColor: StatusColors[order.status as keyof typeof StatusColors] || '#999' }"
              >
                {{ StatusLabels[order.status as keyof typeof StatusLabels] || order.status }}
              </span>
            </td>
            <td class="px-4 py-3 text-sm text-gray-500">{{ new Date(order.created).toLocaleString('zh-CN') }}</td>
            <td class="px-4 py-3 text-sm space-x-1">
              <button class="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200" @click="viewOrder(order)">查看</button>
              <button class="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100" @click="editOrder(order)">编辑</button>
              <button
                v-for="btn in getActionButtons(order)"
                :key="btn.status"
                :class="[
                  'px-2 py-1 text-xs rounded',
                  btn.type === 'danger' ? 'bg-red-50 text-red-600 hover:bg-red-100' :
                  btn.type === 'success' ? 'bg-green-50 text-green-600 hover:bg-green-100' :
                  'bg-blue-50 text-blue-600 hover:bg-blue-100'
                ]"
                @click="btn.onClick"
              >
                {{ btn.label }}
              </button>
              <button class="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100" @click="deleteOrder(order)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="flex justify-center items-center gap-2 mt-6">
      <button
        :disabled="currentPage === 1"
        class="px-3 py-1 text-sm rounded border border-gray-300 disabled:opacity-50 hover:bg-gray-50"
        @click="goToPage(currentPage - 1)"
      >
        上一页
      </button>
      <template v-for="p in visiblePages" :key="p">
        <span v-if="p === '...'" class="px-2 text-gray-500">...</span>
        <button
          v-else
          :class="[
            'px-3 py-1 text-sm rounded border',
            currentPage === p
              ? 'bg-blue-600 text-white border-blue-600'
              : 'border-gray-300 hover:bg-gray-50',
          ]"
          @click="goToPage(p as number)"
        >
          {{ p }}
        </button>
      </template>
      <button
        :disabled="currentPage === totalPages"
        class="px-3 py-1 text-sm rounded border border-gray-300 disabled:opacity-50 hover:bg-gray-50"
        @click="goToPage(currentPage + 1)"
      >
        下一页
      </button>
    </div>
  </div>
</template>
