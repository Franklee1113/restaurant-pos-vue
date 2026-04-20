<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { OrderAPI, DishAPI, TableStatusAPI, type Order, type OrderStatusValue, type Dish } from '@/api/pocketbase'
import { useSettingsStore } from '@/stores/settings.store'
import { OrderStatus, StatusLabels, StatusFlow, StatusBadgeClass as statusBadgeClass } from '@/utils/orderStatus'
import { MoneyCalculator } from '@/utils/security'
import { useToast } from '@/composables/useToast'
import { globalConfirm } from '@/composables/useConfirm'
import { useClearTable } from '@/composables/useClearTable'
import { printBill, printKitchenTicket } from '@/utils/printBill'
import { useBluetoothPrinter, isBluetoothPrintSupported, type BluetoothPrintOrder } from '@/composables/useBluetoothPrinter'
import EmptyState from '@/components/EmptyState.vue'
import SkeletonBox from '@/components/SkeletonBox.vue'

const route = useRoute()
const router = useRouter()
const settingsStore = useSettingsStore()
const toast = useToast()

const orderId = computed(() => route.params.orderId as string)
const order = ref<Order | null>(null)
const loading = ref(false)
const error = ref('')
const processing = ref(false)
const dishes = ref<Dish[]>([])
const { checkCanClearTable, executeClearTable } = useClearTable()

const dishMap = computed(() => {
  const map = new Map<string, Dish>()
  for (const d of dishes.value) {
    map.set(d.id, d)
  }
  return map
})



onMounted(() => {
  loadOrder()
})

// P1-15: 组件复用时（route params 变化）自动刷新订单数据
watch(orderId, () => {
  loadOrder()
})

async function loadOrder() {
  loading.value = true
  error.value = ''
  try {
    order.value = await OrderAPI.getOrder(orderId.value)
    // 并行加载菜品数据（用于显示 soldOut 状态）
    try {
      const dishRes = await DishAPI.getDishes()
      dishes.value = dishRes.items
    } catch {
      // 失败不影响主流程
    }
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : '加载订单失败'
  } finally {
    loading.value = false
  }
}

function handlePrintBill() {
  if (order.value) printBill(order.value, settingsStore.settings)
}

function handlePrintKitchen() {
  if (order.value) printKitchenTicket(order.value, settingsStore.settings)
}

// P3-4: 蓝牙打印
const { print: printBluetooth, isConnecting: btConnecting, lastError: btError, connectedPrinter } = useBluetoothPrinter()

async function handleBluetoothPrint() {
  if (!order.value) return
  const o = order.value
  const printOrder: BluetoothPrintOrder = {
    restaurantName: settingsStore.settings?.restaurantName || '智能点菜系统',
    orderNo: o.orderNo,
    tableNo: o.tableNo,
    guests: o.guests || 1,
    items: (o.items || []).map((i) => ({
      name: i.name,
      quantity: i.quantity,
      price: i.price,
      remark: i.remark,
    })),
    totalAmount: o.totalAmount || 0,
    discount: o.discount || 0,
    finalAmount: o.finalAmount || 0,
    remark: o.remark || '',
    created: o.created,
  }
  const ok = await printBluetooth(printOrder)
  if (ok) {
    toast.success('蓝牙打印已发送')
  } else if (btError.value) {
    toast.error(btError.value)
  }
}

async function updateStatus(newStatus: OrderStatusValue) {
  if (!order.value || processing.value) return
  const statusName = StatusLabels[newStatus as keyof typeof StatusLabels]
  const ok = await globalConfirm.confirm({
    title: '确认变更状态',
    description: `确定要将订单状态变更为"${statusName}"吗？`,
    confirmText: '确定变更',
    type: newStatus === OrderStatus.CANCELLED ? 'danger' : 'default',
  })
  if (!ok) return
  processing.value = true
  try {
    await OrderAPI.updateOrderStatus(order.value.id, newStatus)
    toast.success('状态更新成功！')
    await loadOrder()
  } catch (err: unknown) {
    toast.error('更新失败: ' + (err instanceof Error ? err.message : '未知错误'))
  } finally {
    processing.value = false
  }
}

async function handleEdit() {
  if (!order.value) return
  const endedStatuses: OrderStatusValue[] = [OrderStatus.COMPLETED, OrderStatus.SETTLED]

  if (endedStatuses.includes(order.value.status)) {
    toast.error('已结账/已清台订单不可编辑')
    return
  }

  router.push({ name: 'editOrder', params: { orderId: order.value.id } })
}

async function deleteOrder() {
  if (!order.value || processing.value) return
  const ok = await globalConfirm.confirm({
    title: '确认删除订单',
    description: '确定要删除此订单吗？此操作不可恢复！',
    confirmText: '删除',
    type: 'danger',
  })
  if (!ok) return
  processing.value = true
  try {
    await OrderAPI.deleteOrder(order.value.id)
    toast.success('订单已删除！')
    router.replace({ name: 'orderList' })
  } catch (err: unknown) {
    toast.error('删除失败: ' + (err instanceof Error ? err.message : '未知错误'))
  } finally {
    processing.value = false
  }
}

async function clearTable() {
  if (!order.value || processing.value) return
  processing.value = true
  const tableNo = order.value.tableNo

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
      } else if (reason === 'dining') {
        await globalConfirm.confirm({
          title: '不可清台',
          description: '该订单客人还在用餐中，尚未结账，无法清台。请先结账后再清台。',
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
    toast.success('清台成功')
    // P1-12: 清台成功后刷新订单详情
    await loadOrder()
  } catch (err: unknown) {
    toast.error('清台失败: ' + (err instanceof Error ? err.message : '未知错误'))
  } finally {
    processing.value = false
  }
}
</script>

<template>
  <div>
    <!-- Error -->
    <div v-if="error && !loading" class="text-center py-12">
      <EmptyState title="加载订单失败" :description="error" icon="⚠️">
        <button
          class="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 shadow-sm active:scale-[0.98] transition-transform"
          @click="router.back()"
        >
          ← 返回
        </button>
      </EmptyState>
    </div>

    <!-- Loading -->
    <div v-else-if="loading || !order" class="space-y-4">
      <div class="flex items-center gap-3">
        <SkeletonBox width="80px" height="40px" rounded="rounded-lg" />
        <SkeletonBox width="200px" height="28px" />
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div class="lg:col-span-1 space-y-4">
          <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-3">
            <SkeletonBox width="80px" height="20px" />
            <SkeletonBox width="100%" height="16px" />
            <SkeletonBox width="100%" height="16px" />
            <SkeletonBox width="100%" height="16px" />
          </div>
        </div>
        <div class="lg:col-span-2">
          <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-3">
            <SkeletonBox width="80px" height="20px" />
            <SkeletonBox width="100%" height="120px" />
          </div>
        </div>
      </div>
    </div>

    <!-- Content -->
    <div v-else>
      <!-- Header -->
      <div class="flex flex-wrap items-center justify-between gap-4 mb-5">
        <div class="flex items-center gap-3">
          <button
            class="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 shadow-sm active:scale-[0.98] transition-transform"
            @click="router.back()"
          >
            ← 返回
          </button>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <button
            class="px-3 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 active:scale-[0.98] transition-transform"
            @click="handlePrintBill"
          >
            打印账单
          </button>
          <button
            class="px-3 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 active:scale-[0.98] transition-transform"
            @click="handlePrintKitchen"
          >
            打印厨单
          </button>
          <!-- P3-4: 蓝牙打印 -->
          <button
            :disabled="!isBluetoothPrintSupported() || btConnecting"
            :title="!isBluetoothPrintSupported() ? '蓝牙打印需要 HTTPS 环境（Chrome/Edge）' : connectedPrinter?.server.connected ? `已连接: ${connectedPrinter.name}` : '点击连接蓝牙打印机'"
            class="px-3 py-2 rounded-lg text-sm font-medium active:scale-[0.98] transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
            :class="[
              connectedPrinter?.server.connected
                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50',
            ]"
            @click="handleBluetoothPrint"
          >
            {{ btConnecting ? '连接中...' : (connectedPrinter?.server.connected ? '🖨️ 蓝牙打印' : '📡 蓝牙打印') }}
          </button>
          <button
            :class="[
              'px-4 py-2 rounded-lg text-sm font-medium shadow-sm active:scale-[0.98] transition-transform',
              order && (order.status === OrderStatus.COMPLETED || order.status === OrderStatus.SETTLED)
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700',
            ]"
            @click="handleEdit"
          >
            编辑订单
          </button>
          <button
            :disabled="processing"
            class="px-3 py-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg text-sm font-medium active:scale-[0.98] transition-transform disabled:opacity-50"
            @click="deleteOrder"
          >
            删除
          </button>
        </div>
      </div>

      <!-- Order Header Card -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-5">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div class="flex items-center gap-4">
            <div class="w-16 h-16 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-2xl font-bold">
              {{ order.tableNo }}
            </div>
            <div>
              <div class="text-sm text-gray-500">订单号</div>
              <div class="text-lg font-bold text-gray-900">{{ order.orderNo }}</div>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <div class="flex items-center gap-1.5">
              <span
                class="inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset"
                :class="statusBadgeClass[order.status] || 'bg-gray-50 text-gray-700 ring-gray-600/20'"
              >
                {{ StatusLabels[order.status as keyof typeof StatusLabels] || order.status }}
              </span>
              <span
                v-if="order.source === 'customer'"
                class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-600 border border-blue-100"
              >
                顾客扫码
              </span>
            </div>
            <div class="text-sm text-gray-500">
              {{ new Date(order.created).toLocaleString('zh-CN') }}
            </div>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
        <!-- Left: Items Receipt -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 class="text-base font-semibold text-gray-800 mb-4 pb-2 border-b">订单明细</h3>

          <div v-if="!order.items || order.items.length === 0" class="text-center text-gray-500 py-8">
            暂无菜品
          </div>

          <!-- Receipt items -->
          <div v-else class="space-y-2">
            <div
              v-for="item in order.items"
              :key="item.dishId"
              class="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
            >
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <div class="text-sm font-medium text-gray-800">{{ item.name }}</div>
                  <span
                    v-if="dishMap.get(item.dishId)?.soldOut"
                    class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-600"
                  >
                    已沽清
                  </span>
                  <span
                    v-else
                    class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium"
                    :class="{
                      'bg-amber-50 text-amber-700': (item.status || 'pending') === 'pending',
                      'bg-blue-50 text-blue-700': item.status === 'cooking',
                      'bg-green-50 text-green-700': item.status === 'cooked',
                      'bg-gray-100 text-gray-600': item.status === 'served',
                    }"
                  >
                    {{ { pending: '待制作', cooking: '制作中', cooked: '已做好', served: '已上菜' }[item.status || 'pending'] }}
                  </span>
                </div>
                <div class="text-xs text-gray-500">{{ MoneyCalculator.format(item.price) }} × {{ item.quantity }}</div>
              </div>
              <div class="text-right">
                <div class="text-sm font-semibold text-gray-900">
                  {{ MoneyCalculator.format(MoneyCalculator.calculate([{ price: item.price, quantity: item.quantity }], 0).total) }}
                </div>
                <div v-if="item.remark" class="text-[11px] text-gray-500">备注: {{ item.remark }}</div>
              </div>
            </div>

            <!-- Cutlery row -->
            <div v-if="order.cutlery && order.cutlery.quantity > 0" class="flex items-center justify-between py-2 border-b border-gray-50">
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium text-gray-800">
                  餐具
                  <span class="text-xs text-gray-500">({{ order.cutlery.type === 'charged' ? '收费' : '免费' }})</span>
                </div>
                <div class="text-xs text-gray-500">
                  {{ order.cutlery.type === 'charged' ? MoneyCalculator.format(order.cutlery.unitPrice) : '-' }} × {{ order.cutlery.quantity }}
                </div>
              </div>
              <div class="text-sm font-semibold text-gray-900">
                {{ order.cutlery.type === 'charged' ? MoneyCalculator.format(order.cutlery.totalPrice) : '-' }}
              </div>
            </div>
          </div>

          <!-- Totals -->
          <div class="mt-4 pt-4 border-t border-dashed space-y-2">
            <div class="flex justify-between text-sm">
              <span class="text-gray-500">菜品小计</span>
              <span class="font-medium text-gray-900">
                {{ MoneyCalculator.format(Math.max(0, (order.totalAmount || 0) - (order.cutlery?.totalPrice || 0))) }}
              </span>
            </div>
            <div v-if="order.cutlery && order.cutlery.type === 'charged' && order.cutlery.totalPrice > 0" class="flex justify-between text-sm">
              <span class="text-gray-500">餐具费 ({{ order.cutlery.quantity }}套)</span>
              <span class="font-medium text-gray-900">{{ MoneyCalculator.format(order.cutlery.totalPrice) }}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-gray-500">小计</span>
              <span class="font-medium text-gray-900">{{ MoneyCalculator.format(order.totalAmount || 0) }}</span>
            </div>
            <div v-if="order.discount" class="flex justify-between text-sm">
              <span class="text-gray-500">折扣</span>
              <span class="font-medium text-gray-900">
                -{{ MoneyCalculator.format(order.discount) }}{{ order.discountType === 'percent' ? ` (${order.discountValue}折)` : '' }}
              </span>
            </div>
            <div class="flex justify-between items-center pt-3 border-t border-gray-100">
              <span class="text-base font-bold text-gray-900">合计</span>
              <span class="text-xl font-bold text-red-500">{{ MoneyCalculator.format(order.finalAmount || order.totalAmount || 0) }}</span>
            </div>
          </div>

          <!-- Remark -->
          <div v-if="order.remark" class="mt-4 p-3 bg-amber-50 rounded-lg text-sm text-amber-800">
            <span class="font-medium">备注:</span> {{ order.remark }}
          </div>
        </div>

        <!-- Right: Info & Actions -->
        <div class="space-y-4">
          <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h3 class="text-base font-semibold text-gray-800 mb-4">基本信息</h3>
            <div class="space-y-3 text-sm">
              <div class="flex justify-between">
                <span class="text-gray-500">桌号</span>
                <span class="font-medium text-gray-900">{{ order.tableNo }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-500">人数</span>
                <span class="font-medium text-gray-900">{{ order.guests || 1 }}人</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-500">服务员</span>
                <span class="font-medium text-gray-900">{{ order.waiter || '管理员' }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-500">下单时间</span>
                <span class="font-medium text-gray-900">{{ new Date(order.created).toLocaleString('zh-CN') }}</span>
              </div>
            </div>
          </div>

          <!-- Status Actions -->
          <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h3 class="text-base font-semibold text-gray-800 mb-4">状态操作</h3>
            <div class="space-y-2">
              <button
                v-for="status in StatusFlow[order.status as keyof typeof StatusFlow] || []"
                :key="status"
                :disabled="processing"
                class="w-full px-3 py-2 rounded-lg text-sm font-medium bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100 active:scale-[0.98] transition-transform disabled:opacity-50"
                @click="updateStatus(status)"
              >
                标记为{{ StatusLabels[status] }}
              </button>
              <!-- P1-13: 取消按钮显示逻辑复用 StatusFlow，仅当允许 cancelled 流转时才显示 -->
              <button
                v-if="(StatusFlow[order.status as keyof typeof StatusFlow] || []).includes(OrderStatus.CANCELLED)"
                :disabled="processing"
                class="w-full px-3 py-2 rounded-lg text-sm font-medium bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 active:scale-[0.98] transition-transform disabled:opacity-50"
                @click="updateStatus(OrderStatus.CANCELLED)"
              >
                取消
              </button>
              <button
                :disabled="processing"
                class="w-full px-3 py-2 rounded-lg text-sm font-medium bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 active:scale-[0.98] transition-transform disabled:opacity-50"
                @click="clearTable"
              >
                清台（{{ order.tableNo }}号桌）
              </button>
              <div v-if="(StatusFlow[order.status as keyof typeof StatusFlow] || []).length === 0 && (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.COMPLETED || order.status === OrderStatus.SETTLED)" class="text-sm text-gray-500">
                当前订单已结束，无需进一步操作
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>
