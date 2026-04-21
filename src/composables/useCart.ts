import { ref, computed, type Ref } from 'vue'
import { MoneyCalculator } from '@/utils/security'
import { useToast } from '@/composables/useToast'

export interface CartItem {
  dishId: string
  name: string
  price: number
  quantity: number
  remark?: string
}

export interface DishLike {
  id: string
  name: string
  price: number
  soldOut?: boolean
}

export interface DishRule {
  add: string
  qty: number
}

export function useCart(dishes: Ref<DishLike[]>, dishRules: Record<string, DishRule> = {}) {
  const cart = ref<CartItem[]>([])
  const toast = useToast()

  const cartMap = computed(() => {
    const map = new Map<string, CartItem>()
    for (const item of cart.value) {
      map.set(item.dishId, item)
    }
    return map
  })

  const cartTotalQty = computed(() => cart.value.reduce((sum, i) => sum + i.quantity, 0))

  const cartTotalAmount = computed(() => {
    return MoneyCalculator.calculate(cart.value.map((i) => ({ price: i.price, quantity: i.quantity })), 0).total
  })

  function addToCart(dish: DishLike) {
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

    const rule = dishRules[dish.name]
    if (rule) {
      const addDish = dishes.value.find((d) => d.name === rule.add)
      if (addDish) {
        if (addDish.soldOut) {
          toast.warning(`配菜 "${rule.add}" 已沽清，无法自动添加`)
        } else {
          const addExisting = cart.value.find((i) => i.dishId === addDish.id)
          if (addExisting) {
            addExisting.quantity = Math.round((addExisting.quantity + rule.qty) * 10) / 10
          } else {
            cart.value.push({ dishId: addDish.id, name: addDish.name, price: addDish.price, quantity: rule.qty, remark: '' })
          }
        }
      }
    }
  }

  function addExistingToCart(item: { dishId: string; name: string; price: number }) {
    const existing = cart.value.find((i) => i.dishId === item.dishId)
    if (existing) {
      existing.quantity = Math.round((existing.quantity + 1) * 10) / 10
    } else {
      cart.value.push({ dishId: item.dishId, name: item.name, price: item.price, quantity: 1, remark: '' })
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

  function setQty(dishId: string, qty: number) {
    const item = cart.value.find((i) => i.dishId === dishId)
    if (!item) return
    const newQty = Math.max(0, Math.round(qty * 10) / 10)
    if (newQty <= 0) {
      removeFromCart(dishId)
    } else {
      item.quantity = newQty
    }
  }

  function updateRemark(dishId: string, value: string) {
    const item = cart.value.find((i) => i.dishId === dishId)
    if (item) item.remark = value
  }

  function clearCart() {
    cart.value = []
  }

  return {
    cart,
    cartMap,
    cartTotalQty,
    cartTotalAmount,
    addToCart,
    addExistingToCart,
    removeFromCart,
    updateQty,
    setQty,
    updateRemark,
    clearCart,
  }
}
