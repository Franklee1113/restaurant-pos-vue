import { describe, it, expect, beforeEach } from 'vitest'
import { ref } from 'vue'
import { useCart, type DishLike } from '../useCart'

describe('useCart', () => {
  const dishes = ref<DishLike[]>([
    { id: 'd1', name: '铁锅鱼', price: 68 },
    { id: 'd2', name: '锅底', price: 28 },
    { id: 'd3', name: '凉拌黄瓜', price: 12 },
  ])

  const dishRules: Record<string, { add: string; qty: number }> = {
    铁锅鱼: { add: '锅底', qty: 1 },
  }

  beforeEach(() => {
    dishes.value = [
      { id: 'd1', name: '铁锅鱼', price: 68 },
      { id: 'd2', name: '锅底', price: 28 },
      { id: 'd3', name: '凉拌黄瓜', price: 12 },
    ]
  })

  it('should add dish to cart', () => {
    const { cart, cartTotalQty, addToCart } = useCart(dishes, dishRules)
    addToCart(dishes.value[2]!)
    expect(cart.value).toHaveLength(1)
    expect(cart.value[0]!).toMatchObject({ dishId: 'd3', name: '凉拌黄瓜', quantity: 1 })
    expect(cartTotalQty.value).toBe(1)
  })

  it('should increase quantity when adding same dish', () => {
    const { cart, addToCart } = useCart(dishes, dishRules)
    addToCart(dishes.value[2]!)
    addToCart(dishes.value[2]!)
    expect(cart.value).toHaveLength(1)
    expect(cart.value[0]!.quantity).toBe(2)
  })

  it('should auto-add associated dish by rule', () => {
    const { cart, addToCart } = useCart(dishes, dishRules)
    addToCart(dishes.value[0]!)
    expect(cart.value).toHaveLength(2)
    expect(cart.value[0]!).toMatchObject({ dishId: 'd1', name: '铁锅鱼', quantity: 1 })
    expect(cart.value[1]!).toMatchObject({ dishId: 'd2', name: '锅底', quantity: 1 })
  })

  it('should accumulate associated dish quantity', () => {
    const { cart, addToCart } = useCart(dishes, dishRules)
    addToCart(dishes.value[0]!)
    addToCart(dishes.value[0]!)
    expect(cart.value).toHaveLength(2)
    expect(cart.value[0]!.quantity).toBe(2)
    expect(cart.value[1]!.quantity).toBe(2)
  })

  it('should remove item when quantity drops to 0', () => {
    const { cart, addToCart, updateQty } = useCart(dishes, dishRules)
    addToCart(dishes.value[2]!)
    updateQty('d3', -1)
    expect(cart.value).toHaveLength(0)
  })

  it('should update quantity by delta', () => {
    const { cart, addToCart, updateQty } = useCart(dishes, dishRules)
    addToCart(dishes.value[2]!)
    updateQty('d3', 2)
    expect(cart.value[0]!.quantity).toBe(3)
  })

  it('should set quantity directly', () => {
    const { cart, addToCart, setQty } = useCart(dishes, dishRules)
    addToCart(dishes.value[2]!)
    setQty('d3', 5)
    expect(cart.value[0]!.quantity).toBe(5)
  })

  it('should remove item when setQty to 0', () => {
    const { cart, addToCart, setQty } = useCart(dishes, dishRules)
    addToCart(dishes.value[2]!)
    setQty('d3', 0)
    expect(cart.value).toHaveLength(0)
  })

  it('should handle negative setQty', () => {
    const { cart, addToCart, setQty } = useCart(dishes, dishRules)
    addToCart(dishes.value[2]!)
    setQty('d3', -1)
    expect(cart.value).toHaveLength(0)
  })

  it('should add existing item to cart', () => {
    const { cart, addExistingToCart } = useCart(dishes, dishRules)
    addExistingToCart({ dishId: 'd3', name: '凉拌黄瓜', price: 12 })
    expect(cart.value).toHaveLength(1)
    expect(cart.value[0]!.quantity).toBe(1)
  })

  it('should accumulate when adding existing item twice', () => {
    const { cart, addExistingToCart } = useCart(dishes, dishRules)
    addExistingToCart({ dishId: 'd3', name: '凉拌黄瓜', price: 12 })
    addExistingToCart({ dishId: 'd3', name: '凉拌黄瓜', price: 12 })
    expect(cart.value).toHaveLength(1)
    expect(cart.value[0]!.quantity).toBe(2)
  })

  it('should update remark', () => {
    const { cart, addToCart, updateRemark } = useCart(dishes, dishRules)
    addToCart(dishes.value[2]!)
    updateRemark('d3', '少辣')
    expect(cart.value[0]!.remark).toBe('少辣')
  })

  it('should clear cart', () => {
    const { cart, addToCart, clearCart } = useCart(dishes, dishRules)
    addToCart(dishes.value[0]!)
    addToCart(dishes.value[2]!)
    clearCart()
    expect(cart.value).toHaveLength(0)
  })

  it('should calculate cart total amount correctly', () => {
    const { cartTotalAmount, addToCart } = useCart(dishes, dishRules)
    addToCart(dishes.value[2]!)
    addToCart(dishes.value[2]!)
    expect(cartTotalAmount.value).toBeCloseTo(24, 2)
  })

  it('should expose cartMap for lookup', () => {
    const { cartMap, addToCart } = useCart(dishes, dishRules)
    addToCart(dishes.value[2]!)
    expect(cartMap.value.get('d3')?.quantity).toBe(1)
    expect(cartMap.value.has('d1')).toBe(false)
  })
})
