<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import * as echarts from 'echarts'
import { OrderAPI, type Order } from '@/api/pocketbase'
import { OrderStatus, StatusLabels, StatusColors } from '@/utils/orderStatus'
import { MoneyCalculator } from '@/utils/security'
import { useToast } from '@/composables/useToast'

const toast = useToast()

const orders = ref<Order[]>([])
const loading = ref(false)
const dateRange = ref('week')
const startDate = ref('')
const endDate = ref('')

const trendChartRef = ref<HTMLDivElement | null>(null)
const dishesChartRef = ref<HTMLDivElement | null>(null)
const statusChartRef = ref<HTMLDivElement | null>(null)
const hourlyChartRef = ref<HTMLDivElement | null>(null)

const chartInstances: Record<string, echarts.ECharts | null> = {
  trend: null,
  dishes: null,
  status: null,
  hourly: null,
}

onMounted(() => {
  setDefaultDateRange()
  loadData().then(() => {
    nextTick(initCharts)
  })
  window.addEventListener('resize', resizeCharts)
})

onUnmounted(() => {
  window.removeEventListener('resize', resizeCharts)
  Object.keys(chartInstances).forEach((key) => {
    const inst = chartInstances[key as keyof typeof chartInstances]
    if (inst) {
      inst.dispose()
      chartInstances[key as keyof typeof chartInstances] = null
    }
  })
})

function resizeCharts() {
  Object.values(chartInstances).forEach((inst) => inst?.resize())
}

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
  loadData()
}

function onCustomDateChange() {
  dateRange.value = 'custom'
  loadData()
}

function sanitizeDateFilter(dateStr: string, timeStr: string): string | null {
  const d = new Date(`${dateStr}T${timeStr}`)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

async function loadData() {
  loading.value = true
  try {
    const filters: string[] = []
    if (startDate.value) {
      const safeStart = sanitizeDateFilter(startDate.value, '00:00:00')
      if (safeStart) filters.push(`created >= '${safeStart}'`)
    }
    if (endDate.value) {
      const safeEnd = sanitizeDateFilter(endDate.value, '23:59:59.999')
      if (safeEnd) filters.push(`created <= '${safeEnd}'`)
    }
    const filter = filters.join(' && ')
    const res = await OrderAPI.getOrders(1, 500, filter)
    orders.value = res.items
    nextTick(updateCharts)
  } catch (err: unknown) {
    toast.error('加载数据失败: ' + (err instanceof Error ? err.message : '未知错误'))
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
    const dateKey = new Date(order.created).toISOString().split('T')[0]!
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
        order.items.forEach((item) => {
          const name = item.name || '未知菜品'
          if (!s.dishStats[name]) s.dishStats[name] = { name, quantity: 0, revenue: 0 }
          s.dishStats[name].quantity += item.quantity || 0
          s.dishStats[name].revenue += MoneyCalculator.calculate([{ price: item.price || 0, quantity: item.quantity || 0 }], 0).total
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

function initCharts() {
  if (trendChartRef.value && !chartInstances.trend) {
    chartInstances.trend = echarts.init(trendChartRef.value)
  }
  if (dishesChartRef.value && !chartInstances.dishes) {
    chartInstances.dishes = echarts.init(dishesChartRef.value)
  }
  if (statusChartRef.value && !chartInstances.status) {
    chartInstances.status = echarts.init(statusChartRef.value)
  }
  if (hourlyChartRef.value && !chartInstances.hourly) {
    chartInstances.hourly = echarts.init(hourlyChartRef.value)
  }
  updateCharts()
}

function updateCharts() {
  // Trend chart
  if (chartInstances.trend) {
    const dates = dailyList.value.map((d) => d.date.slice(5))
    const revenues = dailyList.value.map((d) => +d.revenue.toFixed(2))
    const counts = dailyList.value.map((d) => d.count)
    chartInstances.trend.setOption({
      tooltip: { trigger: 'axis' },
      legend: { data: ['营业额', '订单数'], bottom: 0 },
      grid: { left: '3%', right: '4%', bottom: '15%', top: '10%', containLabel: true },
      xAxis: { type: 'category', data: dates },
      yAxis: [
        { type: 'value', name: '营业额', axisLabel: { formatter: '{value}' } },
        { type: 'value', name: '订单数', minInterval: 1 },
      ],
      series: [
        { name: '营业额', type: 'line', smooth: true, data: revenues, itemStyle: { color: '#6366f1' }, areaStyle: { opacity: 0.1 } },
        { name: '订单数', type: 'bar', yAxisIndex: 1, data: counts, itemStyle: { color: '#10b981' } },
      ],
    })
  }

  // Dishes chart
  if (chartInstances.dishes) {
    const dishes = topDishes.value.slice().reverse()
    chartInstances.dishes.setOption({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: '3%', right: '4%', bottom: '3%', top: '3%', containLabel: true },
      xAxis: { type: 'value' },
      yAxis: { type: 'category', data: dishes.map((d) => d.name) },
      series: [{ type: 'bar', data: dishes.map((d) => d.quantity), itemStyle: { color: '#f59e0b', borderRadius: [0, 4, 4, 0] } }],
    })
  }

  // Status chart
  if (chartInstances.status) {
    chartInstances.status.setOption({
      tooltip: { trigger: 'item' },
      legend: { bottom: 0 },
      series: [
        {
          type: 'pie',
          radius: ['40%', '70%'],
          avoidLabelOverlap: false,
          itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
          label: { show: false },
          emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold' } },
          data: statusList.value.map((s) => ({ value: s.count, name: s.label, itemStyle: { color: s.color } })),
        },
      ],
    })
  }

  // Hourly chart
  if (chartInstances.hourly) {
    const hours = Array.from({ length: 24 }, (_, i) => `${i}时`)
    const counts = stats.value.hourlyStats.map((h) => h.count)
    chartInstances.hourly.setOption({
      tooltip: { trigger: 'axis' },
      grid: { left: '3%', right: '4%', bottom: '10%', top: '10%', containLabel: true },
      xAxis: { type: 'category', data: hours },
      yAxis: { type: 'value', minInterval: 1 },
      series: [{ type: 'bar', data: counts, itemStyle: { color: '#3b82f6', borderRadius: [4, 4, 0, 0] } }],
    })
  }
}
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
        <div ref="trendChartRef" class="h-64 w-full"></div>
      </div>

      <!-- Hourly -->
      <div class="bg-white rounded-lg shadow p-5">
        <h3 class="text-base font-semibold text-gray-800 mb-4">24小时时段分布</h3>
        <div ref="hourlyChartRef" class="h-64 w-full"></div>
      </div>

      <!-- Top Dishes -->
      <div class="bg-white rounded-lg shadow p-5">
        <h3 class="text-base font-semibold text-gray-800 mb-4">热门菜品 TOP10</h3>
        <div ref="dishesChartRef" class="h-64 w-full"></div>
      </div>

      <!-- Status -->
      <div class="bg-white rounded-lg shadow p-5">
        <h3 class="text-base font-semibold text-gray-800 mb-4">订单状态分布</h3>
        <div ref="statusChartRef" class="h-64 w-full"></div>
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
