<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { OrderAPI } from '@/api/pocketbase'
import { OrderStatus, StatusLabels, StatusColors } from '@/utils/orderStatus'

const orders = ref<any[]>([])
const loading = ref(false)
const dateRange = ref('week')
const startDate = ref('')
const endDate = ref('')

onMounted(() => {
  setDefaultDateRange()
  loadData()
})

function setDefaultDateRange() {
  const now = new Date()
  endDate.value = now.toISOString().split('T')[0]!
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  startDate.value = weekAgo.toISOString().split('T')[0]!
}

function onDateRangeChange() {
  const now = new Date()
  endDate.value = now.toISOString().split('T')[0]!
  switch (dateRange.value) {
    case 'week':
      startDate.value = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!
      break
    case 'month':
      startDate.value = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!
      break
    case 'year':
      startDate.value = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!
      break
  }
}

function onCustomDateChange() {
  dateRange.value = 'custom'
}

async function loadData() {
  loading.value = true
  try {
    const filters: string[] = []
    if (startDate.value) filters.push(`created >= "${startDate.value}T00:00:00.000Z"`)
    if (endDate.value) filters.push(`created <= "${endDate.value}T23:59:59.999Z"`)
    const filter = filters.join(' && ')
    const res = await OrderAPI.getOrders(1, 500, filter)
    orders.value = res.items
  } catch (err: any) {
    alert('加载数据失败: ' + err.message)
  } finally {
    loading.value = false
  }
}

const stats = computed(() => {
  const s = {
    totalRevenue: 0,
    totalOrders: orders.value.length,
    validOrders: 0,
    cancelledOrders: 0,
    averageOrderValue: 0,
    dailyAverageRevenue: 0,
    dailyStats: {} as Record<string, { date: string; revenue: number; count: number }>,
    hourlyStats: new Array(24).fill(0).map(() => ({ count: 0, revenue: 0 })),
    dishStats: {} as Record<string, { name: string; quantity: number; revenue: number }>,
    statusStats: {} as Record<string, { count: number; label: string; color: string }>,
    tableStats: {} as Record<string, { tableNo: string; revenue: number; count: number }>,
  }

  // init date range
  const range = getDateRange()
  range.forEach((d) => (s.dailyStats[d] = { date: d, revenue: 0, count: 0 }))

  Object.values(OrderStatus).forEach((status) => {
    const key = status as keyof typeof StatusLabels
    s.statusStats[status] = { count: 0, label: StatusLabels[key], color: StatusColors[key] }
  })

  orders.value.forEach((order) => {
    const dateKey = order.created.split('T')[0]!
    const hour = new Date(order.created).getHours()
    const amount = order.totalAmount || 0

    if (s.statusStats[order.status]) s.statusStats[order.status]!.count++

    if (order.status !== OrderStatus.CANCELLED) {
      s.totalRevenue += amount
      s.validOrders++
      const daily = s.dailyStats[dateKey]
      if (daily) {
        daily.revenue += amount
        daily.count++
      }
      s.hourlyStats[hour]!.count++
      s.hourlyStats[hour]!.revenue += amount
      if (order.tableNo) {
        if (!s.tableStats[order.tableNo]) s.tableStats[order.tableNo] = { tableNo: order.tableNo, revenue: 0, count: 0 }
        const t = s.tableStats[order.tableNo]!
        t.revenue += amount
        t.count++
      }
      if (order.items) {
        order.items.forEach((item: any) => {
          const name = item.name || '未知菜品'
          if (!s.dishStats[name]) s.dishStats[name] = { name, quantity: 0, revenue: 0 }
          s.dishStats[name].quantity += item.quantity || 0
          s.dishStats[name].revenue += (item.price || 0) * (item.quantity || 0)
        })
      }
    } else {
      s.cancelledOrders++
    }
  })

  s.averageOrderValue = s.validOrders > 0 ? s.totalRevenue / s.validOrders : 0
  const days = Object.keys(s.dailyStats).length || 1
  s.dailyAverageRevenue = s.totalRevenue / days
  return s
})

function getDateRange() {
  const dates: string[] = []
  const start = new Date(startDate.value)
  const end = new Date(endDate.value)
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split('T')[0]!)
  }
  return dates
}

const topDishes = computed(() =>
  Object.values(stats.value.dishStats)
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 10),
)

const tableRanking = computed(() =>
  Object.values(stats.value.tableStats)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 15),
)

const statusList = computed(() => Object.values(stats.value.statusStats).filter((s) => s.count > 0))
const dailyList = computed(() =>
  Object.values(stats.value.dailyStats)
    .filter((x): x is { date: string; revenue: number; count: number } => !!x)
    .sort((a, b) => a.date.localeCompare(b.date)),
)
const activeHours = computed(() => [9, 10, 11, 12, 13, 14, 17, 18, 19, 20, 21])
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
      <h2 class="text-xl font-bold text-gray-800">营业数据统计</h2>
      <div class="flex flex-wrap items-center gap-2">
        <select
          v-model="dateRange"
          class="px-3 py-2 border border-gray-300 rounded-md text-sm"
          @change="onDateRangeChange"
        >
          <option value="week">最近7天</option>
          <option value="month">最近30天</option>
          <option value="year">最近一年</option>
          <option value="custom">自定义</option>
        </select>
        <input v-model="startDate" type="date" class="px-3 py-2 border border-gray-300 rounded-md text-sm" @change="onCustomDateChange" />
        <span class="text-gray-500">至</span>
        <input v-model="endDate" type="date" class="px-3 py-2 border border-gray-300 rounded-md text-sm" @change="onCustomDateChange" />
        <button
          :disabled="loading"
          class="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
          @click="loadData"
        >
          {{ loading ? '加载中...' : '刷新' }}
        </button>
      </div>
    </div>

    <!-- KPI Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <div class="bg-gradient-to-br from-indigo-500 to-purple-600 text-white p-5 rounded-lg shadow">
        <div class="text-sm opacity-90 mb-1">总营业额</div>
        <div class="text-2xl font-bold">¥{{ stats.totalRevenue.toFixed(2) }}</div>
        <div class="text-xs opacity-80 mt-1">{{ stats.validOrders }} 笔有效订单</div>
      </div>
      <div class="bg-gradient-to-br from-emerald-500 to-green-400 text-white p-5 rounded-lg shadow">
        <div class="text-sm opacity-90 mb-1">客单价</div>
        <div class="text-2xl font-bold">¥{{ stats.averageOrderValue.toFixed(2) }}</div>
        <div class="text-xs opacity-80 mt-1">平均每单消费</div>
      </div>
      <div class="bg-gradient-to-br from-pink-400 to-rose-500 text-white p-5 rounded-lg shadow">
        <div class="text-sm opacity-90 mb-1">总订单数</div>
        <div class="text-2xl font-bold">{{ stats.totalOrders }}</div>
        <div class="text-xs opacity-80 mt-1">含 {{ stats.cancelledOrders }} 笔取消</div>
      </div>
      <div class="bg-gradient-to-br from-sky-400 to-cyan-400 text-white p-5 rounded-lg shadow">
        <div class="text-sm opacity-90 mb-1">日均营业额</div>
        <div class="text-2xl font-bold">¥{{ stats.dailyAverageRevenue.toFixed(2) }}</div>
        <div class="text-xs opacity-80 mt-1">统计周期内平均</div>
      </div>
    </div>

    <!-- Charts Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      <!-- Trend -->
      <div class="bg-white rounded-lg shadow p-5">
        <h3 class="text-base font-semibold text-gray-800 mb-4">销售趋势（按日）</h3>
        <div v-if="dailyList.length === 0" class="text-center text-gray-500 py-8">暂无数据</div>
        <table v-else class="min-w-full text-sm">
          <thead class="bg-gray-50">
            <tr><th class="px-3 py-2 text-left">日期</th><th class="px-3 py-2 text-left">订单数</th><th class="px-3 py-2 text-left">营业额</th></tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="d in dailyList" :key="d.date">
              <td class="px-3 py-2">{{ d.date }}</td>
              <td class="px-3 py-2">{{ d.count }}</td>
              <td class="px-3 py-2 font-medium">¥{{ d.revenue.toFixed(2) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Hourly -->
      <div class="bg-white rounded-lg shadow p-5">
        <h3 class="text-base font-semibold text-gray-800 mb-4">用餐时段分布</h3>
        <div class="h-48 flex items-end gap-2">
          <div v-for="h in activeHours" :key="h" class="flex-1 flex flex-col items-center gap-1">
            <div class="text-xs text-gray-600">{{ stats.hourlyStats[h]!.count }}</div>
            <div
              class="w-full bg-blue-400 rounded-t"
              :style="{ height: Math.max(4, (stats.hourlyStats[h]!.count / Math.max(1, ...activeHours.map(x => stats.hourlyStats[x]!.count))) * 140) + 'px' }"
              :title="`${h}:00 营业额 ¥${stats.hourlyStats[h]!.revenue.toFixed(2)}`"
            />
            <div class="text-xs text-gray-400">{{ h }}时</div>
          </div>
        </div>
      </div>

      <!-- Top Dishes -->
      <div class="bg-white rounded-lg shadow p-5">
        <h3 class="text-base font-semibold text-gray-800 mb-4">热门菜品 TOP10</h3>
        <div v-if="topDishes.length === 0" class="text-center text-gray-500 py-8">暂无数据</div>
        <div v-else class="space-y-3 max-h-64 overflow-y-auto pr-1">
          <div v-for="(dish, idx) in topDishes" :key="dish.name" class="flex items-center gap-3">
            <div class="w-5 text-center font-bold" :class="idx < 3 ? 'text-red-500' : 'text-gray-400'">{{ idx + 1 }}</div>
            <div class="flex-1">
              <div class="flex justify-between text-sm mb-1">
                <span class="text-gray-800">{{ dish.name }}</span>
                <span class="text-gray-500">{{ dish.quantity }}份</span>
              </div>
              <div class="h-1.5 bg-gray-100 rounded overflow-hidden">
                <div
                  class="h-full rounded"
                  :style="{ width: (dish.quantity / (topDishes[0]?.quantity || 1) * 100) + '%', backgroundColor: ['#ff4d4f','#ff7a45','#ffa940','#ffc53d','#73d13d','#36cfc9','#40a9ff','#597ef7','#9254de','#f759ab'][idx] || '#1890ff' }"
                />
              </div>
            </div>
            <div class="w-16 text-right text-xs text-gray-400">¥{{ dish.revenue.toFixed(0) }}</div>
          </div>
        </div>
      </div>

      <!-- Status -->
      <div class="bg-white rounded-lg shadow p-5">
        <h3 class="text-base font-semibold text-gray-800 mb-4">订单状态分布</h3>
        <div v-if="statusList.length === 0" class="text-center text-gray-500 py-8">暂无数据</div>
        <div v-else class="space-y-3">
          <div v-for="s in statusList" :key="s.label" class="flex items-center gap-3">
            <div class="w-3 h-3 rounded-sm" :style="{ backgroundColor: s.color }" />
            <span class="flex-1 text-sm text-gray-600">{{ s.label }}</span>
            <span class="text-sm font-medium text-gray-800">{{ s.count }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Table Ranking -->
    <div class="bg-white rounded-lg shadow p-5">
      <h3 class="text-base font-semibold text-gray-800 mb-4">桌位营业额排行</h3>
      <div v-if="tableRanking.length === 0" class="text-center text-gray-500 py-8">暂无数据</div>
      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="(t, idx) in tableRanking"
          :key="t.tableNo"
          class="bg-gray-50 p-4 rounded-lg border-l-4"
          :class="idx < 3 ? 'border-green-500' : 'border-blue-500'"
        >
          <div class="flex justify-between items-center mb-2">
            <span class="font-medium text-gray-800">{{ t.tableNo }}</span>
            <span class="text-sm font-medium text-green-600">¥{{ t.revenue.toFixed(0) }}</span>
          </div>
          <div class="h-1 bg-gray-200 rounded mb-2">
            <div
              class="h-1 rounded"
              :class="idx < 3 ? 'bg-green-500' : 'bg-blue-500'"
              :style="{ width: (t.revenue / (tableRanking[0]?.revenue || 1) * 100) + '%' }"
            />
          </div>
          <div class="flex justify-between text-xs text-gray-500">
            <span>{{ t.count }} 单</span>
            <span>均 ¥{{ (t.revenue / t.count).toFixed(0) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
