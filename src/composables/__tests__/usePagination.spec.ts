import { describe, it, expect, beforeEach } from 'vitest'
import { usePagination } from '../usePagination'

describe('usePagination', () => {
  let pg: ReturnType<typeof usePagination>

  beforeEach(() => {
    pg = usePagination(1)
  })

  it('should initialize with default values', () => {
    expect(pg.currentPage.value).toBe(1)
    expect(pg.totalPages.value).toBe(1)
    expect(pg.pageSize.value).toBe(20)
    expect(pg.visiblePages.value).toEqual([1])
  })

  it('should go to a valid page', () => {
    pg.setTotal(100)
    pg.goToPage(3)
    expect(pg.currentPage.value).toBe(3)
  })

  it('should not go below page 1', () => {
    pg.setTotal(100)
    pg.goToPage(3)
    pg.goToPage(0)
    expect(pg.currentPage.value).toBe(3)
  })

  it('should not go above totalPages', () => {
    pg.setTotal(50)
    pg.goToPage(10)
    expect(pg.currentPage.value).toBe(1)
  })

  it('should reset to page 1', () => {
    pg.setTotal(100)
    pg.goToPage(5)
    pg.reset()
    expect(pg.currentPage.value).toBe(1)
  })

  it('should calculate totalPages correctly', () => {
    pg.setTotal(0)
    expect(pg.totalPages.value).toBe(1)

    pg.setTotal(20)
    expect(pg.totalPages.value).toBe(1)

    pg.setTotal(21)
    expect(pg.totalPages.value).toBe(2)

    pg.setTotal(100)
    expect(pg.totalPages.value).toBe(5)
  })

  it('should show compact pages with ellipsis when totalPages is 7 and on page 1', () => {
    pg.setTotal(140) // 7 pages
    // currentPage=1: shows 1,2,3 and ellipsis then 7
    expect(pg.visiblePages.value).toEqual([1, 2, 3, '...', 7])
  })

  it('should show all pages when in middle of 7 pages', () => {
    pg.setTotal(140)
    pg.goToPage(4)
    expect(pg.visiblePages.value).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('should show ellipsis for large page counts', () => {
    pg.setTotal(500) // 25 pages
    pg.goToPage(10)
    const pages = pg.visiblePages.value
    expect(pages[0]).toBe(1)
    expect(pages[pages.length - 1]).toBe(25)
    expect(pages).toContain('...')
  })

  it('should show ellipsis near start when on early page', () => {
    pg.setTotal(500)
    pg.goToPage(2)
    // currentPage=2: shows 1,2,3,4 then ellipsis then 25 (5 is 2+3)
    expect(pg.visiblePages.value).toEqual([1, 2, 3, 4, '...', 25])
  })

  it('should show ellipsis near end when on late page', () => {
    pg.setTotal(500)
    pg.goToPage(24)
    // currentPage=24: shows 1, ellipsis, 22,23,24,25 (21 is 24-3)
    expect(pg.visiblePages.value).toEqual([1, '...', 22, 23, 24, 25])
  })

  it('should show double ellipsis when in middle', () => {
    pg.setTotal(500)
    pg.goToPage(13)
    expect(pg.visiblePages.value).toEqual([1, '...', 11, 12, 13, 14, 15, '...', 25])
  })

  it('should support custom initial page', () => {
    const custom = usePagination(5)
    expect(custom.currentPage.value).toBe(5)
  })
})
