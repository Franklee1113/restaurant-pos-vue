<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { OrderAPI, type Order } from '@/api/pocketbase'
import { useSettingsStore } from '@/stores/settings.store'
import { OrderStatus, StatusLabels, StatusColors, getStatusButtons } from '@/utils/orderStatus'
import { MoneyCalculator } from '@/utils/security'

const router = useRouter()
const settingsStore = useSettingsStore()

const orders = ref<Order[]>([])
const loading = ref(false)
const currentPage = ref(1)
const totalPages = ref(1)

const filter = ref({
  status: '',
  tableNo: '',
  date: '',
})

const statusOptions = [
  { value: OrderStatus.PENDING, label: StatusLabels[OrderStatus.PENDING] },
  { value: OrderStatus.COOKING, label: StatusLabels[OrderStatus.COOKING] },
  { value: OrderStatus.SERVING, label: StatusLabels[OrderStatus.SERVING] },
  { value: OrderStatus.COMPLETED, label: StatusLabels[OrderStatus.COMPLETED] },
  { value: OrderStatus.CANCELLED, label: StatusLabels[OrderStatus.CANCELLED] },
]

const today = new Date().toDateString()

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
})

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
    const filterStr = filters.join(' && ')

    const res = await OrderAPI.getOrders(currentPage.value, 20, filterStr)
    orders.value = res.items
    totalPages.value = res.totalPages || 1
  } catch (err: any) {
    alert('加载订单失败: ' + err.message)
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
  currentPage.value = 1
  loadOrders()
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
  if (!confirm(`确定要删除订单 "${order.orderNo}" 吗？此操作不可恢复。`)) return
  try {
    await OrderAPI.deleteOrder(order.id)
    alert('删除成功')
    await loadOrders()
  } catch (err: any) {
    alert('删除失败: ' + err.message)
  }
}

async function updateStatus(order: Order, toStatus: string) {
  const statusName = StatusLabels[toStatus as keyof typeof StatusLabels]
  if (!confirm(`确定要将订单状态变更为"${statusName}"吗？`)) return
  try {
    await OrderAPI.updateOrderStatus(order.id, toStatus)
    alert('状态更新成功')
    await loadOrders()
  } catch (err: any) {
    alert('状态更新失败: ' + err.message)
  }
}

function getActionButtons(order: Order) {
  return getStatusButtons(order.status as any).map((btn) => ({
    ...btn,
    onClick: () => updateStatus(order, btn.status),
  }))
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
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-xl font-bold text-gray-800">订单管理</h2>
      <button
        class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        @click="$router.push({ name: 'createOrder' })"
      >
        + 新建订单
      </button>
    </div>

    <!-- Filters -->
    <div class="bg-white rounded-lg shadow p-4 mb-6 flex flex-wrap items-center gap-3">
      <select
        v-model="filter.status"
        class="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">全部状态</option>
        <option v-for="s in statusOptions" :key="s.value" :value="s.value">{{ s.label }}</option>
      </select>

      <select
        v-model="filter.tableNo"
        class="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">全部桌号</option>
        <option v-for="t in settingsStore.tableNumbers" :key="t" :value="t">{{ t }}</option>
      </select>

      <input
        v-model="filter.date"
        type="date"
        class="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      <button
        class="px-4 py-2 bg-gray-100 text-gray-700 rounded-md text-sm hover:bg-gray-200"
        @click="applyFilter"
      >
        筛选
      </button>
      <button
        class="px-4 py-2 text-gray-500 text-sm hover:text-gray-700"
        @click="resetFilter"
      >
        重置
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
    <div class="bg-white rounded-lg shadow overflow-hidden">
      <table class="min-w-full divide-y divide-gray-200">
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
          <tr v-if="loading">
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
