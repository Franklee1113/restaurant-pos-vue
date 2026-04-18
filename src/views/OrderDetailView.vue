<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { OrderAPI, TableStatusAPI, type Order } from '@/api/pocketbase'
import { useSettingsStore } from '@/stores/settings.store'
import { OrderStatus, StatusLabels, StatusFlow } from '@/utils/orderStatus'
import { MoneyCalculator } from '@/utils/security'
import { getFileUrl } from '@/utils/assets'
import { useToast } from '@/composables/useToast'
import { globalConfirm } from '@/composables/useConfirm'
import { printBill, printKitchenTicket } from '@/utils/printBill'
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
const showQrModal = ref(false)
const processing = ref(false)

const statusBadgeClass: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  cooking: 'bg-blue-50 text-blue-700 ring-blue-700/20',
  serving: 'bg-purple-50 text-purple-700 ring-purple-700/20',
  completed: 'bg-green-50 text-green-700 ring-green-600/20',
  cancelled: 'bg-red-50 text-red-700 ring-red-600/20',
}

onMounted(() => {
  loadOrder()
})

async function loadOrder() {
  loading.value = true
  error.value = ''
  try {
    order.value = await OrderAPI.getOrder(orderId.value)
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

async function updateStatus(newStatus: string) {
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

function getQrUrl(field: 'wechatPayQr' | 'alipayQr'): string | null {
  return getFileUrl('settings', settingsStore.settings?.id, settingsStore.settings?.[field])
}

async function confirmPaid() {
  if (!order.value || processing.value) return
  processing.value = true
  try {
    await OrderAPI.updateOrderStatus(order.value.id, OrderStatus.COMPLETED)
    toast.success('已确认收款，订单完成！')
    showQrModal.value = false
    await loadOrder()
  } catch (err: unknown) {
    toast.error('操作失败: ' + (err instanceof Error ? err.message : '未知错误'))
  } finally {
    processing.value = false
  }
}

async function clearTable() {
  if (!order.value || processing.value) return
  const ok = await globalConfirm.confirm({
    title: '确认强制清台',
    description: `确定要清空 ${order.value.tableNo} 号桌的用餐状态吗？请确认此桌已结账完毕。此操作用于紧急情况，将立即释放桌位。`,
    confirmText: '强制清台',
    type: 'danger',
  })
  if (!ok) return
  processing.value = true
  try {
    const ts = await TableStatusAPI.getTableStatus(order.value.tableNo)
    if (ts?.id) {
      await TableStatusAPI.updateTableStatus(ts.id, { status: 'idle', currentOrderId: '' })
    }
    toast.success('清台成功')
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
            v-if="order.status !== OrderStatus.COMPLETED && order.status !== OrderStatus.CANCELLED"
            :disabled="processing"
            class="px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 shadow-sm active:scale-[0.98] transition-transform disabled:opacity-50"
            @click="showQrModal = true"
          >
            扫码收款
          </button>
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
          <button
            class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium shadow-sm active:scale-[0.98] transition-transform"
            @click="router.push({ name: 'editOrder', params: { orderId: order.id } })"
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
              <button
                v-if="order.status !== OrderStatus.CANCELLED && order.status !== OrderStatus.COMPLETED"
                :disabled="processing"
                class="w-full px-3 py-2 rounded-lg text-sm font-medium bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 active:scale-[0.98] transition-transform disabled:opacity-50"
                @click="updateStatus(OrderStatus.CANCELLED)"
              >
                取消订单
              </button>
              <button
                :disabled="processing"
                class="w-full px-3 py-2 rounded-lg text-sm font-medium bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 active:scale-[0.98] transition-transform disabled:opacity-50"
                @click="clearTable"
              >
                强制清台（{{ order.tableNo }}号桌）
              </button>
              <div v-if="(StatusFlow[order.status as keyof typeof StatusFlow] || []).length === 0 && (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.COMPLETED)" class="text-sm text-gray-500">
                当前订单已结束，无需进一步操作
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- QR Checkout Modal -->
    <div
      v-if="showQrModal"
      class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4"
      @click.self="showQrModal = false"
    >
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div class="text-center mb-5">
          <div class="text-2xl font-bold text-gray-900 mb-1">
            应付 {{ MoneyCalculator.format(order?.finalAmount || order?.totalAmount || 0) }}
          </div>
          <div class="text-sm text-gray-500">请顾客扫码支付</div>
        </div>
        <div class="flex justify-center gap-6 mb-5">
          <div v-if="getQrUrl('wechatPayQr')" class="text-center">
            <img :src="getQrUrl('wechatPayQr')!" alt="微信收款码" class="w-32 h-32 object-contain border rounded-lg mx-auto" />
            <div class="text-xs text-gray-600 mt-2">微信支付</div>
          </div>
          <div v-if="getQrUrl('alipayQr')" class="text-center">
            <img :src="getQrUrl('alipayQr')!" alt="支付宝收款码" class="w-32 h-32 object-contain border rounded-lg mx-auto" />
            <div class="text-xs text-gray-600 mt-2">支付宝</div>
          </div>
        </div>
        <div v-if="!getQrUrl('wechatPayQr') && !getQrUrl('alipayQr')" class="text-center text-sm text-gray-500 mb-5">
          尚未在设置中上传收款码，请前往「系统设置 → 收款码设置」上传。
        </div>
        <div class="space-y-2">
          <button
            :disabled="processing"
            class="w-full py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 active:scale-[0.98] transition-transform disabled:opacity-50"
            @click="confirmPaid"
          >
            已听到到账语音，确认收款
          </button>
          <button
            class="w-full py-3 bg-white text-gray-700 border border-gray-300 font-medium rounded-lg hover:bg-gray-50 active:scale-[0.98] transition-transform"
            @click="showQrModal = false"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
