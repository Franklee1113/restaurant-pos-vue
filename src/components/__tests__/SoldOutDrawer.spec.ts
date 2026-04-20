import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import SoldOutDrawer from '@/components/SoldOutDrawer.vue'

describe('SoldOutDrawer', () => {
  const mockDishes = [
    { id: 'd1', name: '铁锅鱼', category: '海鲜', price: 68, soldOut: true, soldOutNote: '今日无货' },
    { id: 'd2', name: '红烧肉', category: '热菜', price: 58, soldOut: false },
    { id: 'd3', name: '清蒸虾', category: '海鲜', price: 88, soldOut: true },
    { id: 'd4', name: '炒青菜', category: '素菜', price: 22, soldOut: false },
  ]

  function getWrapper(props: { open: boolean; dishes: typeof mockDishes }) {
    return mount(SoldOutDrawer, {
      props,
      global: {
        stubs: {
          Transition: { template: '<slot />' },
          Teleport: { template: '<slot />' },
        },
      },
    })
  }

  it('关闭状态下不渲染', () => {
    const wrapper = getWrapper({ open: false, dishes: [] })
    expect(wrapper.find('.fixed').exists()).toBe(false)
  })

  it('打开状态下渲染标题和菜品列表', () => {
    const wrapper = getWrapper({ open: true, dishes: mockDishes })
    expect(wrapper.text()).toContain('今日沽清')
    expect(wrapper.text()).toContain('当前 2 道菜品已沽清')
    expect(wrapper.text()).toContain('铁锅鱼')
    expect(wrapper.text()).toContain('红烧肉')
  })

  it('可售菜品显示"标记"按钮', () => {
    const wrapper = getWrapper({ open: true, dishes: mockDishes })
    expect(wrapper.text()).toContain('标记')
    expect(wrapper.text()).toContain('恢复')
  })

  it('点击标记按钮触发 toggle 事件', async () => {
    const wrapper = getWrapper({ open: true, dishes: mockDishes })
    // 找到红烧肉所在行的标记按钮
    const rows = wrapper.findAll('.flex.items-center.justify-between')
    const redRow = rows.find((r) => r.text().includes('红烧肉'))
    expect(redRow).toBeTruthy()
    const btn = redRow!.findAll('button').find((b) => b.text().trim() === '标记')
    expect(btn).toBeTruthy()
    await btn!.trigger('click')
    expect(wrapper.emitted('toggle')).toHaveLength(1)
    expect(wrapper.emitted('toggle')![0]).toEqual(['d2', true])
  })

  it('点击恢复按钮触发 toggle 事件', async () => {
    const wrapper = getWrapper({ open: true, dishes: mockDishes })
    // 找到铁锅鱼所在行的恢复按钮
    const rows = wrapper.findAll('.flex.items-center.justify-between')
    const fishRow = rows.find((r) => r.text().includes('铁锅鱼'))
    expect(fishRow).toBeTruthy()
    const btn = fishRow!.findAll('button').find((b) => b.text().trim() === '恢复')
    expect(btn).toBeTruthy()
    await btn!.trigger('click')
    expect(wrapper.emitted('toggle')).toHaveLength(1)
    expect(wrapper.emitted('toggle')![0]).toEqual(['d1', false])
  })

  it('搜索功能过滤菜品', async () => {
    const wrapper = getWrapper({ open: true, dishes: mockDishes })
    const input = wrapper.find('input[placeholder="搜索菜品"]')
    expect(input.exists()).toBe(true)
    await input.setValue('鱼')
    await flushPromises()
    expect(wrapper.text()).toContain('铁锅鱼')
    expect(wrapper.text()).not.toContain('红烧肉')
  })

  it('分类筛选过滤菜品', async () => {
    const wrapper = getWrapper({ open: true, dishes: mockDishes })
    const btn = wrapper.findAll('button').find((b) => b.text().trim() === '海鲜')
    expect(btn).toBeTruthy()
    await btn!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('铁锅鱼')
    expect(wrapper.text()).toContain('清蒸虾')
    expect(wrapper.text()).not.toContain('红烧肉')
  })

  it('点击一键清空触发 reset-all 事件', async () => {
    const wrapper = getWrapper({ open: true, dishes: mockDishes })
    const btn = wrapper.findAll('button').find((b) => b.text().includes('一键清空'))
    expect(btn).toBeTruthy()
    await btn!.trigger('click')
    expect(wrapper.emitted('reset-all')).toHaveLength(1)
  })

  it('点击遮罩层触发 close 事件', async () => {
    const wrapper = getWrapper({ open: true, dishes: mockDishes })
    const overlay = wrapper.find('.fixed.inset-0')
    expect(overlay.exists()).toBe(true)
    await overlay.trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('沽清数量为 0 时显示提示', () => {
    const wrapper = getWrapper({ open: true, dishes: mockDishes.filter((d) => !d.soldOut) })
    expect(wrapper.text()).toContain('所有菜品均可正常售卖')
  })
})
