<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import * as XLSX from '@e965/xlsx'
import { OrderAPI, PublicOrderAPI, TableStatusAPI, type Order, type TableStatus, escapePbString } from '@/api/pocketbase'
import { useSettingsStore } from '@/stores/settings.store'
import { OrderStatus, StatusLabels, getStatusButtons, type OrderStatusValue, StatusBadgeClass as statusBadgeClass } from '@/utils/orderStatus'
import { MoneyCalculator } from '@/utils/security'
import { useToast } from '@/composables/useToast'
import { globalConfirm } from '@/composables/useConfirm'
import { useAutoRefresh } from '@/composables/useAutoRefresh'
import { usePagination } from '@/composables/usePagination'
import { useDebounce } from '@/composables/useDebounce'
import { useClearTable } from '@/composables/useClearTable'
import EmptyState from '@/components/EmptyState.vue'
import SkeletonBox from '@/components/SkeletonBox.vue'

const router = useRouter()
const settingsStore = useSettingsStore()
const toast = useToast()

const orders = ref<Order[]>([])
const tableStatuses = ref<TableStatus[]>([])
const loading = ref(false)
const processing = ref(false)
const searchKeyword = ref('')

const { checkCanClearTable, executeClearTable } = useClearTable()
let lastOrderIds = ''

const filter = ref({
  status: '' as '' | OrderStatusValue,
  tableNo: '',
  date: '',
})

const tableStatusMap = computed(() => {
  const map = new Map<string, TableStatus>()
  tableStatuses.value.forEach((ts) => {
    if (ts.tableNo) map.set(ts.tableNo, ts)
  })
  return map
})

const { currentPage, totalPages, visiblePages, goToPage, reset: resetPage, setTotal } = usePagination(1)

const { debouncedFn: onSearchInput } = useDebounce(() => {
  resetPage()
  loadOrders()
}, 400)

const statusOptions = [
  { value: OrderStatus.PENDING, label: StatusLabels[OrderStatus.PENDING] },
  { value: OrderStatus.COOKING, label: StatusLabels[OrderStatus.COOKING] },
  { value: OrderStatus.SERVING, label: StatusLabels[OrderStatus.SERVING] },
  { value: OrderStatus.COMPLETED, label: StatusLabels[OrderStatus.COMPLETED] },
  { value: OrderStatus.SETTLED, label: StatusLabels[OrderStatus.SETTLED] },
  { value: OrderStatus.CANCELLED, label: StatusLabels[OrderStatus.CANCELLED] },
]

const pendingTableNumbers = computed(() => {
  const set = new Set<string>()
  orders.value
    .filter((o) => o.status === OrderStatus.PENDING || o.status === OrderStatus.COOKING)
    .forEach((o) => set.add(o.tableNo))
  return Array.from(set)
})

// P1-18: 使用时区安全的日期比较
function getLocalDateKey(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const stats = computed(() => {
  const todayStr = getLocalDateKey(new Date().toISOString())
  const todayOrders = orders.value.filter((o) => getLocalDateKey(o.created) === todayStr)
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

function sanitizePbLike(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9\u4e00-\u9fa5\s\-_]/g, '').trim()
  return escapePbString(cleaned)
}

function buildFilterString() {
  const filters: string[] = []
  if (filter.value.status) filters.push(`status='${filter.value.status}'`)
  if (filter.value.tableNo) {
    const safe = sanitizePbLike(filter.value.tableNo)
    if (safe) filters.push(`tableNo~'${safe}'`)
  }
  if (filter.value.date) {
    const d = new Date(filter.value.date)
    if (!isNaN(d.getTime())) {
      const start = d.toISOString()
      const end = new Date(d.getTime() + 86400000).toISOString()
      filters.push(`created>='${start}' && created<'${end}'`)
    }
  }
  if (searchKeyword.value.trim()) {
    const kw = sanitizePbLike(searchKeyword.value.trim())
    if (kw) filters.push(`(orderNo~'${kw}' || tableNo~'${kw}')`)
  }
  return filters.join(' && ')
}

async function fetchOrders(silent = false) {
  if (!silent) loading.value = true
  try {
    const [orderRes, tsRes] = await Promise.all([
      OrderAPI.getOrders(currentPage.value, 20, buildFilterString()),
      TableStatusAPI.getAllTableStatuses(),
    ])
    orders.value = orderRes.items
    tableStatuses.value = tsRes
    setTotal(orderRes.totalItems || orderRes.items.length)
    lastOrderIds = orderRes.items.map((o) => o.id + o.status).join(',')
  } catch (err: unknown) {
    if (!silent) toast.error('加载订单失败: ' + (err instanceof Error ? err.message : '未知错误'))
  } finally {
    if (!silent) loading.value = false
  }
}

async function silentRefresh() {
  try {
    const [res, tsRes] = await Promise.all([
      OrderAPI.getOrders(currentPage.value, 20, buildFilterString()),
      TableStatusAPI.getAllTableStatuses(),
    ])
    const newIds = res.items.map((o) => o.id + o.status).join(',')
    const hasNewOrder = res.items.some((o) => !orders.value.find((old) => old.id === o.id))
    const hasSettled = res.items.some(
      (o) => o.status === OrderStatus.SETTLED && !orders.value.find((old) => old.id === o.id && old.status === OrderStatus.SETTLED),
    )

    if (newIds !== lastOrderIds) {
      orders.value = res.items
      tableStatuses.value = tsRes
      setTotal(res.totalItems || res.items.length)
      lastOrderIds = newIds
      if (hasNewOrder || hasSettled) {
        playNotificationSound()
      }
    }
  } catch (err: unknown) {
    // P1-19: silentRefresh 失败时输出警告，便于排查
    console.warn('[silentRefresh] 自动刷新失败:', err instanceof Error ? err.message : '未知错误')
  }
}

const { start: startAutoRefresh } = useAutoRefresh(silentRefresh, { interval: 30000, immediate: false })

function playNotificationSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
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

onMounted(() => {
  fetchOrders()
  settingsStore.fetchSettings()
  startAutoRefresh()
})

function loadOrders() {
  fetchOrders()
}

function applyFilter() {
  resetPage()
  loadOrders()
}

function resetFilter() {
  filter.value = { status: '', tableNo: '', date: '' }
  searchKeyword.value = ''
  resetPage()
  loadOrders()
}

function quickFilterTable(tableNo: string) {
  filter.value.tableNo = tableNo
  resetPage()
  loadOrders()
}

function quickFilterStatus(status: OrderStatusValue) {
  filter.value.status = filter.value.status === status ? '' : status
  resetPage()
  loadOrders()
}

function viewOrder(order: Order) {
  router.push({ name: 'orderDetail', params: { orderId: order.id } })
}

async function editOrder(order: Order) {
  const endedStatuses: OrderStatusValue[] = [OrderStatus.COMPLETED, OrderStatus.SETTLED, OrderStatus.CANCELLED]
  const ts = tableStatusMap.value.get(order.tableNo)

  if (endedStatuses.includes(order.status) && ts?.status === 'idle') {
    const ok = await globalConfirm.confirm({
      title: '订单已清台',
      description: '此订单已清台，不应该再次编辑！',
      confirmText: '继续编辑',
      cancelText: '取消',
    })
    if (!ok) return
  }

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
  } catch (err: unknown) {
    toast.error('删除失败: ' + (err instanceof Error ? err.message : '未知错误'))
  }
}

async function updateStatus(order: Order, toStatus: OrderStatusValue) {
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
  } catch (err: unknown) {
    toast.error('状态更新失败: ' + (err instanceof Error ? err.message : '未知错误'))
  }
}

async function clearTable(tableNo: string) {
  if (processing.value) return
  processing.value = true
  try {
    const { canClear, reason, tableStatus } = await checkCanClearTable(tableNo)

    if (!canClear) {
      if (reason === 'idle') {
        await globalConfirm.confirm({
          title: '无需清台',
          description: `${tableNo} 号桌已经是空闲状态，无需重复清台。`,
          confirmText: '知道了',
          type: 'default',
        })
      } else if (reason === 'unfinished') {
        await globalConfirm.confirm({
          title: '不可清台',
          description: `${tableNo} 号桌还有未完成订单，无法清台。请先将订单处理完毕后再清台。`,
          confirmText: '知道了',
          type: 'default',
        })
      } else if (reason === 'completed') {
        await globalConfirm.confirm({
          title: '不可清台',
          description: `${tableNo} 号桌订单已上菜完成但尚未结账，无法清台。请先将订单标记为「已结账」后再清台。`,
          confirmText: '知道了',
          type: 'default',
        })
      }
      return
    }

    const ok = await globalConfirm.confirm({
      title: '确认清台',
      description: `确定要清空 ${tableNo} 号桌的用餐状态吗？请确认此桌已结账完毕。清台后将立即释放桌位。`,
      confirmText: '清台',
      type: 'danger',
    })
    if (!ok) return

    await executeClearTable(tableStatus)
    toast.success(`${tableNo} 号桌已清台`)
    await loadOrders()
  } catch (err: unknown) {
    toast.error('清台失败: ' + (err instanceof Error ? err.message : '未知错误'))
  } finally {
    processing.value = false
  }
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${m}-${day} ${h}:${min}`
}

function getActionButtons(order: Order) {
  return getStatusButtons(order.status as OrderStatusValue).map((btn) => ({
    ...btn,
    onClick: () => updateStatus(order, btn.status),
  }))
}

function primaryAction(order: Order) {
  return getActionButtons(order)[0] || null
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
    菜品明细: (o.items || []).slice(0, 20).map((i) => `${i.name}×${i.quantity}`).join('，') + ((o.items?.length || 0) > 20 ? ' 等' : ''),
    总金额: o.totalAmount || 0,
    折扣: o.discount || 0,
    实付金额: o.finalAmount || 0,
    创建时间: new Date(o.created).toLocaleString('zh-CN'),
    备注: o.remark || '',
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '订单明细')
  const dateStr = new Date().toISOString().split('T')[0]
  XLSX.writeFile(wb, `订单明细_${dateStr}.xlsx`)
  toast.success('导出成功')
}
</script>

<template>
  <div>
    <!-- Header -->
    <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
      <h2 class="text-xl font-bold text-gray-800">订单管理</h2>
      <div class="flex items-center gap-2">
        <button
          class="px-3 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 active:scale-[0.98] transition-transform"
          @click="exportExcel"
        >
          导出 Excel
        </button>
        <button
          class="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 shadow-sm active:scale-[0.98] transition-transform"
          @click="$router.push({ name: 'createOrder' })"
        >
          + 新建订单
        </button>
      </div>
    </div>

    <!-- Search & Filters -->
    <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
      <div class="flex flex-wrap items-center gap-3">
        <input
          v-model="searchKeyword"
          type="text"
          placeholder="搜索订单号 / 桌号"
          class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-48 transition-shadow duration-200"
          @input="onSearchInput"
        />
        <select
          v-model="filter.status"
          class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow duration-200"
          @change="applyFilter"
        >
          <option value="">全部状态</option>
          <option v-for="s in statusOptions" :key="s.value" :value="s.value">{{ s.label }}</option>
        </select>

        <select
          v-model="filter.tableNo"
          class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow duration-200"
          @change="applyFilter"
        >
          <option value="">全部桌号</option>
          <option v-for="t in settingsStore.tableNumbers" :key="t" :value="t">{{ t }}</option>
        </select>

        <input
          v-model="filter.date"
          type="date"
          class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow duration-200"
          @change="applyFilter"
        />

        <button
          class="px-4 py-2 text-gray-500 text-sm font-medium hover:text-gray-700 rounded-lg hover:bg-gray-100 active:scale-[0.98] transition-transform"
          @click="resetFilter"
        >
          重置
        </button>
      </div>

      <!-- Quick status filters -->
      <div class="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-gray-100">
        <span class="text-xs text-gray-400">快捷筛选:</span>
        <button
          v-for="s in statusOptions"
          :key="s.value"
          :class="[
            'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
            filter.status === s.value
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300',
          ]"
          @click="quickFilterStatus(s.value)"
        >
          {{ s.label }}
        </button>
      </div>
    </div>

    <!-- Quick Table Filters -->
    <div v-if="pendingTableNumbers.length" class="flex flex-wrap items-center gap-2 mb-4">
      <span class="text-sm text-gray-500">待处理桌号:</span>
      <div
        v-for="t in pendingTableNumbers"
        :key="t"
        class="inline-flex items-center gap-1"
      >
        <button
          :class="[
            'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
            filter.tableNo === t
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300',
          ]"
          @click="quickFilterTable(t)"
        >
          {{ t }}
        </button>
        <button
          class="px-1.5 py-1 rounded text-[10px] text-red-600 hover:bg-red-50 border border-transparent"
          @click="clearTable(t)"
        >
          清台
        </button>
      </div>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
        <div class="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-lg">📋</div>
        <div>
          <div class="text-2xl font-bold text-gray-800">{{ stats.today }}</div>
          <div class="text-sm text-gray-500">今日订单</div>
        </div>
      </div>
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
        <div class="w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center text-lg">⏳</div>
        <div>
          <div class="text-2xl font-bold text-gray-800">{{ stats.pending }}</div>
          <div class="text-sm text-gray-500">待处理</div>
        </div>
      </div>
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
        <div class="w-10 h-10 rounded-full bg-green-50 text-green-600 flex items-center justify-center text-lg">💰</div>
        <div>
          <div class="text-2xl font-bold text-gray-800">{{ stats.amount }}</div>
          <div class="text-sm text-gray-500">今日营业额</div>
        </div>
      </div>
    </div>

    <!-- Desktop Table -->
    <div class="hidden md:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
      <table class="min-w-[860px] w-full divide-y divide-gray-200 table-fixed">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase w-28">订单号</th>
            <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase w-16">桌号</th>
            <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase w-14">人数</th>
            <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase w-14">菜品数</th>
            <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase w-20">金额</th>
            <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase w-24">状态</th>
            <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase w-20">桌台状态</th>
            <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase w-24">创建时间</th>
            <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase w-60">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200">
          <tr v-if="loading && orders.length === 0">
            <td colspan="9" class="px-3 py-6">
              <div class="space-y-3">
                <div v-for="i in 5" :key="i" class="flex gap-3">
                  <SkeletonBox width="120px" height="16px" />
                  <SkeletonBox width="60px" height="16px" />
                  <SkeletonBox width="40px" height="16px" />
                  <SkeletonBox width="40px" height="16px" />
                  <SkeletonBox width="80px" height="16px" />
                  <SkeletonBox width="60px" height="20px" rounded="rounded-full" />
                  <SkeletonBox width="120px" height="16px" />
                  <SkeletonBox width="100px" height="16px" />
                </div>
              </div>
            </td>
          </tr>
          <tr v-else-if="orders.length === 0">
            <td colspan="9">
              <EmptyState title="暂无订单" description="当前筛选条件下没有找到订单，试试调整筛选条件或新建订单" icon="📭">
                <button class="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700" @click="$router.push({ name: 'createOrder' })">
                  新建订单
                </button>
              </EmptyState>
            </td>
          </tr>
          <tr v-for="order in orders" :key="order.id" class="hover:bg-gray-50 transition-colors">
            <td class="px-3 py-3 text-sm text-gray-900 font-medium truncate" :title="order.orderNo">{{ order.orderNo || '-' }}</td>
            <td class="px-3 py-3 text-sm text-gray-700">{{ order.tableNo || '-' }}</td>
            <td class="px-3 py-3 text-sm text-gray-700">{{ order.guests || '-' }}人</td>
            <td class="px-3 py-3 text-sm text-gray-700">{{ order.items?.length || 0 }}道</td>
            <td class="px-3 py-3 text-sm text-gray-900 font-medium">{{ MoneyCalculator.format(order.finalAmount || 0) }}</td>
            <td class="px-3 py-3">
              <div class="flex flex-wrap items-center gap-1">
                <span
                  class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset"
                  :class="statusBadgeClass[order.status as OrderStatusValue]"
                >
                  {{ StatusLabels[order.status as keyof typeof StatusLabels] || order.status }}
                </span>
                <span
                  v-if="order.source === 'customer'"
                  class="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-100"
                >
                  顾客
                </span>
              </div>
            </td>
            <td class="px-3 py-3">
              <span
                class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset"
                :class="tableStatusMap.get(order.tableNo)?.status === 'idle' ? 'bg-gray-50 text-gray-600 ring-gray-500/20' : 'bg-orange-50 text-orange-600 ring-orange-500/20'"
              >
                {{ tableStatusMap.get(order.tableNo)?.status === 'idle' ? '已清台' : '占用中' }}
              </span>
            </td>
            <td class="px-3 py-3 text-sm text-gray-500">{{ formatDate(order.created) }}</td>
            <td class="px-3 py-3 text-sm">
              <div class="flex flex-wrap items-center gap-1">
                <button class="px-2 py-1 text-[11px] font-medium bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 active:scale-[0.98] transition-transform" @click="viewOrder(order)">查看</button>
                <button class="px-2 py-1 text-[11px] font-medium bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 active:scale-[0.98] transition-transform" @click="editOrder(order)">编辑</button>
                <button
                  v-for="btn in getActionButtons(order)"
                  :key="btn.status"
                  class="px-2 py-1 text-[11px] font-medium rounded-md active:scale-[0.98] transition-transform"
                  :class="btn.type === 'danger' ? 'bg-red-50 text-red-600 border border-red-100 hover:bg-red-100' : 'bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100'"
                  @click="btn.onClick"
                >
                  {{ btn.label }}
                </button>
                <button class="px-2 py-1 text-[11px] font-medium bg-white text-red-600 border border-red-200 rounded-md hover:bg-red-50 active:scale-[0.98] transition-transform" @click="deleteOrder(order)">删除</button>
                <button class="px-2 py-1 text-[11px] font-medium bg-white text-orange-600 border border-orange-200 rounded-md hover:bg-orange-50 active:scale-[0.98] transition-transform" @click="clearTable(order.tableNo)">清台</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Mobile Cards -->
    <div class="md:hidden space-y-3">
      <template v-if="loading && orders.length === 0">
        <div v-for="i in 4" :key="i" class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-3">
          <div class="flex justify-between">
            <SkeletonBox width="120px" height="16px" />
            <SkeletonBox width="60px" height="20px" rounded="rounded-full" />
          </div>
          <div class="flex justify-between">
            <SkeletonBox width="80px" height="14px" />
            <SkeletonBox width="60px" height="14px" />
          </div>
          <div class="flex gap-2 pt-2">
            <SkeletonBox width="50px" height="28px" rounded="rounded-lg" />
            <SkeletonBox width="50px" height="28px" rounded="rounded-lg" />
          </div>
        </div>
      </template>

      <EmptyState
        v-else-if="orders.length === 0"
        title="暂无订单"
        description="当前筛选条件下没有找到订单"
        icon="📭"
      />

      <div
        v-for="order in orders"
        :key="order.id"
        class="bg-white rounded-xl shadow-sm border border-gray-100 p-4"
      >
        <div class="flex items-center justify-between mb-2">
          <div class="font-semibold text-gray-900">{{ order.orderNo }}</div>
          <div class="flex items-center gap-1.5">
            <span
              class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset"
              :class="statusBadgeClass[order.status as OrderStatusValue]"
            >
              {{ StatusLabels[order.status as keyof typeof StatusLabels] || order.status }}
            </span>
            <span
              v-if="order.source === 'customer'"
              class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-100"
            >
              顾客
            </span>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-y-1 text-sm text-gray-600 mb-3">
          <div>桌号: <span class="text-gray-900 font-medium">{{ order.tableNo }}</span></div>
          <div>人数: <span class="text-gray-900 font-medium">{{ order.guests || 1 }}人</span></div>
          <div>菜品: <span class="text-gray-900 font-medium">{{ order.items?.length || 0 }}道</span></div>
          <div>金额: <span class="text-red-500 font-medium">{{ MoneyCalculator.format(order.finalAmount || 0) }}</span></div>
          <div>
            桌台状态:
            <span
              class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset"
              :class="tableStatusMap.get(order.tableNo)?.status === 'idle' ? 'bg-gray-50 text-gray-600 ring-gray-500/20' : 'bg-orange-50 text-orange-600 ring-orange-500/20'"
            >
              {{ tableStatusMap.get(order.tableNo)?.status === 'idle' ? '已清台' : '占用中' }}
            </span>
          </div>
          <div class="col-span-2 text-xs text-gray-400">{{ new Date(order.created).toLocaleString('zh-CN') }}</div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button class="px-3 py-1.5 text-xs font-medium bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 active:scale-[0.98] transition-transform" @click="viewOrder(order)">查看</button>
          <button class="px-3 py-1.5 text-xs font-medium bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 active:scale-[0.98] transition-transform" @click="editOrder(order)">编辑</button>
          <button
            v-for="btn in getActionButtons(order)"
            :key="btn.status"
            class="px-3 py-1.5 text-xs font-medium rounded-lg active:scale-[0.98] transition-transform"
            :class="btn.type === 'danger' ? 'bg-red-50 text-red-600 border border-red-100 hover:bg-red-100' : 'bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100'"
            @click="btn.onClick"
          >
            {{ btn.label }}
          </button>
          <button class="px-3 py-1.5 text-xs font-medium bg-red-50 text-red-600 border border-red-100 rounded-lg hover:bg-red-100 active:scale-[0.98] transition-transform" @click="deleteOrder(order)">删除</button>
          <button class="px-3 py-1.5 text-xs font-medium bg-orange-50 text-orange-600 border border-orange-100 rounded-lg hover:bg-orange-100 active:scale-[0.98] transition-transform" @click="clearTable(order.tableNo)">清台</button>
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="flex justify-center items-center gap-2 mt-6">
      <button
        :disabled="currentPage === 1"
        class="px-3 py-1.5 text-sm rounded-lg border border-gray-300 disabled:opacity-50 hover:bg-gray-50 active:scale-[0.98] transition-transform bg-white"
        @click="goToPage(currentPage - 1); loadOrders()"
      >
        上一页
      </button>
      <template v-for="p in visiblePages" :key="p">
        <span v-if="p === '...'" class="px-2 text-gray-500">...</span>
        <button
          v-else
          :class="[
            'px-3 py-1.5 text-sm rounded-lg border active:scale-[0.98] transition-transform',
            currentPage === p
              ? 'bg-blue-600 text-white border-blue-600'
              : 'border-gray-300 hover:bg-gray-50 bg-white',
          ]"
          @click="goToPage(p as number); loadOrders()"
        >
          {{ p }}
        </button>
      </template>
      <button
        :disabled="currentPage === totalPages"
        class="px-3 py-1.5 text-sm rounded-lg border border-gray-300 disabled:opacity-50 hover:bg-gray-50 active:scale-[0.98] transition-transform bg-white"
        @click="goToPage(currentPage + 1); loadOrders()"
      >
        下一页
      </button>
    </div>
  </div>
</template>
