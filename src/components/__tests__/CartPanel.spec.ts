import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CartPanel from '../CartPanel.vue'

describe('CartPanel', () => {
  const baseProps = {
    cart: [] as any[],
    discountType: 'amount' as const,
    discountValue: 0,
    dishesTotal: 0,
    cutleryTotal: 0,
    finalTotal: 0,
    isEdit: false,
    editingQtyId: null as string | null,
    editingQtyValue: 1,
    editingRemarkId: null as string | null,
    submitting: false,
  }

  function mountPanel(props = {}) {
    return mount(CartPanel, {
      props: { ...baseProps, ...props },
    })
  }

  it('should show empty hint when cart is empty', () => {
    const wrapper = mountPanel()
    expect(wrapper.text()).toContain('请从左侧选择菜品')
  })

  it('should render cart items', () => {
    const wrapper = mountPanel({
      cart: [
        { dishId: 'd1', name: '铁锅鱼', price: 68, quantity: 1 },
        { dishId: 'd2', name: '锅底', price: 28, quantity: 2, remark: '少辣', isAuto: true },
      ],
      dishesTotal: 96,
      finalTotal: 96,
    })
    expect(wrapper.text()).toContain('铁锅鱼')
    expect(wrapper.text()).toContain('锅底')
    expect(wrapper.text()).toContain('少辣')
    expect(wrapper.text()).toContain('配套')
  })

  it('should emit qtyChange when clicking +/-', async () => {
    const wrapper = mountPanel({
      cart: [{ dishId: 'd1', name: '铁锅鱼', price: 68, quantity: 1 }],
      dishesTotal: 68,
      finalTotal: 68,
    })
    const buttons = wrapper.findAll('button')
    // 第一个 - 按钮
    await buttons[0]!.trigger('click')
    expect(wrapper.emitted('qtyChange')).toHaveLength(1)
    expect(wrapper.emitted('qtyChange')![0]).toEqual(['d1', -0.5])

    // + 按钮
    await buttons[1]!.trigger('click')
    expect(wrapper.emitted('qtyChange')).toHaveLength(2)
    expect(wrapper.emitted('qtyChange')![1]).toEqual(['d1', 0.5])
  })

  it('should emit editQty when clicking quantity', async () => {
    const wrapper = mountPanel({
      cart: [{ dishId: 'd1', name: '铁锅鱼', price: 68, quantity: 1 }],
      dishesTotal: 68,
      finalTotal: 68,
    })
    const qtyDiv = wrapper.find('.cursor-pointer')
    await qtyDiv.trigger('click')
    expect(wrapper.emitted('editQty')).toHaveLength(1)
    expect(wrapper.emitted('editQty')![0]).toEqual(['d1'])
  })

  it('should show input and emit confirmQty when editing quantity', async () => {
    const wrapper = mountPanel({
      cart: [{ dishId: 'd1', name: '铁锅鱼', price: 68, quantity: 1 }],
      dishesTotal: 68,
      finalTotal: 68,
      editingQtyId: 'd1',
      editingQtyValue: 2,
    })
    const input = wrapper.find('input[type="number"]')
    expect(input.exists()).toBe(true)
    await input.setValue(3)
    await input.trigger('blur')
    expect(wrapper.emitted('update:editingQtyValue')).toHaveLength(1)
    expect(wrapper.emitted('confirmQty')).toHaveLength(1)
  })

  it('should emit remove when clicking delete button', async () => {
    const wrapper = mountPanel({
      cart: [{ dishId: 'd1', name: '铁锅鱼', price: 68, quantity: 1 }],
      dishesTotal: 68,
      finalTotal: 68,
    })
    const removeBtn = wrapper.find('button.bg-red-50')
    expect(removeBtn.exists()).toBe(true)
    await removeBtn.trigger('click')
    expect(wrapper.emitted('remove')).toHaveLength(1)
    expect(wrapper.emitted('remove')![0]).toEqual(['d1'])
  })

  it('should emit editRemark when clicking +备注', async () => {
    const wrapper = mountPanel({
      cart: [{ dishId: 'd1', name: '铁锅鱼', price: 68, quantity: 1 }],
      dishesTotal: 68,
      finalTotal: 68,
    })
    const btn = wrapper.findAll('button').find((b) => b.text().includes('+备注'))
    expect(btn).toBeDefined()
    await btn!.trigger('click')
    expect(wrapper.emitted('editRemark')).toHaveLength(1)
    expect(wrapper.emitted('editRemark')![0]).toEqual(['d1'])
  })

  it('should show remark input when editing remark', () => {
    const wrapper = mountPanel({
      cart: [{ dishId: 'd1', name: '铁锅鱼', price: 68, quantity: 1, remark: '少辣' }],
      dishesTotal: 68,
      finalTotal: 68,
      editingRemarkId: 'd1',
    })
    const input = wrapper.find('input[placeholder="口味备注"]')
    expect(input.exists()).toBe(true)
    expect((input.element as HTMLInputElement).value).toBe('少辣')
  })

  it('should emit updateRemark on input', async () => {
    const wrapper = mountPanel({
      cart: [{ dishId: 'd1', name: '铁锅鱼', price: 68, quantity: 1 }],
      dishesTotal: 68,
      finalTotal: 68,
      editingRemarkId: 'd1',
    })
    const input = wrapper.find('input[placeholder="口味备注"]')
    await input.setValue('不要葱')
    expect(wrapper.emitted('updateRemark')).toHaveLength(1)
    expect(wrapper.emitted('updateRemark')![0]).toEqual(['d1', '不要葱'])
  })

  it('should emit blurRemark on input blur', async () => {
    const wrapper = mountPanel({
      cart: [{ dishId: 'd1', name: '铁锅鱼', price: 68, quantity: 1 }],
      dishesTotal: 68,
      finalTotal: 68,
      editingRemarkId: 'd1',
    })
    const input = wrapper.find('input[placeholder="口味备注"]')
    await input.trigger('blur')
    expect(wrapper.emitted('blurRemark')).toHaveLength(1)
  })

  it('should emit discount type change', async () => {
    const wrapper = mountPanel({
      cart: [{ dishId: 'd1', name: '铁锅鱼', price: 68, quantity: 1 }],
      dishesTotal: 68,
      finalTotal: 68,
    })
    const select = wrapper.find('select')
    await select.setValue('percent')
    const emitted = wrapper.emitted('update:discountType')
    expect(emitted).toBeDefined()
    expect(emitted!.length).toBeGreaterThanOrEqual(1)
    expect(emitted![emitted!.length - 1]).toEqual(['percent'])
    expect(wrapper.emitted('discountTypeChange')).toHaveLength(1)
  })

  it('should emit submit when clicking submit button', async () => {
    const wrapper = mountPanel({
      cart: [{ dishId: 'd1', name: '铁锅鱼', price: 68, quantity: 1 }],
      dishesTotal: 68,
      finalTotal: 68,
    })
    const submitBtn = wrapper.findAll('button').find((b) => b.text().includes('提交订单'))
    expect(submitBtn).toBeDefined()
    await submitBtn!.trigger('click')
    expect(wrapper.emitted('submit')).toHaveLength(1)
  })

  it('should show save button in edit mode', () => {
    const wrapper = mountPanel({
      cart: [{ dishId: 'd1', name: '铁锅鱼', price: 68, quantity: 1 }],
      dishesTotal: 68,
      finalTotal: 68,
      isEdit: true,
    })
    expect(wrapper.text()).toContain('保存修改')
  })

  it('should disable submit when cart is empty', () => {
    const wrapper = mountPanel()
    const btn = wrapper.find('button.bg-blue-600')
    expect(btn.attributes('disabled')).toBeDefined()
  })

  it('should disable submit when submitting', () => {
    const wrapper = mountPanel({
      cart: [{ dishId: 'd1', name: '铁锅鱼', price: 68, quantity: 1 }],
      dishesTotal: 68,
      finalTotal: 68,
      submitting: true,
    })
    const btn = wrapper.find('button.bg-blue-600')
    expect(btn.attributes('disabled')).toBeDefined()
    expect(btn.text()).toContain('保存中...')
  })

  it('should show cutlery total when > 0', () => {
    const wrapper = mountPanel({
      cart: [{ dishId: 'd1', name: '铁锅鱼', price: 68, quantity: 1 }],
      dishesTotal: 68,
      cutleryTotal: 8,
      finalTotal: 76,
    })
    expect(wrapper.text()).toContain('餐具费')
  })

  it('should not show cutlery total when 0', () => {
    const wrapper = mountPanel({
      cart: [{ dishId: 'd1', name: '铁锅鱼', price: 68, quantity: 1 }],
      dishesTotal: 68,
      cutleryTotal: 0,
      finalTotal: 68,
    })
    expect(wrapper.text()).not.toContain('餐具费')
  })
})
