import { describe, it, expect, beforeEach } from 'vitest'
import { useConfirm, globalConfirm } from '../useConfirm'

describe('useConfirm', () => {
  let confirm: ReturnType<typeof useConfirm>

  beforeEach(() => {
    confirm = useConfirm()
    // Reset module-level singleton state
    confirm.open.value = false
    confirm.options.value = {}
  })

  it('should return a promise from confirm()', () => {
    const p = confirm.confirm({ title: 'Test' })
    expect(p).toBeInstanceOf(Promise)
    expect(confirm.open.value).toBe(true)
    expect(confirm.options.value.title).toBe('Test')
  })

  it('should resolve true on onConfirm()', async () => {
    const p = confirm.confirm()
    confirm.onConfirm()
    expect(confirm.open.value).toBe(false)
    await expect(p).resolves.toBe(true)
  })

  it('should resolve false on onCancel()', async () => {
    const p = confirm.confirm()
    confirm.onCancel()
    expect(confirm.open.value).toBe(false)
    await expect(p).resolves.toBe(false)
  })

  it('should resolve false when a new confirm overrides the old one', async () => {
    const p1 = confirm.confirm({ title: 'First' })
    const p2 = confirm.confirm({ title: 'Second' })

    expect(confirm.options.value.title).toBe('Second')
    await expect(p1).resolves.toBe(false)

    confirm.onConfirm()
    await expect(p2).resolves.toBe(true)
  })

  it('should reset resolveFn after onConfirm', () => {
    confirm.confirm()
    confirm.onConfirm()
    // Calling onConfirm again should not throw
    confirm.onConfirm()
    expect(confirm.open.value).toBe(false)
  })

  it('should accept full options', () => {
    confirm.confirm({
      title: 'Delete?',
      description: 'Are you sure?',
      confirmText: 'Yes',
      cancelText: 'No',
      type: 'danger',
    })
    expect(confirm.options.value).toEqual({
      title: 'Delete?',
      description: 'Are you sure?',
      confirmText: 'Yes',
      cancelText: 'No',
      type: 'danger',
    })
  })
})

describe('globalConfirm', () => {
  beforeEach(() => {
    globalConfirm.open.value = false
    globalConfirm.options.value = {}
  })

  it('should be a singleton instance', () => {
    expect(globalConfirm.open).toBeDefined()
    expect(globalConfirm.confirm).toBeInstanceOf(Function)
  })
})
