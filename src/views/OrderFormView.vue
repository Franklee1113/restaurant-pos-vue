<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { OrderAPI, DishAPI, TableStatusAPI, type Order, type Dish, type OrderItem, type CreateOrderPayload, subscribeToDishes } from '@/api/pocketbase'
import { useSettingsStore } from '@/stores/settings.store'
import { OrderStatus, generateOrderNo } from '@/utils/orderStatus'
import { MoneyCalculator, Validators } from '@/utils/security'
import { orderFormSchema, CutleryType, type CutleryConfig, type CutleryTypeValue } from '@/schemas/order.schema'
import { useToast } from '@/composables/useToast'
import CutleryConfigPanel from '@/components/CutleryConfigPanel.vue'
import CartPanel from '@/components/CartPanel.vue'
import EmptyState from '@/components/EmptyState.vue'
import SkeletonBox from '@/components/SkeletonBox.vue'
import DishActionSheet from '@/components/DishActionSheet.vue'
import { DISH_RULES, HOT_DISHES } from '@/config/dish.config'

const route = useRoute()
const router = useRouter()
const settingsStore = useSettingsStore()
const toast = useToast()

const isEdit = computed(() => route.name === 'editOrder')
const orderId = computed(() => route.params.orderId as string)

const dishes = ref<Dish[]>([])
const loading = ref(false)
const currentCategory = ref('')
const tableNo = ref('')
const guests = ref(4)
const discountType = ref<'amount' | 'percent'>('amount')
const discountValue = ref(0)
const remark = ref('')
const cart = ref<Array<{ dishId: string; name: string; price: number; quantity: number; remark?: string; isAuto?: boolean; status?: string }>>([])
const editingQtyId = ref<string | null>(null)
const editingQtyValue = ref<number>(1)
const editingRemarkId = ref<string | null>(null)
const cartBump = ref(false)
const submitting = ref(false)
let bumpTimer: ReturnType<typeof setTimeout> | null = null

// ── 沽清功能相关状态 ──
const actionSheetOpen = ref(false)
const selectedDish = ref<Dish | null>(null)
const longPressActive = ref<string | null>(null)
let longPressTimer: ReturnType<typeof setTimeout> | null = null
const LONG_PRESS_DURATION = 600
let dishesUnsubscribe: (() => void) | null = null

const tablewareDish = computed(() => dishes.value.find((d) => d.category === '餐具'))
const cutleryType = ref<CutleryTypeValue>(CutleryType.CHARGED)
const cutleryQty = ref<number>(0)
const cutleryExpanded = ref(false)

const sortedDishes = computed(() => {
  return [...dishes.value].sort((a, b) => {
    const ha = HOT_DISHES.has(a.name) ? 0 : 1
    const hb = HOT_DISHES.has(b.name) ? 0 : 1
    if (ha !== hb) return ha - hb
    return a.name.localeCompare(b.name, 'zh-CN')
  })
})

const filteredDishes = computed(() => {
  let list = sortedDishes.value
  if (currentCategory.value) {
    list = list.filter((d) => d.category === currentCategory.value)
  }
  return list
})

const cartSummary = computed(() => {
  return MoneyCalculator.calculateWithDiscount(cart.value, discountValue.value, discountType.value)
})

const cutleryConfig = computed<CutleryConfig>(() => {
  const unitPrice = cutleryType.value === CutleryType.CHARGED ? (tablewareDish.value ? tablewareDish.value.price : 0) : 0
  return {
    type: cutleryType.value,
    quantity: cutleryQty.value,
    unitPrice,
    totalPrice: unitPrice * cutleryQty.value,
  }
})

const orderSummary = computed(() => {
  const dishSummary = cartSummary.value
  const cutleryPrice = cutleryConfig.value.totalPrice
  return {
    dishesTotal: dishSummary.total,
    cutleryTotal: cutleryPrice,
    subtotal: dishSummary.total + cutleryPrice,
    discount: dishSummary.discount,
    final: dishSummary.final + cutleryPrice,
  }
})

onMounted(() => {
  loadData()
  setupDishesRealtime()
})

onUnmounted(() => {
  if (bumpTimer) {
    clearTimeout(bumpTimer)
    bumpTimer = null
  }
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
  dishesUnsubscribe?.()
})

// ── 沽清功能：实时同步 ──
async function setupDishesRealtime() {
  try {
    dishesUnsubscribe = await subscribeToDishes((updatedDish) => {
      const idx = dishes.value.findIndex((d) => d.id === updatedDish.id)
      if (idx !== -1) {
        dishes.value[idx] = { ...dishes.value[idx], ...updatedDish }
      }
      // 如果购物车中有这道菜且被标记为沽清，弹出提示
      const cartItem = cart.value.find((c) => c.dishId === updatedDish.id)
      if (cartItem && updatedDish.soldOut) {
        toast.warning(`"${updatedDish.name}" 已沽清，请从购物车移除`)
      }
    })
  } catch {
    // SSE 不可用，降级到 visibilitychange 刷新
  }
}

// ── 沽清功能：长按/右键交互 ──
function handleTouchStart(dish: Dish) {
  if (dish.soldOut) return
  longPressActive.value = dish.id
  longPressTimer = setTimeout(() => {
    longPressActive.value = null
    openDishMenu(dish)
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(50)
    }
    longPressTimer = null
  }, LONG_PRESS_DURATION)
}

function handleTouchEnd() {
  longPressActive.value = null
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
}

function handleTouchMove() {
  longPressActive.value = null
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
}

function handleContextMenu(dish: Dish, event: MouseEvent) {
  event.preventDefault()
  if (!dish.soldOut) openDishMenu(dish)
}

function openDishMenu(dish: Dish) {
  selectedDish.value = dish
  actionSheetOpen.value = true
}

async function markDishSoldOut(dish: Dish, note?: string) {
  const idx = dishes.value.findIndex((d) => d.id === dish.id)
  if (idx === -1) return

  const target = dishes.value[idx]
  if (!target) return

  // 乐观更新（只修改目标字段，不替换整个对象）
  dishes.value[idx] = {
    ...target,
    soldOut: true,
    soldOutAt: new Date().toISOString(),
    soldOutNote: note || '',
  }

  actionSheetOpen.value = false

  try {
    await DishAPI.toggleSoldOut(dish.id, true, note)
    toast.success(`"${dish.name}" 已标记沽清`, {
      duration: 10_000,
      action: {
        label: '撤销',
        onClick: async () => {
          await markDishAvailable(dish)
        },
      },
    })
  } catch (err) {
    // 失败回滚（只恢复 soldOut 字段）
    dishes.value[idx] = {
      ...target,
      soldOut: false,
      soldOutAt: undefined,
      soldOutNote: '',
    } as Dish
    toast.error('标记失败: ' + (err instanceof Error ? err.message : '未知错误'))
  }
}

async function markDishAvailable(dish: Dish) {
  const idx = dishes.value.findIndex((d) => d.id === dish.id)
  if (idx === -1) return

  const target = dishes.value[idx]
  if (!target) return

  const originalSoldOut = target.soldOut
  const originalNote = target.soldOutNote
  const originalAt = target.soldOutAt

  dishes.value[idx] = {
    ...target,
    soldOut: false,
    soldOutAt: undefined,
    soldOutNote: '',
  }

  actionSheetOpen.value = false

  try {
    await DishAPI.toggleSoldOut(dish.id, false)
    toast.success(`"${dish.name}" 已恢复售卖`)
  } catch (err) {
    // 失败回滚
    dishes.value[idx] = {
      ...target,
      soldOut: originalSoldOut,
      soldOutAt: originalAt,
      soldOutNote: originalNote,
    } as Dish
    toast.error('恢复失败: ' + (err instanceof Error ? err.message : '未知错误'))
  }
}

async function loadData() {
  loading.value = true
  try {
    await settingsStore.fetchSettings()
    const dishRes = await DishAPI.getDishes()
    dishes.value = dishRes.items

    if (isEdit.value && orderId.value) {
      const order = await OrderAPI.getOrder(orderId.value)
      tableNo.value = order.tableNo
      guests.value = order.guests || 4
      discountType.value = (order.discountType as 'amount' | 'percent') || 'amount'
      discountValue.value = order.discountValue || 0
      remark.value = order.remark || ''
      cart.value = (order.items || []).map((item) => ({
        dishId: item.dishId,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        remark: item.remark || '',
        status: item.status || 'pending',
      }))
      const orderCutlery = order.cutlery
      if (orderCutlery) {
        cutleryType.value = orderCutlery.type || CutleryType.CHARGED
        cutleryQty.value = orderCutlery.quantity || guests.value
      } else {
        cutleryQty.value = guests.value
      }
    } else {
      cutleryQty.value = guests.value
    }
  } catch (err: unknown) {
    toast.error('加载数据失败: ' + (err instanceof Error ? err.message : '未知错误'))
  } finally {
    loading.value = false
  }
}

function triggerCartBump() {
  cartBump.value = true
  if (bumpTimer) clearTimeout(bumpTimer)
  bumpTimer = setTimeout(() => (cartBump.value = false), 200)
}

function addToCart(dish: Dish) {
  // P1-3: 拦截已沽清菜品
  if (dish.soldOut) {
    toast.warning(`"${dish.name}" 已沽清，无法添加`)
    return
  }
  const existing = cart.value.find((i) => i.dishId === dish.id)
  if (existing) {
    existing.quantity = Math.round((existing.quantity + 1) * 10) / 10
  } else {
    cart.value.push({ dishId: dish.id, name: dish.name, price: dish.price, quantity: 1, remark: '' })
  }
  triggerCartBump()

  const rule = DISH_RULES[dish.name]
  if (rule) {
    const existingAddOn = cart.value.find((i) => i.name === rule.add)
    if (!existingAddOn) {
      const addOn = dishes.value.find((d) => d.name === rule.add)
      if (addOn) {
        // 自动添加的配菜如果沽清，也要拦截
        if (addOn.soldOut) {
          toast.warning(`配菜 "${addOn.name}" 已沽清，无法自动添加`)
          return
        }
        cart.value.push({ dishId: addOn.id, name: addOn.name, price: addOn.price, quantity: rule.qty, remark: '', isAuto: true })
        toast.info(`已自动添加 ${rule.add} ${rule.qty}份`)
        triggerCartBump()
      }
    }
  }
}

function removeFromCart(dishId: string) {
  cart.value = cart.value.filter((i) => i.dishId !== dishId)
}

function updateQty(dishId: string, delta: number) {
  const item = cart.value.find((i) => i.dishId === dishId)
  if (!item) return
  item.quantity = Math.round((item.quantity + delta) * 10) / 10
  if (item.quantity <= 0) removeFromCart(dishId)
}

function startEditQty(dishId: string) {
  const item = cart.value.find((i) => i.dishId === dishId)
  if (!item) return
  editingQtyId.value = dishId
  editingQtyValue.value = item.quantity
}

function confirmEditQty() {
  if (!editingQtyId.value) return
  const val = parseFloat(String(editingQtyValue.value))
  if (isNaN(val) || val <= 0) {
    removeFromCart(editingQtyId.value)
    editingQtyId.value = null
    return
  }
  if (!Validators.quantity(val)) {
    toast.error('数量不合法')
    return
  }
  const item = cart.value.find((i) => i.dishId === editingQtyId.value)
  if (item) item.quantity = Math.round(val * 10) / 10
  editingQtyId.value = null
}

function onDiscountTypeChange() {
  if (discountType.value === 'percent') {
    if (discountValue.value > 10) discountValue.value = 8
  }
}

function updateRemark(dishId: string, value: string) {
  const item = cart.value.find((i) => i.dishId === dishId)
  if (item) item.remark = value
}

const formErrors = ref<Record<string, string>>({})

async function submit() {
  if (submitting.value) return
  formErrors.value = {}

  // 购物车沽清校验
  const soldOutItems = cart.value.filter((item) => {
    const dish = dishes.value.find((d) => d.id === item.dishId)
    return dish?.soldOut
  })
  if (soldOutItems.length > 0) {
    toast.error(`以下菜品已沽清，请移除后重试：${soldOutItems.map((i) => i.name).join('、')}`)
    return
  }

  const { discount } = MoneyCalculator.calculateWithDiscount(
    cart.value,
    discountValue.value,
    discountType.value,
  )

  const payload = {
    tableNo: tableNo.value,
    guests: guests.value,
    items: cart.value.map((item) => ({
      dishId: item.dishId,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      status: isEdit.value ? (item.status || 'pending') : 'pending',
    })),
    discountType: discountType.value,
    discountValue: discountValue.value,
    cutlery: cutleryConfig.value,
  }

  const parsed = orderFormSchema.safeParse(payload)
  if (!parsed.success) {
    parsed.error.issues.forEach((issue) => {
      const key = issue.path[0] as string
      if (!formErrors.value[key]) {
        formErrors.value[key] = issue.message
      }
    })
    if (payload.discountType === 'percent' && (payload.discountValue <= 0 || payload.discountValue > 10)) {
      formErrors.value.discountValue = '折扣比例应在0.1-10之间，如8代表8折'
    }
    return
  }

  if (!Validators.amount(orderSummary.value.subtotal) || !Validators.amount(orderSummary.value.final)) {
    toast.error('订单金额异常，请检查')
    return
  }

  const orderData: CreateOrderPayload = {
    tableNo: Validators.sanitizeString(tableNo.value, 50),
    guests: guests.value,
    items: cart.value.map((item) => ({
      dishId: item.dishId,
      name: Validators.sanitizeString(item.name, 100),
      price: item.price,
      quantity: item.quantity,
      remark: item.remark,
      status: (item.status || 'pending') as OrderItem['status'],
    })),
    totalAmount: orderSummary.value.subtotal,
    discount,
    discountType: discountType.value,
    discountValue: discountValue.value,
    finalAmount: orderSummary.value.final,
    remark: remark.value,
    cutlery: cutleryConfig.value,
  }

  // 新建订单时前置检查桌台占用状态
  if (!isEdit.value && tableNo.value) {
    try {
      const ts = await TableStatusAPI.getTableStatus(tableNo.value)
      if (ts && ts.status === 'dining' && ts.currentOrderId) {
        toast.error(`桌台 ${tableNo.value} 已被占用（有未清台订单），请先清台后再新建订单`)
        return
      }
    } catch (err: unknown) {
      // 查询失败不阻断，让后端兜底
      console.error('桌台状态查询失败:', err)
    }
  }

  submitting.value = true
  try {
    if (isEdit.value && orderId.value) {
      await OrderAPI.updateOrder(orderId.value, orderData)
      toast.success('订单修改成功!')
      router.push({ name: 'orderList' })
    } else {
      orderData.orderNo = generateOrderNo()
      orderData.status = OrderStatus.PENDING
      await OrderAPI.createOrder(orderData)
      toast.success('订单创建成功!')
      cart.value = []
      router.push({ name: 'orderList' })
    }
  } catch (err: unknown) {
    toast.error((isEdit.value ? '保存' : '创建') + '失败: ' + (err instanceof Error ? err.message : '未知错误'))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-xl font-bold text-gray-800">{{ isEdit ? '编辑订单' : '新建订单' }}</h2>
      <button class="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 shadow-sm active:scale-[0.98] transition-transform" @click="router.back()">
        ← 返回
      </button>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-5">
      <!-- Left: Dish Selection -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <!-- Table & Guests -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div>
            <label class="block text-sm font-medium text-gray-600 mb-1">选择桌号</label>
            <select
              v-model="tableNo"
              :class="[
                'w-full px-3 py-2 border rounded-lg text-sm transition-shadow duration-200',
                formErrors.tableNo ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500',
              ]"
            >
              <option value="">请选择桌号</option>
              <option v-for="t in settingsStore.tableNumbers" :key="t" :value="t">{{ t }}</option>
            </select>
            <p v-if="formErrors.tableNo" class="mt-1 text-xs text-red-600">{{ formErrors.tableNo }}</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-600 mb-1">人数</label>
            <input
              v-model.number="guests"
              type="number"
              min="1"
              :class="[
                'w-full px-3 py-2 border rounded-lg text-sm text-center transition-shadow duration-200',
                formErrors.guests ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500',
              ]"
            />
            <p v-if="formErrors.guests" class="mt-1 text-xs text-red-600">{{ formErrors.guests }}</p>
          </div>
        </div>

        <!-- Collapsible Cutlery -->
        <div class="bg-gray-50 rounded-lg p-3 mb-4">
          <button
            class="w-full flex items-center justify-between text-sm font-medium text-gray-700"
            @click="cutleryExpanded = !cutleryExpanded"
          >
            <span>餐具配置</span>
            <span class="text-xs text-gray-500">
              {{ cutleryQty }} 套 × {{ cutleryType === CutleryType.CHARGED ? MoneyCalculator.format(cutleryConfig.unitPrice) + '/套' : '免费' }}
              = {{ MoneyCalculator.format(cutleryConfig.totalPrice) }}
            </span>
            <span class="text-gray-400 transition-transform" :class="cutleryExpanded ? 'rotate-180' : ''">▼</span>
          </button>
          <div v-show="cutleryExpanded" class="mt-3">
            <CutleryConfigPanel v-model:model-type="cutleryType" v-model:model-qty="cutleryQty" :guests="guests" />
          </div>
        </div>

        <div v-if="formErrors.items" class="mb-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{{ formErrors.items }}</div>

        <!-- Edit mode status -->
        <div v-if="isEdit" class="mb-4">
          <label class="block text-sm font-medium text-gray-600 mb-1">订单状态</label>
          <div class="text-sm text-gray-500">[状态请在详情页修改]</div>
        </div>

        <!-- Remark -->
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-600 mb-1">整单备注</label>
          <textarea
            v-model="remark"
            rows="2"
            placeholder="例如：少辣、不要葱、生日庆祝等"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow duration-200"
          />
        </div>

        <!-- Categories -->
        <div class="flex gap-2 overflow-x-auto pb-2 mb-4 border-b border-gray-100">
          <button
            :class="[
              'px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors',
              currentCategory === '' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
            ]"
            @click="currentCategory = ''"
          >
            全部
          </button>
          <button
            v-for="cat in settingsStore.categories"
            :key="cat"
            :class="[
              'px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors',
              currentCategory === cat ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
            ]"
            @click="currentCategory = cat"
          >
            {{ cat }}
          </button>
        </div>

        <!-- Dishes Loading -->
        <div v-if="loading" class="space-y-3">
          <div v-for="i in 6" :key="i" class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <SkeletonBox width="120px" height="16px" />
            <SkeletonBox width="60px" height="24px" rounded="rounded-lg" />
          </div>
        </div>

        <EmptyState v-else-if="filteredDishes.length === 0" title="暂无菜品" description="该分类下暂时没有菜品，请联系管理员添加" icon="🍽️" />

        <template v-else>
          <!-- Dishes Mobile List -->
          <div class="sm:hidden space-y-2">
            <div
              v-for="dish in filteredDishes"
              :key="dish.id"
              :class="[
                'flex items-center justify-between p-3 rounded-lg border transition-all select-none',
                dish.soldOut
                  ? 'bg-gray-100 opacity-60 border-gray-200'
                  : 'bg-gray-50 border-transparent hover:border-blue-300'
              ]"
              style="-webkit-touch-callout: none; -webkit-user-select: none; user-select: none;"
              @contextmenu.prevent="handleContextMenu(dish, $event)"
              @touchstart.passive="handleTouchStart(dish)"
              @touchend.passive="handleTouchEnd"
              @touchmove.passive="handleTouchMove"
            >
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1">
                  <span v-if="HOT_DISHES.has(dish.name)" class="text-xs">🔥</span>
                  <div class="font-medium text-sm truncate" :class="dish.soldOut ? 'text-gray-400' : 'text-gray-800'">{{ dish.name }}</div>
                  <span v-if="dish.soldOut" class="px-1.5 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full shrink-0">已沽清</span>
                </div>
                <div class="text-xs truncate" :class="dish.soldOut ? 'text-gray-400' : 'text-gray-500'">
                  {{ dish.soldOut ? (dish.soldOutNote || '今日无货') : (dish.description || dish.category) }}
                </div>
              </div>
              <div class="flex items-center gap-2">
                <div class="font-bold text-sm" :class="dish.soldOut ? 'text-gray-400 line-through' : 'text-red-500'">
                  {{ dish.soldOut ? '—' : MoneyCalculator.format(dish.price) }}
                </div>
                <button
                  v-if="!dish.soldOut"
                  class="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 active:scale-[0.98] transition-transform"
                  @click.stop="addToCart(dish)"
                >
                  + 添加
                </button>
                <div v-else class="px-3 py-1.5 bg-gray-200 text-gray-500 text-xs font-medium rounded-lg">已沽清</div>
              </div>
            </div>
          </div>

          <!-- Dishes Desktop Grid -->
          <div class="hidden sm:grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3">
            <div
              v-for="dish in filteredDishes"
              :key="dish.id"
              :class="[
                'relative rounded-xl p-3 text-center border transition-all select-none',
                longPressActive === dish.id ? 'scale-95' : '',
                dish.soldOut
                  ? 'bg-gray-100 opacity-60 border-gray-200 cursor-not-allowed'
                  : 'bg-gray-50 hover:shadow-md hover:-translate-y-0.5 border-transparent hover:border-blue-300'
              ]"
              style="-webkit-touch-callout: none; -webkit-user-select: none; user-select: none;"
              @contextmenu.prevent="handleContextMenu(dish, $event)"
              @touchstart.passive="handleTouchStart(dish)"
              @touchend.passive="handleTouchEnd"
              @touchmove.passive="handleTouchMove"
            >
              <!-- 已沽清标签 -->
              <div v-if="dish.soldOut" class="absolute top-1 right-1 px-1.5 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full">
                已沽清
              </div>

              <div class="flex items-center justify-center gap-1 mb-1">
                <span v-if="HOT_DISHES.has(dish.name)" class="text-xs">🔥</span>
                <div class="font-semibold text-sm truncate" :class="dish.soldOut ? 'text-gray-400' : 'text-gray-800'">{{ dish.name }}</div>
              </div>
              <div class="text-xs truncate mb-2" :class="dish.soldOut ? 'text-gray-400' : 'text-gray-500'">
                {{ dish.soldOut ? (dish.soldOutNote || '今日无货') : (dish.description || dish.category) }}
              </div>
              <div class="font-bold text-base mb-2" :class="dish.soldOut ? 'text-gray-400 line-through' : 'text-red-500'">
                {{ dish.soldOut ? '—' : MoneyCalculator.format(dish.price) }}
              </div>

              <button
                v-if="!dish.soldOut"
                class="w-full py-1.5 px-3 bg-blue-600 text-white text-xs font-medium rounded-full hover:bg-blue-700 active:scale-[0.98] transition-transform"
                @click.stop="addToCart(dish)"
              >
                + 添加
              </button>
              <div v-else class="w-full py-1.5 px-3 bg-gray-200 text-gray-500 text-xs font-medium rounded-full">已沽清</div>
            </div>
          </div>
        </template>
      </div>

      <!-- Right: Cart -->
      <div :class="['transition-transform duration-200', cartBump ? 'scale-[1.02]' : 'scale-100']">
        <CartPanel
          :cart="cart"
          v-model:discount-type="discountType"
          v-model:discount-value="discountValue"
          v-model:editing-qty-value="editingQtyValue"
          :dishes-total="orderSummary.dishesTotal"
          :cutlery-total="orderSummary.cutleryTotal"
          :final-total="orderSummary.final"
          :is-edit="isEdit"
          :editing-qty-id="editingQtyId"
          :editing-remark-id="editingRemarkId"
          :submitting="submitting"
          @qty-change="updateQty"
          @edit-qty="startEditQty"
          @confirm-qty="confirmEditQty"
          @edit-remark="editingRemarkId = $event"
          @blur-remark="editingRemarkId = null"
          @update-remark="updateRemark"
          @remove="removeFromCart"
          @submit="submit"
          @discount-type-change="onDiscountTypeChange"
        />
      </div>
    </div>

    <!-- Dish Action Sheet -->
    <DishActionSheet
      :open="actionSheetOpen"
      :dish="selectedDish"
      @close="actionSheetOpen = false"
      @mark-sold-out="(note?: string) => selectedDish && markDishSoldOut(selectedDish, note)"
      @mark-available="selectedDish && markDishAvailable(selectedDish)"
    />
  </div>
</template>
