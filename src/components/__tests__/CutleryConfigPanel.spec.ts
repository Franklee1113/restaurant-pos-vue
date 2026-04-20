import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import CutleryConfigPanel from '../CutleryConfigPanel.vue'

describe('CutleryConfigPanel', () => {
  function mountPanel(props = {}) {
    return mount(CutleryConfigPanel, {
      props: {
        guests: 4,
        modelType: 'charged',
        modelQty: 4,
        ...props,
      },
    })
  }

  function findBtn(wrapper: ReturnType<typeof mountPanel>, text: string) {
    return wrapper.findAll('button').find((b) => b.text().includes(text))
  }

  it('should render charged type by default', () => {
    const wrapper = mountPanel()
    expect(wrapper.text()).toContain('收费餐具')
    expect(wrapper.text()).toContain('¥2')
  })

  it('should emit update:modelType when switching to free', async () => {
    const wrapper = mountPanel()
    const freeBtn = findBtn(wrapper, '免费餐具')
    await freeBtn!.trigger('click')
    expect(wrapper.emitted('update:modelType')).toHaveLength(1)
    expect(wrapper.emitted('update:modelType')![0]).toEqual(['free'])
  })

  it('should emit update:modelType when switching to charged', async () => {
    const wrapper = mountPanel({ modelType: 'free' })
    const chargedBtn = findBtn(wrapper, '收费餐具')
    await chargedBtn!.trigger('click')
    expect(wrapper.emitted('update:modelType')).toHaveLength(1)
    expect(wrapper.emitted('update:modelType')![0]).toEqual(['charged'])
  })

  it('should emit update:modelQty when clicking +/-', async () => {
    const wrapper = mountPanel()
    const minusBtn = findBtn(wrapper, '-')
    const plusBtn = findBtn(wrapper, '+')
    expect(minusBtn).toBeDefined()
    expect(plusBtn).toBeDefined()

    await minusBtn!.trigger('click')
    expect(wrapper.emitted('update:modelQty')).toHaveLength(1)
    expect(wrapper.emitted('update:modelQty')![0]).toEqual([3])

    await plusBtn!.trigger('click')
    expect(wrapper.emitted('update:modelQty')).toHaveLength(2)
    // props 未同步更新，内部 getter 仍为 4，所以 +1 = 5
    expect(wrapper.emitted('update:modelQty')![1]).toEqual([5])
  })

  it('should sync qty to guests when type switched to free', async () => {
    const wrapper = mountPanel({ guests: 6, modelQty: 3 })
    const freeBtn = findBtn(wrapper, '免费餐具')
    await freeBtn!.trigger('click')
    // 需要 setProps 模拟父组件更新 modelType，才能触发组件内部 watch
    await wrapper.setProps({ modelType: 'free' })
    await nextTick()
    expect(wrapper.emitted('update:modelQty')).toHaveLength(1)
    expect(wrapper.emitted('update:modelQty')![0]).toEqual([6])
  })

  it('should sync qty to guests when guests changes (if not manually edited)', async () => {
    const wrapper = mountPanel({ guests: 4, modelQty: 4 })
    await wrapper.setProps({ guests: 8 })
    await nextTick()
    expect(wrapper.emitted('update:modelQty')).toHaveLength(1)
    expect(wrapper.emitted('update:modelQty')![0]).toEqual([8])
  })

  it('should not sync qty when guests changes after manual edit', async () => {
    const wrapper = mountPanel({ guests: 4, modelQty: 4 })
    // simulate manual edit by clicking -
    const minusBtn = findBtn(wrapper, '-')
    await minusBtn!.trigger('click')
    expect(wrapper.emitted('update:modelQty')).toHaveLength(1)

    // reflect parent update
    await wrapper.setProps({ modelQty: 3 })
    await nextTick()

    // change guests
    await wrapper.setProps({ guests: 10 })
    await nextTick()
    // should not emit again because manualEdit is true
    expect(wrapper.emitted('update:modelQty')).toHaveLength(1)
  })

  it('should show total price for charged type', () => {
    const wrapper = mountPanel({ guests: 5, modelQty: 5 })
    expect(wrapper.text()).toContain('¥10.00')
  })

  it('should show free message for free type', () => {
    const wrapper = mountPanel({ modelType: 'free' })
    expect(wrapper.text()).toContain('免费餐具')
    expect(wrapper.text()).toContain('不产生费用')
  })

  it('should clamp qty to 0 when negative', async () => {
    const wrapper = mountPanel({ modelQty: 0 })
    const minusBtn = findBtn(wrapper, '-')
    await minusBtn!.trigger('click')
    expect(wrapper.emitted('update:modelQty')![0]).toEqual([0])
  })
})
