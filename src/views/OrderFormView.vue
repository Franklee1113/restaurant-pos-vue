<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { OrderAPI, DishAPI, type Order, type Dish } from '@/api/pocketbase'
import { useSettingsStore } from '@/stores/settings.store'
import { OrderStatus, generateOrderNo } from '@/utils/orderStatus'
import { MoneyCalculator, Validators } from '@/utils/security'

const route = useRoute()
const router = useRouter()
const settingsStore = useSettingsStore()

const isEdit = computed(() => route.name === 'editOrder')
const orderId = computed(() => route.params.orderId as string)

const dishes = ref<Dish[]>([])
const loading = ref(false)
const currentCategory = ref('')
const tableNo = ref('')
const guests = ref(4)
const discountType = ref<'amount' | 'percent'>('amount')
const discountValue = ref(0)
const cart = ref<Array<{ dishId: string; name: string; price: number; quantity: number }>>([])

const DISH_RULES: Record<string, { add: string; qty: number }> = {
  '铁锅鱼': { add: '锅底', qty: 1 },
  '铁锅炖鱼': { add: '锅底', qty: 1 },
}

const hotDishes: Record<string, number> = {
  '铁锅鱼': 1,
  '锅底': 2,
  '铁锅鸡': 3,
  '铁锅排骨': 4,
  '铁锅炖鱼': 5,
}

const filteredDishes = computed(() => {
  let list = [...dishes.value].sort((a, b) => {
    const wa = hotDishes[a.name] || 100
    const wb = hotDishes[b.name] || 100
    return wa - wb
  })
  if (currentCategory.value) {
    list = list.filter((d) => d.category === currentCategory.value)
  }
  return list
})

const cartSummary = computed(() => {
  return MoneyCalculator.calculateWithDiscount(cart.value, discountValue.value, discountType.value)
})

onMounted(() => {
  loadData()
})

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
      discountType.value = (order.discountType as any) || 'amount'
      discountValue.value = order.discountValue || 0
      cart.value = (order.items || []).map((item) => ({
        dishId: item.dishId,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
      }))
    }
  } catch (err: any) {
    alert('加载数据失败: ' + err.message)
  } finally {
    loading.value = false
  }
}

function addToCart(dish: Dish) {
  const existing = cart.value.find((i) => i.dishId === dish.id)
  if (existing) {
    existing.quantity = Math.round((existing.quantity + 1) * 10) / 10
  } else {
    cart.value.push({ dishId: dish.id, name: dish.name, price: dish.price, quantity: 1 })
  }

  // 自动加锅底
  const rule = DISH_RULES[dish.name]
  if (rule) {
    const existingAddOn = cart.value.find((i) => i.name === rule.add)
    if (!existingAddOn) {
      const addOn = dishes.value.find((d) => d.name === rule.add)
      if (addOn) {
        cart.value.push({ dishId: addOn.id, name: addOn.name, price: addOn.price, quantity: rule.qty })
        alert(`已自动添加 ${rule.add} ${rule.qty}份`)
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

function setQty(dishId: string) {
  const item = cart.value.find((i) => i.dishId === dishId)
  if (!item) return
  const raw = prompt('输入数量:', String(item.quantity))
  if (raw === null) return
  const val = parseFloat(raw)
  if (isNaN(val) || val <= 0) {
    removeFromCart(dishId)
    return
  }
  if (!Validators.quantity(val)) {
    alert('数量不合法')
    return
  }
  item.quantity = Math.round(val * 10) / 10
}

function onDiscountTypeChange() {
  if (discountType.value === 'percent') {
    if (discountValue.value > 10) discountValue.value = 8
  }
}

async function submit() {
  if (!tableNo.value) {
    alert('请选择桌号')
    return
  }
  if (!Validators.quantity(guests.value)) {
    alert('用餐人数不合法')
    return
  }
  if (discountType.value === 'amount') {
    if (!Validators.amount(discountValue.value)) {
      alert('折扣金额不合法')
      return
    }
  } else {
    if (discountValue.value <= 0 || discountValue.value > 10) {
      alert('折扣比例应在0.1-10之间，如8代表8折')
      return
    }
  }
  if (cart.value.length === 0) {
    alert('请至少选择一道菜品')
    return
  }

  const { total, final, discount } = MoneyCalculator.calculateWithDiscount(
    cart.value,
    discountValue.value,
    discountType.value,
  )

  if (!Validators.amount(total) || !Validators.amount(final)) {
    alert('订单金额异常，请检查')
    return
  }

  const orderData: Partial<Order> = {
    tableNo: Validators.sanitizeString(tableNo.value, 50),
    guests: guests.value,
    items: cart.value.map((item) => ({
      dishId: item.dishId,
      name: Validators.sanitizeString(item.name, 100),
      price: item.price,
      quantity: item.quantity,
    })),
    totalAmount: total,
    discount,
    discountType: discountType.value,
    discountValue: discountValue.value,
    finalAmount: final,
  }

  try {
    if (isEdit.value && orderId.value) {
      await OrderAPI.updateOrder(orderId.value, orderData)
      alert('订单修改成功!')
      router.push({ name: 'orderList' })
    } else {
      orderData.orderNo = generateOrderNo()
      orderData.status = OrderStatus.PENDING
      await OrderAPI.createOrder(orderData)
      alert('订单创建成功!')
      cart.value = []
      router.push({ name: 'orderList' })
    }
  } catch (err: any) {
    alert((isEdit.value ? '保存' : '创建') + '失败: ' + err.message)
  }
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-xl font-bold text-gray-800">{{ isEdit ? '编辑订单' : '新建订单' }}</h2>
      <button class="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200" @click="router.back()">
        ← 返回
      </button>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-5">
      <!-- Left: Dish Selection -->
      <div class="bg-white rounded-lg shadow p-4">
        <!-- Table & Guests -->
        <div class="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label class="block text-sm font-medium text-gray-600 mb-1">选择桌号</label>
            <select v-model="tableNo" class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
              <option value="">请选择桌号</option>
              <option v-for="t in settingsStore.tableNumbers" :key="t" :value="t">{{ t }}</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-600 mb-1">人数</label>
            <input v-model.number="guests" type="number" min="1" class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-center" />
          </div>
        </div>

        <!-- Edit mode status -->
        <div v-if="isEdit" class="mb-4">
          <label class="block text-sm font-medium text-gray-600 mb-1">订单状态</label>
          <div class="text-sm text-gray-500">[状态请在详情页修改]</div>
        </div>

        <!-- Categories -->
        <div class="flex gap-2 overflow-x-auto pb-2 mb-4 border-b border-gray-100">
          <button
            :class="[
              'px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0',
              currentCategory === '' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
            ]"
            @click="currentCategory = ''"
          >
            全部
          </button>
          <button
            v-for="cat in settingsStore.categories"
            :key="cat"
            :class="[
              'px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0',
              currentCategory === cat ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
            ]"
            @click="currentCategory = cat"
          >
            {{ cat }}
          </button>
        </div>

        <!-- Dishes Grid -->
        <div v-if="loading" class="text-center text-gray-500 py-8">加载中...</div>
        <div v-else-if="filteredDishes.length === 0" class="text-center text-gray-500 py-8">暂无菜品</div>
        <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
          <div
            v-for="dish in filteredDishes"
            :key="dish.id"
            class="bg-gray-50 rounded-lg p-3 text-center hover:shadow-md hover:-translate-y-0.5 transition-all border border-transparent hover:border-blue-400"
          >
            <div class="font-semibold text-gray-800 text-sm truncate mb-1">{{ dish.name }}</div>
            <div class="text-red-500 font-bold text-base mb-2">{{ MoneyCalculator.format(dish.price) }}</div>
            <button class="w-full py-1 px-3 bg-blue-500 text-white text-xs rounded-full hover:bg-blue-600" @click="addToCart(dish)">
              + 添加
            </button>
          </div>
        </div>
      </div>

      <!-- Right: Cart -->
      <div class="bg-white rounded-lg shadow p-5 h-fit sticky top-5">
        <h3 class="text-lg font-bold text-gray-800 mb-4 pb-3 border-b">购物车</h3>

        <div v-if="cart.length === 0" class="text-center text-gray-400 py-8">请从左侧选择菜品</div>
        <div v-else class="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
          <div
            v-for="item in cart"
            :key="item.dishId"
            class="flex items-center justify-between gap-2 py-2 border-b border-gray-50 last:border-0"
          >
            <div class="flex-1 min-w-0">
              <div class="font-medium text-sm text-gray-800 truncate">{{ item.name }}</div>
              <div class="text-xs text-gray-400">{{ MoneyCalculator.format(item.price) }}</div>
            </div>
            <div class="flex items-center gap-1">
              <button class="w-7 h-7 rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50" @click="updateQty(item.dishId, -0.5)">-</button>
              <div class="min-w-[40px] text-center text-sm font-semibold cursor-pointer bg-gray-50 rounded px-2 py-1" @click="setQty(item.dishId)">{{ item.quantity }}</div>
              <button class="w-7 h-7 rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50" @click="updateQty(item.dishId, 0.5)">+</button>
            </div>
            <div class="w-16 text-right text-sm font-medium text-red-500">
              {{ MoneyCalculator.format(MoneyCalculator.calculate([item], 0).final) }}
            </div>
            <button class="w-7 h-7 rounded bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center" @click="removeFromCart(item.dishId)">×</button>
          </div>
        </div>

        <div class="border-t mt-4 pt-4 space-y-3">
          <div class="flex justify-between items-center text-sm">
            <span class="text-gray-500">菜品金额</span>
            <span class="font-semibold text-gray-800">{{ MoneyCalculator.format(cartSummary.total) }}</span>
          </div>
          <div class="flex justify-between items-center text-sm">
            <span class="text-gray-500">折扣</span>
            <div class="flex items-center gap-2">
              <select v-model="discountType" class="px-2 py-1 border border-gray-300 rounded text-xs" @change="onDiscountTypeChange">
                <option value="amount">金额减免</option>
                <option value="percent">百分比</option>
              </select>
              <input v-model.number="discountValue" type="number" min="0" :step="discountType === 'percent' ? 0.1 : 0.01" class="w-20 px-2 py-1 border border-gray-300 rounded text-xs text-right" />
              <span class="text-xs text-gray-500 w-4">{{ discountType === 'percent' ? '折' : '元' }}</span>
            </div>
          </div>
          <div class="flex justify-between items-center pt-3 border-t border-dashed">
            <span class="font-semibold text-gray-800">实付金额</span>
            <span class="text-2xl font-bold text-red-500">{{ MoneyCalculator.format(cartSummary.final) }}</span>
          </div>
        </div>

        <button
          :disabled="cart.length === 0"
          class="w-full mt-5 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          @click="submit"
        >
          {{ isEdit ? '保存修改' : '提交订单' }}
        </button>
      </div>
    </div>
  </div>
</template>
