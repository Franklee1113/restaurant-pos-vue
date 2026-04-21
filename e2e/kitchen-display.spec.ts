import { test, expect } from '@playwright/test'

test.describe('厨房大屏', () => {
  test('应显示厨房大屏标题和统计', async ({ page }) => {
    await page.goto('/kitchen')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('text=厨房大屏')).toBeVisible()
    await expect(page.locator('text=待制作')).toBeVisible()
    // 避免 strict mode：页面上可能有 "制作中 1 道" 等包含文字的元素
    await expect(page.getByText('制作中', { exact: true }).first()).toBeVisible()
  })

  test('应显示空状态或订单卡片', async ({ page }) => {
    await page.goto('/kitchen')
    await page.waitForLoadState('networkidle')

    const hasEmptyState = await page.locator('text=暂无新订单').isVisible().catch(() => false)
    const hasOrderCard = await page.locator('text=开始制作').first().isVisible().catch(() => false)

    expect(hasEmptyState || hasOrderCard).toBe(true)
  })

  test('公开路由无需登录', async ({ browser }) => {
    // 使用新的未认证上下文
    const context = await browser.newContext()
    const page = await context.newPage()

    await page.goto('/kitchen')
    await page.waitForLoadState('networkidle')

    // 不应被重定向到登录页
    expect(page.url()).toContain('/kitchen')
    await expect(page.locator('text=厨房大屏')).toBeVisible()

    await context.close()
  })
})
