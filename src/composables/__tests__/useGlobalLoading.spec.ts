import { describe, it, expect, beforeEach } from 'vitest'
import { useGlobalLoading } from '../useGlobalLoading'

describe('useGlobalLoading', () => {
  beforeEach(() => {
    // Reset module-level singleton state
    const loading = useGlobalLoading()
    // Force reset by hiding until counter reaches 0
    while (loading.visible.value) {
      loading.hide()
    }
  })

  it('should start hidden', () => {
    const loading = useGlobalLoading()
    expect(loading.visible.value).toBe(false)
    expect(loading.text.value).toBe('')
  })

  it('should show loading with default text', () => {
    const loading = useGlobalLoading()
    loading.show()
    expect(loading.visible.value).toBe(true)
    expect(loading.text.value).toBe('加载中...')
  })

  it('should show loading with custom text', () => {
    const loading = useGlobalLoading()
    loading.show('Saving...')
    expect(loading.text.value).toBe('Saving...')
  })

  it('should hide when counter reaches 0', () => {
    const loading = useGlobalLoading()
    loading.show()
    expect(loading.visible.value).toBe(true)
    loading.hide()
    expect(loading.visible.value).toBe(false)
    expect(loading.text.value).toBe('')
  })

  it('should support nested show/hide calls', () => {
    const loading = useGlobalLoading()
    loading.show('A')
    loading.show('B')
    loading.show('C')
    expect(loading.visible.value).toBe(true)
    expect(loading.text.value).toBe('C')

    loading.hide()
    expect(loading.visible.value).toBe(true)

    loading.hide()
    expect(loading.visible.value).toBe(true)

    loading.hide()
    expect(loading.visible.value).toBe(false)
  })

  it('should not go negative on excessive hide', () => {
    const loading = useGlobalLoading()
    loading.hide()
    loading.hide()
    loading.hide()
    expect(loading.visible.value).toBe(false)
  })

  it('should share state across instances (singleton)', () => {
    const loading1 = useGlobalLoading()
    const loading2 = useGlobalLoading()

    loading1.show('Shared')
    expect(loading2.visible.value).toBe(true)
    expect(loading2.text.value).toBe('Shared')

    loading2.hide()
    expect(loading1.visible.value).toBe(false)
  })
})
