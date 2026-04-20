import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import DishActionSheet from '@/components/DishActionSheet.vue'

describe('DishActionSheet', () => {
  const mockDish = {
    id: 'd1',
    name: '铁锅鱼',
    price: 68,
    category: '海鲜',
    soldOut: false,
  }

  const mockSoldOutDish = {
    id: 'd1',
    name: '铁锅鱼',
    price: 68,
    category: '海鲜',
    soldOut: true,
    soldOutNote: '今日无货',
    soldOutAt: new Date().toISOString(),
  }

  function getWrapper(props: { open: boolean; dish: typeof mockDish | null }) {
    return mount(DishActionSheet, {
      props,
      global: {
        stubs: {
          Transition: { template: '<slot />' },
          Teleport: { template: '<slot />' },
        },
      },
    })
  }

  it('关闭状态下不渲染内容', () => {
    const wrapper = getWrapper({ open: false, dish: null })
    expect(wrapper.text()).not.toContain('铁锅鱼')
  })

  it('打开状态下渲染菜品信息和标记沽清按钮', () => {
    const wrapper = getWrapper({ open: true, dish: mockDish })
    expect(wrapper.text()).toContain('铁锅鱼')
    expect(wrapper.text()).toContain('¥68')
    expect(wrapper.text()).toContain('标记为"已沽清"')
  })

  it('已沽清菜品显示恢复售卖按钮', () => {
    const wrapper = getWrapper({ open: true, dish: mockSoldOutDish })
    expect(wrapper.text()).toContain('恢复售卖')
    expect(wrapper.text()).not.toContain('标记为"已沽清"')
  })

  it('点击遮罩层触发 close 事件', async () => {
    const wrapper = getWrapper({ open: true, dish: mockDish })
    const overlay = wrapper.find('.fixed.inset-0')
    expect(overlay.exists()).toBe(true)
    await overlay.trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('点击标记沽清按钮触发 mark-sold-out 事件', async () => {
    const wrapper = getWrapper({ open: true, dish: mockDish })
    const btn = wrapper.findAll('button').find((b) => b.text().includes('标记为'))
    expect(btn).toBeTruthy()
    await btn!.trigger('click')
    expect(wrapper.emitted('mark-sold-out')).toHaveLength(1)
  })

  it('点击恢复售卖按钮触发 mark-available 事件', async () => {
    const wrapper = getWrapper({ open: true, dish: mockSoldOutDish })
    const btn = wrapper.findAll('button').find((b) => b.text().includes('恢复售卖'))
    expect(btn).toBeTruthy()
    await btn!.trigger('click')
    expect(wrapper.emitted('mark-available')).toHaveLength(1)
  })

  it('点击取消按钮触发 close 事件', async () => {
    const wrapper = getWrapper({ open: true, dish: mockDish })
    const btn = wrapper.findAll('button').find((b) => b.text().trim() === '取消')
    expect(btn).toBeTruthy()
    await btn!.trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('点击内容区域不触发 close 事件', async () => {
    const wrapper = getWrapper({ open: true, dish: mockDish })
    const content = wrapper.find('.absolute.bottom-0')
    expect(content.exists()).toBe(true)
    await content.trigger('click')
    expect(wrapper.emitted('close')).toBeUndefined()
  })
})
