<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { MoneyCalculator } from '@/utils/security'

interface CartItem {
  dishId: string
  name: string
  price: number
  quantity: number
  remark?: string
  isAuto?: boolean
}

const props = defineProps<{
  cart: CartItem[]
  discountType: 'amount' | 'percent'
  discountValue: number
  dishesTotal: number
  cutleryTotal: number
  finalTotal: number
  isEdit: boolean
  editingQtyId: string | null
  editingQtyValue: number
  editingRemarkId: string | null
  submitting?: boolean
}>()

const emit = defineEmits<{
  'update:discountType': [type: 'amount' | 'percent']
  'update:discountValue': [value: number]
  'update:editingQtyValue': [value: number]
  'qtyChange': [dishId: string, delta: number]
  'editQty': [dishId: string]
  'confirmQty': []
  'editRemark': [dishId: string]
  'blurRemark': []
  'updateRemark': [dishId: string, value: string]
  'remove': [dishId: string]
  'submit': []
  'discountTypeChange': []
}>()

const canSubmit = computed(() => props.cart.length > 0)
const localEditingQtyValue = ref(props.editingQtyValue)

watch(() => props.editingQtyValue, (v) => {
  localEditingQtyValue.value = v
})

function onConfirmQty() {
  emit('update:editingQtyValue', localEditingQtyValue.value)
  emit('confirmQty')
}

const discountTypeModel = computed({
  get: () => props.discountType,
  set: (val) => emit('update:discountType', val),
})

const discountValueModel = computed({
  get: () => props.discountValue,
  set: (val) => emit('update:discountValue', val),
})
</script>

<template>
  <div class="bg-white rounded-lg shadow p-4 h-fit sticky top-5">
    <h3 class="text-base font-bold text-gray-800 mb-3 pb-2 border-b">购物车</h3>

    <div v-if="cart.length === 0" class="text-center text-gray-400 py-6 text-sm">请从左侧选择菜品</div>
    <div v-else class="max-h-[46vh] overflow-y-auto pr-0.5">
      <div
        v-for="item in cart"
        :key="item.dishId"
        class="py-2 border-b border-gray-100 last:border-0"
      >
        <!-- 第一行：名称 + 数量/备注/金额/删除 -->
        <div class="flex items-center gap-2">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1">
              <div class="text-sm text-gray-800 truncate leading-tight">{{ item.name }}</div>
              <span v-if="item.isAuto" class="text-[10px] px-1 py-0 bg-amber-100 text-amber-700 rounded">配套</span>
            </div>
            <div class="text-[11px] text-gray-400 leading-tight mt-0.5">{{ MoneyCalculator.format(item.price) }}</div>
          </div>

          <div class="flex items-center gap-1">
            <button class="w-6 h-6 rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 text-xs leading-none" @click="emit('qtyChange', item.dishId, -0.5)">-</button>
            <div v-if="editingQtyId === item.dishId">
              <input
                v-model.number="localEditingQtyValue"
                type="number"
                min="0.5"
                step="0.5"
                class="w-11 px-0.5 py-0.5 border border-blue-400 rounded text-xs text-center"
                @blur="onConfirmQty"
                @keyup.enter="onConfirmQty"
              />
            </div>
            <div
              v-else
              class="min-w-[30px] text-center text-xs font-semibold cursor-pointer bg-gray-50 rounded px-1 py-0.5"
              @click="emit('editQty', item.dishId)"
            >
              {{ item.quantity }}
            </div>
            <button class="w-6 h-6 rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 text-xs leading-none" @click="emit('qtyChange', item.dishId, 0.5)">+</button>

            <!-- 备注按钮，紧挨数量 -->
            <button
              v-if="editingRemarkId !== item.dishId"
              class="ml-1 text-[11px] text-blue-600 hover:text-blue-800 px-1 py-0.5 rounded hover:bg-blue-50 border border-transparent"
              :class="item.remark ? 'bg-blue-50 border-blue-100' : ''"
              @click="emit('editRemark', item.dishId)"
            >
              {{ item.remark ? '改备注' : '+备注' }}
            </button>
          </div>

          <div class="w-12 text-right text-sm font-medium text-red-500 leading-none">
            {{ MoneyCalculator.format(MoneyCalculator.calculate([item], 0).final) }}
          </div>
          <button class="w-6 h-6 rounded bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center text-sm leading-none" @click="emit('remove', item.dishId)">×</button>
        </div>

        <!-- 仅编辑备注时展开一行输入 -->
        <div v-if="editingRemarkId === item.dishId" class="mt-1.5 flex items-center gap-1">
          <input
            :value="item.remark || ''"
            type="text"
            placeholder="口味备注"
            class="flex-1 px-2 py-1 text-xs border border-blue-400 rounded"
            @input="emit('updateRemark', item.dishId, ($event.target as HTMLInputElement).value)"
            @blur="emit('blurRemark')"
            @keyup.enter="emit('blurRemark')"
          />
        </div>

        <!-- 有备注时以标签形式显示在行下（紧凑） -->
        <div v-else-if="item.remark" class="mt-1 inline-flex items-center gap-1 text-[11px] text-gray-600 bg-gray-100 rounded px-1.5 py-0.5">
          <span>备注: {{ item.remark }}</span>
        </div>
      </div>
    </div>

    <div class="border-t mt-3 pt-3 space-y-2">
      <div class="flex justify-between items-center text-sm">
        <span class="text-gray-500">菜品金额</span>
        <span class="font-semibold text-gray-800">{{ MoneyCalculator.format(dishesTotal) }}</span>
      </div>
      <div v-if="cutleryTotal > 0" class="flex justify-between items-center text-sm">
        <span class="text-gray-500">餐具费</span>
        <span class="font-semibold text-gray-800">{{ MoneyCalculator.format(cutleryTotal) }}</span>
      </div>
      <div class="flex justify-between items-center text-sm">
        <span class="text-gray-500">折扣</span>
        <div class="flex items-center gap-1.5">
          <select v-model="discountTypeModel" class="px-1.5 py-1 border border-gray-300 rounded text-xs" @change="emit('discountTypeChange')">
            <option value="amount">金额减免</option>
            <option value="percent">百分比</option>
          </select>
          <input v-model.number="discountValueModel" type="number" min="0" :step="discountTypeModel === 'percent' ? 0.1 : 0.01" class="w-[68px] px-1.5 py-1 border border-gray-300 rounded text-xs text-right" />
          <span class="text-xs text-gray-500 w-4">{{ discountTypeModel === 'percent' ? '折' : '元' }}</span>
        </div>
      </div>
      <div class="flex justify-between items-center pt-2 border-t border-dashed">
        <span class="font-semibold text-gray-800">实付金额</span>
        <span class="text-xl font-bold text-red-500">{{ MoneyCalculator.format(finalTotal) }}</span>
      </div>
    </div>

    <button
      :disabled="!canSubmit || submitting"
      class="w-full mt-4 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
      @click="emit('submit')"
    >
      {{ submitting ? '保存中...' : (isEdit ? '保存修改' : '提交订单') }}
    </button>
  </div>
</template>
