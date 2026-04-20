import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useToast } from '@/composables/useToast'

describe('useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // 清除所有遗留的 toast
    const { toasts, remove } = useToast()
    while (toasts.value.length > 0) {
      remove(toasts.value[0].id)
    }
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should add and remove a toast', () => {
    const { toasts, show } = useToast()
    show('Hello')
    expect(toasts.value).toHaveLength(1)
    expect(toasts.value[0].message).toBe('Hello')

    vi.advanceTimersByTime(3000)
    expect(toasts.value).toHaveLength(0)
  })

  it('should support action button', () => {
    const { toasts, success } = useToast()
    const onClick = vi.fn()
    success('Order saved', {
      action: { label: 'Undo', onClick },
      duration: 5000,
    })
    expect(toasts.value).toHaveLength(1)
    expect(toasts.value[0].action?.label).toBe('Undo')
    toasts.value[0].action?.onClick()
    expect(onClick).toHaveBeenCalled()
  })

  it('should support custom duration via success options', () => {
    const { toasts, success } = useToast()
    success('Long toast', { duration: 10000 })
    vi.advanceTimersByTime(9000)
    expect(toasts.value).toHaveLength(1)
    vi.advanceTimersByTime(2000)
    expect(toasts.value).toHaveLength(0)
  })

  it('should support different types', () => {
    const { toasts, success, error, warning, info } = useToast()
    success('S')
    error('E')
    warning('W')
    info('I')
    expect(toasts.value.map((t) => t.type)).toEqual(['success', 'error', 'warning', 'info'])
  })

  it('should remove toast manually', () => {
    const { toasts, show, remove } = useToast()
    show('Test', 'info', 0)
    expect(toasts.value).toHaveLength(1)
    remove(toasts.value[0].id)
    expect(toasts.value).toHaveLength(0)
  })
})
