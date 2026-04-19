import { describe, it, expect } from 'vitest'
import { getErrorMessage } from '../error'

describe('getErrorMessage', () => {
  it('should extract message from Error instance', () => {
    expect(getErrorMessage(new Error('Something failed'))).toBe('Something failed')
  })

  it('should return string directly', () => {
    expect(getErrorMessage('Plain string error')).toBe('Plain string error')
  })

  it('should return fallback for null', () => {
    expect(getErrorMessage(null)).toBe('未知错误')
  })

  it('should return fallback for undefined', () => {
    expect(getErrorMessage(undefined)).toBe('未知错误')
  })

  it('should return fallback for number', () => {
    expect(getErrorMessage(404)).toBe('未知错误')
  })

  it('should return fallback for object', () => {
    expect(getErrorMessage({ code: 500 })).toBe('未知错误')
  })

  it('should use custom fallback', () => {
    expect(getErrorMessage(null, 'Custom fallback')).toBe('Custom fallback')
  })
})
