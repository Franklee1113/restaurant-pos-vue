import { test as setup, expect } from '@playwright/test'

const authFile = 'playwright/.auth/user.json'

setup('authenticate', async ({ page }) => {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill('admin@restaurant.com')
  await page.locator('input[type="password"]').fill('REDACTED_DEFAULT_PASSWORD')
  await page.locator('button[type="submit"]').click()

  // Wait for navigation to order list after login
  await page.waitForURL(/\/(orderList)?$/)
  await expect(page.locator('nav')).toContainText('订单管理')

  await page.context().storageState({ path: authFile })
})
