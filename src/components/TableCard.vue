<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { type Order, OrderAPI } from '@/api/pocketbase'
import { OrderStatus, StatusLabels, StatusBadgeClass as statusBadgeClass } from '@/utils/orderStatus'
import { MoneyCalculator } from '@/utils/security'
import { useToast } from '@/composables/useToast'
import { printBill } from '@/utils/printBill'
import { useSettingsStore } from '@/stores/settings.store'

const props = defineProps<{
  tableNo: string
  displayStatus: 'idle' | 'dining' | 'pending_clear'
  tableStatus: string
  currentOrderId?: string
  order: Order | null
  extraOrders: number
}>()

const emit = defineEmits<{
  (e: 'markServed', orderId: string, itemIndex: number): void
  (e: 'refresh'): void
}>()

const router = useRouter()
const toast = useToast()
const settingsStore = useSettingsStore()

// 订单状态标签
const orderStatusLabel = computed(() => {
  if (!props.order) return '-'
  return StatusLabels[props.order.status] || props.order.status
})

const orderStatusClass = computed(() => {
  if (!props.order) return ''
  return statusBadgeClass[props.order.status] || 'bg-gray-50 text-gray-700 ring-gray-600/20'
})

// 桌台状态边框颜色
const borderColorClass = computed(() => {
  switch (props.displayStatus) {
    case 'idle': return 'border-l-green-500'
    case 'dining': return 'border-l-orange-500'
    case 'pending_clear': return 'border-l-yellow-500'
    default: return 'border-l-gray-300'
  }
})

// 等待时长
const waitInfo = computed(() => {
  if (!props.order) return null
  const minutes = Math.floor((Date.now() - new Date(props.order.created).getTime()) / 60000)
  let colorClass = 'text-gray-400'
  if (minutes >= 20) colorClass = 'text-red-600 font-bold'
  else if (minutes >= 10) colorClass = 'text-orange-500'
  return { minutes, colorClass }
})

// 菜品按状态排序：cooked → cooking → pending → served
const sortedItems = computed(() => {
  if (!props.order?.items) return []
  const priority: Record<string, number> = { cooked: 0, cooking: 1, pending: 2, served: 3 }
  return [...props.order.items].map((item, index) => ({ ...item, originalIndex: index })).sort((a, b) => {
    const pa = priority[a.status || 'pending'] ?? 2
    const pb = priority[b.status || 'pending'] ?? 2
    return pa - pb
  })
})

// 待上菜数量
const cookedCount = computed(() => {
  return sortedItems.value.filter(item => item.status === 'cooked').length
})

// 菜品状态样式
function getDishStatusDotClass(status?: string): string {
  switch (status) {
    case 'cooked': return 'w-2.5 h-2.5 rounded-full bg-green-500'
    case 'cooking': return 'w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse'
    case 'served': return 'w-2 h-2 rounded-full bg-gray-200'
    default: return 'w-2 h-2 rounded-full bg-gray-300'
  }
}

function getDishRowClass(status?: string): string {
  switch (status) {
    case 'cooked': return 'bg-green-50 rounded-lg px-2 py-1.5 -mx-2'
    case 'served': return 'opacity-50 text-gray-400'
    default: return ''
  }
}

function getDishStatusText(status?: string): string {
  switch (status) {
    case 'cooked': return '已做好'
    case 'cooking': return '制作中'
    case 'served': return '已上菜'
    default: return '待制作'
  }
}

// 操作
function handleView() {
  if (!props.order) return
  router.push({ name: 'orderDetail', params: { orderId: props.order.id } })
}

function handleEdit() {
  if (!props.order) return
  router.push({ name: 'editOrder', params: { orderId: props.order.id } })
}

function handlePrint() {
  if (!props.order) return
  printBill(props.order, settingsStore.settings)
}

async function handleMarkServed(originalIndex: number) {
  if (!props.order) return
  try {
    await OrderAPI.updateOrderItemStatus(props.order.id, originalIndex, 'served')
    toast.success('已标记上菜')
    emit('refresh')
  } catch (err: unknown) {
    toast.error('标记失败: ' + (err instanceof Error ? err.message : '未知错误'))
  }
}

const isEditDisabled = computed(() => {
  if (!props.order) return true
  return props.order.status === OrderStatus.COMPLETED || props.order.status === OrderStatus.SETTLED
})
</script>

<template>
  <div
    class="bg-white rounded-xl shadow-sm border border-gray-100 border-l-4 transition-all hover:shadow-md"
    :class="borderColorClass"
  >
    <!-- Header -->
    <div class="p-4 pb-2">
      <div class="flex items-start justify-between">
        <div>
          <div class="text-2xl font-bold text-gray-900">{{ tableNo }}</div>
        </div>
        <span
          class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset"
          :class="orderStatusClass"
        >
          {{ orderStatusLabel }}
        </span>
      </div>

      <!-- 订单号 -->
      <div v-if="order" class="mt-1 text-xs text-gray-400">
        #{{ order.orderNo }}
      </div>

      <!-- 人数 + 金额 + 等待时长 -->
      <div v-if="order" class="mt-2 flex flex-wrap items-center gap-3 text-sm">
        <span class="text-gray-700">👤 {{ order.guests || 1 }}人</span>
        <span class="font-semibold text-gray-900">💰 {{ MoneyCalculator.format(order.finalAmount || 0) }}</span>
        <span v-if="waitInfo" :class="waitInfo.colorClass">
          ⏱️ 已等 {{ waitInfo.minutes }}分
        </span>
      </div>

      <!-- 一桌多单提示 -->
      <div v-if="extraOrders > 0" class="mt-1">
        <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-600">
          +{{ extraOrders }} 个关联订单
        </span>
      </div>
    </div>

    <!-- Dishes -->
    <div v-if="order && order.items && order.items.length > 0" class="px-4 py-2">
      <div class="border-t border-gray-100 pt-2">
        <!-- 待上菜提示 -->
        <div v-if="cookedCount > 0" class="mb-2">
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">
            🔔 待上菜 {{ cookedCount }} 道
          </span>
        </div>

        <!-- 菜品列表 -->
        <div class="space-y-1">
          <div
            v-for="item in sortedItems"
            :key="item.originalIndex"
            :class="getDishRowClass(item.status)"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2 min-w-0">
                <div :class="getDishStatusDotClass(item.status)" />
                <span class="text-sm font-medium text-gray-800 truncate">{{ item.name }}</span>
              </div>
              <div class="flex items-center gap-2 text-sm text-gray-600 shrink-0">
                <span>×{{ item.quantity }}</span>
                <span class="text-gray-400">¥{{ item.price }}</span>
              </div>
            </div>

            <!-- 状态标签 + 备注 -->
            <div class="ml-4.5 mt-0.5 flex flex-wrap items-center gap-2">
              <span
                class="text-[11px]"
                :class="{
                  'text-green-600 font-medium': item.status === 'cooked',
                  'text-blue-600': item.status === 'cooking',
                  'text-gray-400': !item.status || item.status === 'pending',
                  'text-gray-300': item.status === 'served',
                }"
              >
                {{ getDishStatusText(item.status) }}
              </span>
              <span v-if="item.remark" class="text-[11px] text-gray-400">
                📝 {{ item.remark }}
              </span>
            </div>

            <!-- 标记上菜按钮 -->
            <div v-if="item.status === 'cooked'" class="ml-4.5 mt-1">
              <button
                class="px-2 py-0.5 text-[11px] font-medium text-green-700 bg-green-50 border border-green-200 rounded hover:bg-green-100 active:scale-[0.98] transition-transform"
                @click="handleMarkServed(item.originalIndex)"
              >
                ✓ 标记上菜
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Actions -->
    <div v-if="order" class="px-4 py-3 border-t border-gray-100">
      <div class="flex flex-wrap items-center gap-2">
        <button
          class="px-2.5 py-1 text-xs font-medium bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 active:scale-[0.98] transition-transform"
          @click="handleView"
        >
          查看
        </button>
        <button
          :disabled="isEditDisabled"
          class="px-2.5 py-1 text-xs font-medium rounded-md active:scale-[0.98] transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
          :class="isEditDisabled
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
            : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'"
          @click="handleEdit"
        >
          编辑
        </button>
        <button
          class="px-2.5 py-1 text-xs font-medium bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 active:scale-[0.98] transition-transform"
          @click="handlePrint"
        >
          打印账单
        </button>
      </div>
    </div>
  </div>
</template>
