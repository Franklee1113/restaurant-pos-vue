import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { useAutoRefresh } from '../useAutoRefresh'

describe('useAutoRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should auto-start when immediate=true inside component', async () => {
    const callback = vi.fn()

    const Comp = defineComponent({
      setup() {
        const { isRunning } = useAutoRefresh(callback, { interval: 5000, immediate: true })
        return { isRunning }
      },
      render() {
        return h('div')
      },
    })

    const wrapper = mount(Comp)
    await nextTick()

    expect(wrapper.vm.isRunning).toBe(true)
    vi.advanceTimersByTime(5000)
    expect(callback).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })

  it('should not auto-start when immediate=false', async () => {
    const callback = vi.fn()

    const Comp = defineComponent({
      setup() {
        const { isRunning } = useAutoRefresh(callback, { interval: 5000, immediate: false })
        return { isRunning }
      },
      render() {
        return h('div')
      },
    })

    const wrapper = mount(Comp)
    await nextTick()

    expect(wrapper.vm.isRunning).toBe(false)
    vi.advanceTimersByTime(5000)
    expect(callback).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('should start manually when immediate=false', async () => {
    const callback = vi.fn()

    const Comp = defineComponent({
      setup() {
        const { isRunning, start } = useAutoRefresh(callback, { interval: 5000, immediate: false })
        return { isRunning, start }
      },
      render() {
        return h('div')
      },
    })

    const wrapper = mount(Comp)
    wrapper.vm.start()
    await nextTick()

    expect(wrapper.vm.isRunning).toBe(true)
    vi.advanceTimersByTime(5000)
    expect(callback).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })

  it('should stop on unmount', async () => {
    const callback = vi.fn()

    const Comp = defineComponent({
      setup() {
        const { isRunning } = useAutoRefresh(callback, { interval: 5000, immediate: true })
        return { isRunning }
      },
      render() {
        return h('div')
      },
    })

    const wrapper = mount(Comp)
    await nextTick()
    wrapper.unmount()

    vi.advanceTimersByTime(10000)
    expect(callback).toHaveBeenCalledTimes(0) // stopped on unmount
  })

  it('should use default interval of 30000ms', async () => {
    const callback = vi.fn()

    const Comp = defineComponent({
      setup() {
        useAutoRefresh(callback)
        return {}
      },
      render() {
        return h('div')
      },
    })

    const wrapper = mount(Comp)
    await nextTick()

    vi.advanceTimersByTime(29999)
    expect(callback).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(callback).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })

  it('should support custom interval', async () => {
    const callback = vi.fn()

    const Comp = defineComponent({
      setup() {
        useAutoRefresh(callback, { interval: 1000 })
        return {}
      },
      render() {
        return h('div')
      },
    })

    const wrapper = mount(Comp)
    await nextTick()

    vi.advanceTimersByTime(3000)
    expect(callback).toHaveBeenCalledTimes(3)

    wrapper.unmount()
  })

  it('should not start when interval <= 0', async () => {
    const callback = vi.fn()

    const Comp = defineComponent({
      setup() {
        const { isRunning, start } = useAutoRefresh(callback, { interval: 0 })
        return { isRunning, start }
      },
      render() {
        return h('div')
      },
    })

    const wrapper = mount(Comp)
    wrapper.vm.start()
    await nextTick()

    expect(wrapper.vm.isRunning).toBe(false)

    wrapper.unmount()
  })

  it('should restart cleanly (stop previous timer)', async () => {
    const callback = vi.fn()

    const Comp = defineComponent({
      setup() {
        const { start } = useAutoRefresh(callback, { interval: 5000, immediate: false })
        return { start }
      },
      render() {
        return h('div')
      },
    })

    const wrapper = mount(Comp)
    wrapper.vm.start()
    wrapper.vm.start() // double start should not create multiple timers

    vi.advanceTimersByTime(5000)
    expect(callback).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })
})
