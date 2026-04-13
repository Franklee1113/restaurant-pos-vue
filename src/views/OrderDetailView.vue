<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { OrderAPI, type Order } from '@/api/pocketbase'
import { useSettingsStore } from '@/stores/settings.store'
import { OrderStatus, StatusLabels, StatusFlow, StatusColors } from '@/utils/orderStatus'
import { printBill, printKitchenTicket } from '@/utils/printBill'

const route = useRoute()
const router = useRouter()
const settingsStore = useSettingsStore()

const orderId = route.params.orderId as string
const order = ref<Order | null>(null)
const loading = ref(false)
const error = ref('')

onMounted(() => {
  if (!orderId) {
    error.value = '订单ID不能为空'
    return
  }
  loadOrder()
  settingsStore.fetchSettings()
})

async function loadOrder() {
  loading.value = true
  error.value = ''
  try {
    order.value = await OrderAPI.getOrder(orderId)
  } catch (err: any) {
    error.value = err.message || '加载订单失败'
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
  if (!order.value) return
  const statusName = StatusLabels[newStatus as keyof typeof StatusLabels]
  if (!confirm(`确定要将订单状态变更为"${statusName}"吗？`)) return
  try {
    await OrderAPI.updateOrderStatus(order.value.id, newStatus)
    alert('状态更新成功！')
    await loadOrder()
  } catch (err: any) {
    alert('更新失败: ' + err.message)
  }
}

async function deleteOrder() {
  if (!order.value) return
  if (!confirm('确定要删除此订单吗？此操作不可恢复！')) return
  try {
    await OrderAPI.deleteOrder(order.value.id)
    alert('订单已删除！')
    router.replace({ name: 'orderList' })
  } catch (err: any) {
    alert('删除失败: ' + err.message)
  }
}
</script>

<template>
  <div>
    <!-- Error -->
    <div v-if="error" class="text-center py-12">
      <h3 class="text-lg font-medium text-gray-800 mb-2">加载订单失败</h3>
      <p class="text-gray-500 mb-4">{{ error }}</p>
      <button
        class="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
        @click="router.back()"
      >
        ← 返回
      </button>
    </div>

    <!-- Loading -->
    <div v-else-if="loading || !order" class="text-center py-12 text-gray-500">
      加载中...
    </div>

    <!-- Content -->
    <div v-else>
      <!-- Header -->
      <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div class="flex items-center gap-4">
          <button
            class="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
            @click="router.back()"
          >
            ← 返回
          </button>
          <h2 class="text-xl font-bold text-gray-800">订单详情 - {{ order.orderNo }}</h2>
        </div>
        <div class="flex items-center gap-2">
          <button
            class="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm"
            @click="handlePrintBill"
          >
            🖨️ 打印账单
          </button>
          <button
            class="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm"
            @click="handlePrintKitchen"
          >
            🍳 打印厨单
          </button>
          <button
            class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
            @click="router.push({ name: 'editOrder', params: { orderId: order.id } })"
          >
            编辑
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Info & Actions -->
        <div class="lg:col-span-1 space-y-6">
          <!-- Basic Info -->
          <div class="bg-white rounded-lg shadow p-6">
            <h3 class="text-lg font-semibold text-gray-800 mb-4">基本信息</h3>
            <div class="space-y-3 text-sm">
              <div class="flex justify-between">
                <span class="text-gray-500">订单号</span>
                <span class="font-medium text-gray-900">{{ order.orderNo }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-500">桌号</span>
                <span class="font-medium text-gray-900">{{ order.tableNo }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-500">人数</span>
                <span class="font-medium text-gray-900">{{ order.guests || 1 }}人</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-500">状态</span>
                <span
                  class="inline-block px-2 py-0.5 rounded text-xs text-white"
                  :style="{ backgroundColor: StatusColors[order.status as keyof typeof StatusColors] || '#999' }"
                >
                  {{ StatusLabels[order.status as keyof typeof StatusLabels] || order.status }}
                </span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-500">下单时间</span>
                <span class="font-medium text-gray-900">{{ new Date(order.created).toLocaleString('zh-CN') }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-500">服务员</span>
                <span class="font-medium text-gray-900">{{ (order as any).waiter || '管理员' }}</span>
              </div>
            </div>
          </div>

          <!-- Status Actions -->
          <div class="bg-white rounded-lg shadow p-6">
            <h3 class="text-lg font-semibold text-gray-800 mb-4">状态操作</h3>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="status in StatusFlow[order.status as keyof typeof StatusFlow] || []"
                :key="status"
                class="px-3 py-2 rounded-md text-sm font-medium bg-blue-50 text-blue-700 hover:bg-blue-100"
                @click="updateStatus(status)"
              >
                标记为{{ StatusLabels[status] }}
              </button>
              <button
                v-if="order.status !== OrderStatus.CANCELLED && order.status !== OrderStatus.COMPLETED"
                class="px-3 py-2 rounded-md text-sm font-medium bg-red-50 text-red-600 hover:bg-red-100"
                @click="updateStatus(OrderStatus.CANCELLED)"
              >
                取消订单
              </button>
              <button
                class="px-3 py-2 rounded-md text-sm font-medium bg-red-600 text-white hover:bg-red-700"
                @click="deleteOrder"
              >
                删除订单
              </button>
            </div>
          </div>
        </div>

        <!-- Order Items -->
        <div class="lg:col-span-2">
          <div class="bg-white rounded-lg shadow p-6">
            <h3 class="text-lg font-semibold text-gray-800 mb-4">订单明细</h3>
            <table class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">菜品</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">单价</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">数量</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">小计</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200">
                <tr v-if="!order.items || order.items.length === 0">
                  <td colspan="4" class="px-4 py-4 text-center text-gray-500">暂无菜品</td>
                </tr>
                <tr v-for="item in order.items" :key="item.dishId">
                  <td class="px-4 py-3 text-sm text-gray-900">{{ item.name }}</td>
                  <td class="px-4 py-3 text-sm text-gray-700">¥{{ item.price.toFixed(2) }}</td>
                  <td class="px-4 py-3 text-sm text-gray-700">{{ item.quantity }}</td>
                  <td class="px-4 py-3 text-sm text-gray-900">¥{{ (item.price * item.quantity).toFixed(2) }}</td>
                </tr>
              </tbody>
              <tfoot class="bg-gray-50">
                <tr>
                  <td colspan="3" class="px-4 py-3 text-right text-sm font-medium text-gray-700">小计:</td>
                  <td class="px-4 py-3 text-sm font-medium text-gray-900">¥{{ (order.totalAmount || 0).toFixed(2) }}</td>
                </tr>
                <tr v-if="order.discount">
                  <td colspan="3" class="px-4 py-3 text-right text-sm font-medium text-gray-700">折扣:</td>
                  <td class="px-4 py-3 text-sm font-medium text-gray-900">
                    -¥{{ order.discount.toFixed(2) }}{{ order.discountType === 'percent' ? ` (${order.discountValue}折)` : '' }}
                  </td>
                </tr>
                <tr>
                  <td colspan="3" class="px-4 py-3 text-right text-sm font-bold text-gray-900">合计:</td>
                  <td class="px-4 py-3 text-sm font-bold text-gray-900">¥{{ (order.finalAmount || order.totalAmount || 0).toFixed(2) }}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <!-- Remark -->
          <div v-if="(order as any).remark" class="bg-white rounded-lg shadow p-6 mt-6">
            <h3 class="text-lg font-semibold text-gray-800 mb-2">备注</h3>
            <p class="text-gray-700">{{ (order as any).remark }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
