import { test, expect } from '@playwright/test'

test.describe('登录页面', () => {
  test('应该显示登录表单', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('h1')).toContainText('智能点菜系统')
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })

  test('使用正确凭据登录后应跳转到订单列表', async ({ page }) => {
    await page.goto('/login')
    await page.locator('input[type="email"]').fill('admin@restaurant.com')
    await page.locator('input[type="password"]').fill('REDACTED_DEFAULT_PASSWORD')
    await page.locator('button[type="submit"]').click()

    await page.waitForURL(/\/(orderList)?$/)
    await expect(page.locator('h2')).toContainText('订单管理')
  })

  test('使用错误密码应显示错误信息', async ({ page }) => {
    await page.goto('/login')
    await page.locator('input[type="email"]').fill('admin@restaurant.com')
    await page.locator('input[type="password"]').fill('wrongpassword')
    await page.locator('button[type="submit"]').click()

    // PocketBase 返回英文错误信息
    await expect(page.locator('.text-red-600')).toContainText('Failed')
  })
})
