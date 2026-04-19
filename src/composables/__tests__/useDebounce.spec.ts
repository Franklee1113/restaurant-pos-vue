import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { useDebounce } from '../useDebounce'

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should debounce function calls', () => {
    const fn = vi.fn()
    const { debouncedFn } = useDebounce(fn, 400)

    debouncedFn('a')
    debouncedFn('b')
    debouncedFn('c')

    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(400)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('c')
  })

  it('should use default delay of 400ms', () => {
    const fn = vi.fn()
    const { debouncedFn } = useDebounce(fn)

    debouncedFn()
    vi.advanceTimersByTime(399)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('should support custom delay', () => {
    const fn = vi.fn()
    const { debouncedFn } = useDebounce(fn, 1000)

    debouncedFn()
    vi.advanceTimersByTime(999)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('should cancel pending timer with cancel()', () => {
    const fn = vi.fn()
    const { debouncedFn, cancel } = useDebounce(fn, 400)

    debouncedFn()
    cancel()
    vi.advanceTimersByTime(400)
    expect(fn).not.toHaveBeenCalled()
  })

  it('should cancel timer on component unmount', async () => {
    const fn = vi.fn()

    const Comp = defineComponent({
      setup() {
        const { debouncedFn } = useDebounce(fn, 400)
        return { debouncedFn }
      },
      render() {
        return h('div')
      },
    })

    const wrapper = mount(Comp)
    wrapper.vm.debouncedFn()
    wrapper.unmount()

    vi.advanceTimersByTime(400)
    expect(fn).not.toHaveBeenCalled()
  })

  it('should pass multiple arguments', () => {
    const fn = vi.fn()
    const { debouncedFn } = useDebounce(fn, 400)

    debouncedFn(1, 'two', { three: true })
    vi.advanceTimersByTime(400)
    expect(fn).toHaveBeenCalledWith(1, 'two', { three: true })
  })
})
