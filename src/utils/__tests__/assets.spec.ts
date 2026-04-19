import { describe, it, expect, vi } from 'vitest'

// Mock PB_URL before importing module
vi.mock('@/api/pocketbase', () => ({
  PB_URL: '/api',
}))

import { getFileUrl } from '../assets'

describe('getFileUrl', () => {
  it('should return null when recordId is missing', () => {
    expect(getFileUrl('settings', undefined, 'file.jpg')).toBeNull()
  })

  it('should return null when filename is missing', () => {
    expect(getFileUrl('settings', 'abc123', undefined)).toBeNull()
  })

  it('should return null when both are missing', () => {
    expect(getFileUrl('settings', undefined, undefined)).toBeNull()
  })

  it('should construct correct file URL', () => {
    expect(getFileUrl('settings', 'rec123', 'qr.png')).toBe('/api/files/settings/rec123/qr.png')
  })

  it('should handle empty string values as missing', () => {
    expect(getFileUrl('settings', '', 'qr.png')).toBeNull()
    expect(getFileUrl('settings', 'rec123', '')).toBeNull()
  })
})
