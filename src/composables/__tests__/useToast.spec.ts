import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { useToast } from '../useToast'

describe('useToast', () => {
  let toast: ReturnType<typeof useToast>

  beforeEach(() => {
    vi.useFakeTimers()
    toast = useToast()
    // 清理模块级单例状态
    toast.toasts.value = []
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should add a toast with show()', () => {
    toast.show('Hello', 'info')
    expect(toast.toasts.value).toHaveLength(1)
    expect(toast.toasts.value[0]).toMatchObject({ message: 'Hello', type: 'info' })
  })

  it('should auto-remove toast after duration', () => {
    toast.show('Auto remove', 'success', 3000)
    expect(toast.toasts.value).toHaveLength(1)
    vi.advanceTimersByTime(3000)
    expect(toast.toasts.value).toHaveLength(0)
  })

  it('should not auto-remove when duration is 0', () => {
    toast.show('Persistent', 'error', 0)
    vi.advanceTimersByTime(10000)
    expect(toast.toasts.value).toHaveLength(1)
  })

  it('should support success helper', () => {
    toast.success('Saved')
    expect(toast.toasts.value[0]).toMatchObject({ message: 'Saved', type: 'success' })
  })

  it('should support error helper with longer default duration', () => {
    toast.error('Failed')
    expect(toast.toasts.value[0]).toMatchObject({ message: 'Failed', type: 'error' })
    vi.advanceTimersByTime(3999)
    expect(toast.toasts.value).toHaveLength(1)
    vi.advanceTimersByTime(2)
    expect(toast.toasts.value).toHaveLength(0)
  })

  it('should support warning helper', () => {
    toast.warning('Careful')
    expect(toast.toasts.value[0]).toMatchObject({ message: 'Careful', type: 'warning' })
  })

  it('should support info helper', () => {
    toast.info('FYI')
    expect(toast.toasts.value[0]).toMatchObject({ message: 'FYI', type: 'info' })
  })

  it('should support manual remove()', () => {
    toast.show('A', 'info', 0)
    const id = toast.toasts.value[0]!.id
    toast.remove(id)
    expect(toast.toasts.value).toHaveLength(0)
  })

  it('should ignore remove() for non-existent id', () => {
    toast.show('A', 'info', 0)
    toast.remove(999999)
    expect(toast.toasts.value).toHaveLength(1)
  })

  it('should handle multiple toasts', () => {
    toast.success('A')
    toast.error('B')
    toast.info('C')
    expect(toast.toasts.value).toHaveLength(3)
    vi.advanceTimersByTime(3000)
    // success and info removed, error remains (4000ms)
    expect(toast.toasts.value).toHaveLength(1)
    expect(toast.toasts.value[0]!.message).toBe('B')
  })

  it('should generate unique ids', () => {
    toast.show('A')
    toast.show('B')
    const [t1, t2] = toast.toasts.value
    expect(t1!.id).not.toBe(t2!.id)
  })
})
