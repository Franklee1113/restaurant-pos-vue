<script setup lang="ts">
import { computed, watch } from 'vue'
import { CutleryType, type CutleryTypeValue } from '@/schemas/order.schema'

const props = defineProps<{
  guests: number
  modelType: CutleryTypeValue
  modelQty: number
}>()

const emit = defineEmits<{
  'update:modelType': [type: CutleryTypeValue]
  'update:modelQty': [qty: number]
}>()

const CUTLERY_UNIT_PRICE = 2

const cutleryType = computed({
  get: () => props.modelType,
  set: (val) => emit('update:modelType', val),
})

const cutleryQty = computed({
  get: () => props.modelQty,
  set: (val) => emit('update:modelQty', Math.max(0, val)),
})

const totalPrice = computed(() => {
  return cutleryType.value === CutleryType.CHARGED ? cutleryQty.value * CUTLERY_UNIT_PRICE : 0
})

let manualEdit = false

watch(() => props.guests, (newGuests) => {
  if (!manualEdit && newGuests > 0) {
    cutleryQty.value = newGuests
  }
})

watch(cutleryType, (newType) => {
  if (newType === CutleryType.FREE) {
    cutleryQty.value = props.guests
    manualEdit = false
  }
})

function onQtyChange(delta: number) {
  cutleryQty.value = cutleryQty.value + delta
  manualEdit = true
}

function onInputChange() {
  manualEdit = true
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-2">
      <label class="text-sm font-medium text-gray-700">餐具配置</label>
      <span class="text-xs text-gray-500">{{ cutleryQty }} 套 × {{ cutleryType === CutleryType.CHARGED ? `¥${CUTLERY_UNIT_PRICE}/套` : '免费' }}</span>
    </div>
    <div class="flex items-center gap-3">
      <!-- 餐具类型选择 -->
      <div class="flex bg-white rounded-lg p-1 border border-gray-200">
        <button
          :class="[
            'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
            cutleryType === CutleryType.CHARGED 
              ? 'bg-blue-500 text-white' 
              : 'text-gray-600 hover:bg-gray-100'
          ]"
          @click="cutleryType = CutleryType.CHARGED"
        >
          收费餐具 ¥{{ CUTLERY_UNIT_PRICE }}
        </button>
        <button
          :class="[
            'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
            cutleryType === CutleryType.FREE 
              ? 'bg-green-500 text-white' 
              : 'text-gray-600 hover:bg-gray-100'
          ]"
          @click="cutleryType = CutleryType.FREE"
        >
          免费餐具
        </button>
      </div>
      <!-- 数量输入 -->
      <div class="flex items-center gap-2">
        <span class="text-sm text-gray-600">数量:</span>
        <div class="flex items-center">
          <button 
            class="w-7 h-7 rounded-l border border-gray-300 bg-gray-100 text-gray-600 hover:bg-gray-200 flex items-center justify-center"
            @click="onQtyChange(-1)"
          >-</button>
          <input
            v-model.number="cutleryQty"
            type="number"
            min="0"
            class="w-14 h-7 border-y border-gray-300 text-center text-sm"
            @change="onInputChange"
          />
          <button 
            class="w-7 h-7 rounded-r border border-gray-300 bg-gray-100 text-gray-600 hover:bg-gray-200 flex items-center justify-center"
            @click="onQtyChange(1)"
          >+</button>
        </div>
      </div>
    </div>
    <p class="mt-2 text-xs text-gray-500">
      {{ cutleryType === CutleryType.CHARGED 
        ? `餐具费用: ¥${totalPrice.toFixed(2)} (默认按人数自动计算)` 
        : '使用免费餐具，不产生费用' }}
    </p>
  </div>
</template>
