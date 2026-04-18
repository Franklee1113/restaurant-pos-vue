<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { DishAPI, PublicOrderAPI, TableStatusAPI, type Dish, type OrderItem, type Order, type TableStatus } from '@/api/pocketbase'
import { OrderStatus, generateOrderNo } from '@/utils/orderStatus'
import { MoneyCalculator } from '@/utils/security'
import { useToast } from '@/composables/useToast'
import { useCart } from '@/composables/useCart'

const route = useRoute()
const toast = useToast()

const tableNo = computed(() => String(route.query.table || ''))
const dishes = ref<Dish[]>([])
const categories = ref<string[]>([])
const currentCategory = ref('')
const loading = ref(false)
const submitting = ref(false)
const currentOrder = ref<Order | null>(null)
const tableStatus = ref<TableStatus | null>(null)
const showCart = ref(false)
const guests = ref(1)
const tablewareDish = ref<Dish | null>(null)
const categoryRefs = ref<Record<string, HTMLElement>>({})

const categoryOrder = ['铁锅炖', '特色菜', '农家小炒', '凉菜', '特色豆腐', '主食', '酒水']

const categoryMeta: Record<string, { icon: string; gradient: string }> = {
  '铁锅炖': { icon: '🔥', gradient: 'from-red-500 to-orange-500' },
  '特色菜': { icon: '⭐', gradient: 'from-amber-500 to-yellow-500' },
  '农家小炒': { icon: '🥬', gradient: 'from-green-500 to-emerald-500' },
  '凉菜': { icon: '🥗', gradient: 'from-cyan-500 to-blue-500' },
  '特色豆腐': { icon: '🧈', gradient: 'from-yellow-400 to-orange-400' },
  '主食': { icon: '🍚', gradient: 'from-stone-400 to-stone-500' },
  '酒水': { icon: '🍺', gradient: 'from-indigo-500 to-purple-500' },
}

const DISH_RULES: Record<string, { add: string; qty: number }> = {
  '铁锅鱼': { add: '锅底', qty: 1 },
  '铁锅炖鱼': { add: '锅底', qty: 1 },
}

const {
  cart,
  cartMap,
  cartTotalQty,
  cartTotalAmount,
  addToCart,
  addExistingToCart,
  updateQty,
  setQty,
  updateRemark,
  clearCart,
} = useCart(dishes, DISH_RULES)

const filteredDishes = computed(() => {
  let list = dishes.value.filter((d) => d.category === currentCategory.value && d.category !== '餐具')
  if (currentCategory.value === '铁锅炖') {
    list = [...list].sort((a, b) => {
      if (a.name === '铁锅鱼') return -1
      if (b.name === '铁锅鱼') return 1
      return 0
    })
  }
  return list
})

const cutleryTotal = computed(() => {
  const price = tablewareDish.value ? tablewareDish.value.price : 0
  return price * guests.value
})

const existingItems = computed(() => {
  if (!currentOrder.value?.items) return []
  return currentOrder.value.items.map((it) => ({
    dishId: it.dishId,
    name: it.name,
    price: it.price,
    quantity: it.quantity,
    remark: it.remark || '',
    status: it.status,
  }))
})

const existingTotalAmount = computed(() => {
  return MoneyCalculator.calculate(existingItems.value.map((i) => ({ price: i.price, quantity: i.quantity })), 0).total
})

function setCategoryRef(el: unknown, cat: string) {
  if (el) {
    categoryRefs.value[cat] = el as HTMLElement
  } else {
    delete categoryRefs.value[cat]
  }
}

function scrollCategoryIntoView(cat: string) {
  nextTick(() => {
    const el = categoryRefs.value[cat]
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  })
}

onMounted(() => {
  if (!tableNo.value) {
    toast.error('无效的桌号')
    return
  }
  loadData()
})

async function loadData() {
  loading.value = true
  try {
    const [dishRes, ts] = await Promise.all([
      DishAPI.getDishes(),
      TableStatusAPI.getTableStatus(tableNo.value).catch(() => null),
    ])
    dishes.value = dishRes.items
    tablewareDish.value = dishRes.items.find((d) => d.category === '餐具') || null

    const cats = Array.from(new Set(dishRes.items.map((d) => d.category)))
    categories.value = cats
      .filter((c) => c !== '餐具')
      .sort((a, b) => {
        const ia = categoryOrder.indexOf(a)
        const ib = categoryOrder.indexOf(b)
        if (ia !== -1 && ib !== -1) return ia - ib
        if (ia !== -1) return -1
        if (ib !== -1) return 1
        return a.localeCompare(b)
      })
    if (categories.value.length > 0 && !currentCategory.value) {
      currentCategory.value = categories.value[0] || ''
    }

    tableStatus.value = ts
    if (ts?.currentOrderId) {
      const order = await PublicOrderAPI.getOrder(ts.currentOrderId).catch(() => null)
      if (order && order.status !== OrderStatus.COMPLETED && order.status !== OrderStatus.CANCELLED) {
        currentOrder.value = order
        guests.value = typeof order.guests === 'number' ? order.guests : 1
      }
    }
  } catch (err: unknown) {
    toast.error('加载失败: ' + (err instanceof Error ? err.message : '未知错误'))
  } finally {
    loading.value = false
  }
}

async function submitOrder() {
  if (cart.value.length === 0) {
    toast.error('请至少选择一道菜品')
    return
  }
  submitting.value = true
  try {
    const items: OrderItem[] = cart.value.map((item) => ({
      dishId: item.dishId,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      remark: item.remark,
      status: 'pending',
    }))

    if (currentOrder.value) {
      await PublicOrderAPI.appendOrderItems(currentOrder.value.id, items)
      toast.success('已追加到当前订单')
    } else {
      const { total, discount, final } = MoneyCalculator.calculateWithDiscount(
        items.map((i) => ({ price: i.price, quantity: i.quantity })),
        0,
        'amount',
      )

      const tablewarePrice = tablewareDish.value ? tablewareDish.value.price : 0
      const cutlery = tablewarePrice > 0
        ? {
            type: 'charged' as const,
            quantity: guests.value,
            unitPrice: tablewarePrice,
            totalPrice: tablewarePrice * guests.value,
          }
        : {
            type: 'free' as const,
            quantity: guests.value,
            unitPrice: 0,
            totalPrice: 0,
          }

      const orderData: Partial<Order> = {
        orderNo: generateOrderNo(),
        tableNo: tableNo.value,
        guests: guests.value,
        status: OrderStatus.PENDING,
        items,
        totalAmount: total + cutlery.totalPrice,
        discount,
        discountType: 'amount',
        discountValue: 0,
        finalAmount: final + cutlery.totalPrice,
        source: 'customer',
        cutlery,
      }
      const order = await PublicOrderAPI.createOrder(orderData)
      currentOrder.value = order

      // table_status 同步已由后端钩子自动处理
      toast.success('订单提交成功！')
    }
    clearCart()
    showCart.value = false
    await loadData()
  } catch (err: unknown) {
    toast.error('提交失败: ' + (err instanceof Error ? err.message : '未知错误'))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-[#f7f8fa] pb-24">
    <!-- Header -->
    <header class="relative overflow-hidden bg-gradient-to-br from-amber-500 via-orange-500 to-red-500 text-white">
      <div class="absolute inset-0 opacity-20">
        <svg class="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <path d="M0 100 C 20 0 50 0 100 100 Z" fill="white" />
        </svg>
      </div>
      <div class="relative px-4 pt-4 pb-5 text-center">
        <div class="inline-flex items-center justify-center rounded-full bg-white/20 px-3 py-1 text-[10px] backdrop-blur-sm">
          扫码自助点餐
        </div>
        <div class="mt-1.5 text-2xl font-extrabold tracking-tight">
          {{ tableNo || '-' }}<span class="text-base font-medium">号桌</span>
        </div>
      </div>
    </header>

    <!-- Info card -->
    <div class="-mt-5 mx-4">
      <div class="rounded-2xl bg-white p-4 shadow-lg shadow-orange-500/10">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-full bg-orange-50 text-xl">👥</div>
            <div>
              <div class="text-xs text-gray-500">用餐人数</div>
              <div class="text-sm font-semibold text-gray-900">{{ guests }} 人</div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button
              :disabled="!!currentOrder"
              class="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-700 transition active:scale-95 disabled:opacity-40"
              @click="guests = Math.max(1, guests - 1)"
            >
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 12h14" />
              </svg>
            </button>
            <span class="min-w-[1.5rem] text-center font-semibold text-gray-900">{{ guests }}</span>
            <button
              :disabled="!!currentOrder"
              class="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500 text-white shadow-md shadow-orange-500/30 transition active:scale-95 disabled:opacity-40"
              @click="guests++"
            >
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </div>
        </div>

        <!-- Existing order hint -->
        <div v-if="currentOrder" class="mt-3 flex items-center gap-2 rounded-xl bg-green-50 px-3 py-2 text-sm text-green-700">
          <span class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-white text-xs">✓</span>
          <span class="flex-1">当前已有订单，新菜品将追加到 <span class="font-medium">{{ currentOrder.orderNo }}</span></span>
        </div>
      </div>
    </div>

    <!-- Main two-column layout -->
    <div class="mt-4 flex h-[calc(100vh-210px)] gap-3 px-3">
      <!-- Left categories -->
      <div class="w-20 overflow-y-auto rounded-2xl bg-white py-2 shadow-sm">
        <button
          v-for="cat in categories"
          :key="cat"
          :ref="(el) => setCategoryRef(el, cat)"
          :class="[
            'flex w-full flex-col items-center justify-center gap-1 px-2 py-3 text-xs font-medium transition-all',
            currentCategory === cat
              ? 'text-orange-600'
              : 'text-gray-500 hover:text-gray-700',
          ]"
          @click="currentCategory = cat; scrollCategoryIntoView(cat)"
        >
          <span
            :class="[
              'flex h-10 w-10 items-center justify-center rounded-xl text-lg transition-all',
              currentCategory === cat
                ? 'bg-gradient-to-br ' + (categoryMeta[cat]?.gradient || 'from-gray-400 to-gray-500') + ' text-white shadow-md'
                : 'bg-gray-100',
            ]"
          >
            {{ categoryMeta[cat]?.icon || '🍽️' }}
          </span>
          <span :class="currentCategory === cat ? 'font-semibold' : ''">{{ cat }}</span>
        </button>
      </div>

      <!-- Right dishes -->
      <div class="flex-1 overflow-y-auto rounded-2xl pb-4">
        <div v-if="loading" class="space-y-3">
          <div v-for="i in 6" :key="i" class="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm">
            <div class="h-16 w-16 shrink-0 rounded-xl bg-gray-200 animate-pulse" />
            <div class="flex-1 space-y-2">
              <div class="h-4 w-1/3 rounded bg-gray-200 animate-pulse" />
              <div class="h-3 w-2/3 rounded bg-gray-200 animate-pulse" />
              <div class="h-4 w-16 rounded bg-gray-200 animate-pulse" />
            </div>
          </div>
        </div>

        <div v-else-if="filteredDishes.length === 0" class="flex h-full flex-col items-center justify-center text-gray-400">
          <div class="mb-2 text-4xl">🍽️</div>
          <div class="text-sm">该分类下暂无菜品</div>
        </div>

        <div v-else class="space-y-3">
          <div
            v-for="dish in filteredDishes"
            :key="dish.id"
            class="group relative flex items-center gap-3 overflow-hidden rounded-2xl bg-white p-3 shadow-sm transition-all active:scale-[0.99]"
          >
            <!-- Info -->
            <div class="min-w-0 flex-1 pl-1">
              <div class="flex items-start justify-between gap-2">
                <div class="truncate text-[15px] font-semibold text-gray-900">{{ dish.name }}</div>
                <div v-if="dish.name === '铁锅鱼'" class="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                  招牌
                </div>
              </div>
              <div v-if="dish.name === '铁锅鱼'" class="mt-0.5 text-xs text-amber-600">
                68元/斤，按实际称重计算金额
              </div>
              <div v-else-if="dish.description" class="mt-0.5 truncate text-xs text-gray-500">
                {{ dish.description }}
              </div>
              <div class="mt-1.5 flex items-center justify-between">
                <div class="text-base font-bold text-orange-600">{{ MoneyCalculator.format(dish.price) }}</div>
              </div>
            </div>

            <!-- Stepper -->
            <div class="shrink-0">
              <div v-if="cartMap.get(dish.id)" class="flex items-center gap-2">
                <button
                  class="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-sm transition active:scale-90 hover:bg-gray-50"
                  @click="updateQty(dish.id, -1)"
                >
                  <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M5 12h14" />
                  </svg>
                </button>
                <span class="min-w-[1.25rem] text-center text-sm font-semibold text-gray-900">
                  {{ cartMap.get(dish.id)?.quantity }}
                </span>
                <button
                  class="flex h-7 w-7 items-center justify-center rounded-full bg-orange-500 text-white shadow-md shadow-orange-500/30 transition active:scale-90 hover:bg-orange-600"
                  @click="addToCart(dish)"
                >
                  <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>
              </div>
              <button
                v-else
                class="flex h-8 items-center gap-1 rounded-full bg-orange-500 px-3 text-sm font-medium text-white shadow-md shadow-orange-500/30 transition active:scale-95 hover:bg-orange-600"
                @click="addToCart(dish)"
              >
                <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                选
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Bottom bar -->
    <div class="fixed bottom-0 left-0 right-0 z-20 px-4 pb-safe pt-2">
      <div class="flex items-center gap-3 rounded-2xl bg-gray-900 p-2 pl-4 text-white shadow-2xl shadow-gray-900/30">
        <div class="relative flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-gray-800" @click="showCart = true">
          <svg class="h-6 w-6 text-orange-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 6h15l-1.5 9h-12z" />
            <circle cx="9" cy="20" r="1.5" fill="currentColor" />
            <circle cx="18" cy="20" r="1.5" fill="currentColor" />
            <path d="M6 6L5 3H2" />
          </svg>
          <div
            v-if="cartTotalQty > 0"
            class="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold"
          >
            {{ cartTotalQty }}
          </div>
        </div>
        <div class="min-w-0 flex-1 cursor-pointer" @click="showCart = true">
          <div class="text-lg font-bold">
            {{ MoneyCalculator.format(cartTotalQty > 0 ? cartTotalAmount + cutleryTotal : 0) }}
          </div>
          <div class="text-[10px] text-gray-400">
            {{ cartTotalQty > 0 ? `已选 ${cartTotalQty} 件${cutleryTotal > 0 ? '，含餐具费' : tablewareDish ? '，免餐具费' : ''}` : (existingItems.length > 0 ? '已有订单，可继续加菜' : '购物车是空的') }}
          </div>
        </div>
        <button
          :disabled="cartTotalQty === 0 || submitting"
          class="shrink-0 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-orange-500/30 transition active:scale-95 disabled:opacity-40 disabled:active:scale-100"
          @click="showCart = true"
        >
          {{ submitting ? '提交中...' : '去结算' }}
        </button>
      </div>
    </div>

    <!-- Cart Modal -->
    <Transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="showCart"
        class="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm"
        @click.self="showCart = false"
      />
    </Transition>

    <Transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="translate-y-full"
      enter-to-class="translate-y-0"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="translate-y-0"
      leave-to-class="translate-y-full"
    >
      <div
        v-if="showCart"
        class="fixed bottom-0 left-0 right-0 z-30 max-h-[80vh] overflow-y-auto rounded-t-3xl bg-white shadow-2xl"
      >
        <!-- Drag handle -->
        <div class="sticky top-0 z-10 flex items-center justify-center bg-white pt-3 pb-1" @click="showCart = false">
          <div class="h-1.5 w-12 rounded-full bg-gray-300" />
        </div>

        <div class="px-5 pb-8 pt-2">
          <div class="mb-4 flex items-center justify-between">
            <h3 class="text-lg font-bold text-gray-900">已选菜品</h3>
            <button v-if="cart.length > 0" class="text-xs text-gray-500" @click="clearCart()">
              清空购物车
            </button>
          </div>

          <!-- Existing order items (read-only) -->
          <div v-if="existingItems.length > 0" class="mb-5">
            <div class="mb-2 flex items-center gap-2 text-xs font-medium text-gray-500">
              <span class="h-1.5 w-1.5 rounded-full bg-green-500" />
              已下单菜品
            </div>
            <div class="space-y-2">
              <div
                v-for="item in existingItems"
                :key="item.dishId + item.name"
                class="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2.5"
              >
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-medium text-gray-900">{{ item.name }}</span>
                    <span v-if="item.status === 'pending'" class="rounded bg-amber-100 px-1.5 py-0 text-[10px] text-amber-700">待做</span>
                    <span v-else-if="item.status === 'cooking'" class="rounded bg-blue-100 px-1.5 py-0 text-[10px] text-blue-700">制作中</span>
                    <span v-else-if="item.status === 'served'" class="rounded bg-green-100 px-1.5 py-0 text-[10px] text-green-700">已上菜</span>
                  </div>
                  <div class="text-xs text-gray-400">{{ MoneyCalculator.format(item.price) }}</div>
                  <div v-if="item.remark" class="mt-0.5 text-[10px] text-gray-400">备注：{{ item.remark }}</div>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium text-gray-700">x{{ item.quantity }}</span>
                  <button
                    class="flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-white shadow-sm transition active:scale-90"
                    @click="addExistingToCart(item)"
                  >
                    <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- New cart items -->
          <div v-if="cart.length === 0 && existingItems.length === 0" class="flex flex-col items-center py-10 text-gray-400">
            <div class="mb-2 text-4xl">🛒</div>
            <div class="text-sm">购物车是空的</div>
            <div class="mt-1 text-xs">快去挑选心仪的菜品吧～</div>
          </div>

          <div v-else-if="cart.length > 0" class="space-y-3">
            <div class="mb-2 flex items-center gap-2 text-xs font-medium text-gray-500">
              <span class="h-1.5 w-1.5 rounded-full bg-orange-500" />
              新加菜品
            </div>
            <div
              v-for="item in cart"
              :key="item.dishId"
              class="rounded-xl bg-gray-50 p-3"
            >
              <div class="flex items-center justify-between">
                <div class="min-w-0 flex-1">
                  <div class="text-sm font-medium text-gray-900">{{ item.name }}</div>
                  <div class="text-xs text-gray-500">{{ MoneyCalculator.format(item.price) }}</div>
                </div>
                <div class="flex items-center gap-2">
                  <button
                    class="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-sm transition active:scale-90"
                    @click="updateQty(item.dishId, -1)"
                  >
                    <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M5 12h14" />
                    </svg>
                  </button>
                  <input
                    :value="item.quantity"
                    type="number"
                    min="0"
                    class="h-7 w-12 rounded-lg border border-gray-200 bg-white px-1 text-center text-sm font-semibold text-gray-900 [-moz-appearance:textfield] focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    @blur="setQty(item.dishId, Number(($event.target as HTMLInputElement).value))"
                    @keydown.enter="($event.target as HTMLInputElement).blur()"
                  />
                  <button
                    class="flex h-7 w-7 items-center justify-center rounded-full bg-orange-500 text-white shadow-md shadow-orange-500/30 transition active:scale-90"
                    @click="updateQty(item.dishId, 1)"
                  >
                    <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </button>
                </div>
              </div>
              <input
                :value="item.remark || ''"
                type="text"
                placeholder="口味备注（如：少辣、不要葱）"
                class="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 placeholder-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                @input="updateRemark(item.dishId, ($event.target as HTMLInputElement).value)"
              />
            </div>

            <!-- 餐具费 -->
            <div v-if="tablewareDish" class="mt-2 rounded-xl p-3" :class="cutleryTotal > 0 ? 'bg-orange-50' : 'bg-green-50'">
              <div class="flex items-center justify-between">
                <div class="min-w-0 flex-1">
                  <div class="text-sm font-medium text-gray-900">🥢 餐具费</div>
                  <div v-if="cutleryTotal > 0" class="text-xs text-gray-500">{{ guests }}人 × {{ MoneyCalculator.format(tablewareDish.price) }}/人</div>
                  <div v-else class="text-xs text-gray-500">本店免餐具费</div>
                </div>
                <div class="text-sm font-semibold" :class="cutleryTotal > 0 ? 'text-gray-900' : 'text-green-600'">
                  {{ cutleryTotal > 0 ? MoneyCalculator.format(cutleryTotal) : '免费' }}
                </div>
              </div>
            </div>
          </div>

          <!-- Totals -->
          <div class="mt-5 space-y-2 border-t border-dashed border-gray-200 pt-4">
            <div v-if="existingTotalAmount > 0" class="flex items-center justify-between text-sm">
              <span class="text-gray-500">已下单</span>
              <span class="font-medium text-gray-700">{{ MoneyCalculator.format(existingTotalAmount) }}</span>
            </div>
            <div v-if="cartTotalAmount > 0" class="flex items-center justify-between text-sm">
              <span class="text-gray-500">新加菜品</span>
              <span class="font-medium text-gray-700">{{ MoneyCalculator.format(cartTotalAmount) }}</span>
            </div>
            <div v-if="tablewareDish" class="flex items-center justify-between text-sm">
              <span class="text-gray-500">餐具费（{{ guests }}人{{ cutleryTotal > 0 ? ' × ' + MoneyCalculator.format(tablewareDish.price) : '' }}）</span>
              <span class="font-medium" :class="cutleryTotal > 0 ? 'text-gray-700' : 'text-green-600'">
                {{ cutleryTotal > 0 ? MoneyCalculator.format(cutleryTotal) : '免费' }}
              </span>
            </div>
            <div class="flex items-center justify-between border-t border-gray-100 pt-2">
              <span class="text-base font-medium text-gray-900">合计</span>
              <span class="text-xl font-bold text-orange-600">{{ MoneyCalculator.format(existingTotalAmount + cartTotalAmount + cutleryTotal) }}</span>
            </div>
          </div>

          <button
            :disabled="submitting || cart.length === 0"
            class="mt-5 w-full rounded-xl bg-gradient-to-r from-orange-500 to-red-500 py-3.5 text-base font-semibold text-white shadow-lg shadow-orange-500/30 transition active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100"
            @click="submitOrder"
          >
            {{ submitting ? '提交中...' : (currentOrder ? '追加到订单' : '提交订单') }}
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.pb-safe {
  padding-bottom: max(env(safe-area-inset-bottom), 12px);
}
</style>
