import { test, expect } from '@playwright/test'

test.describe('菜品管理', () => {
  test.use({ storageState: 'playwright/.auth/user.json' })

  test('应该能访问菜品管理页面并显示分类筛选', async ({ page }) => {
    await page.goto('/dishes')
    await expect(page.locator('h2')).toContainText('菜品管理')
    await expect(page.locator('button:has-text("+ 添加菜品")')).toBeVisible()
    await expect(page.locator('button:has-text("全部")')).toBeVisible()
    await expect(page.locator('table')).toBeVisible()
  })

  test('添加菜品弹窗应该能正常打开和关闭', async ({ page }) => {
    await page.goto('/dishes')
    await page.locator('button:has-text("+ 添加菜品")').click()

    // 弹窗出现
    await expect(page.locator('h3')).toContainText('添加菜品')
    await expect(page.locator('input[type="text"]').first()).toBeVisible()
    await expect(page.locator('button:has-text("保存")')).toBeVisible()

    // 点击取消关闭
    await page.locator('button:has-text("取消")').click()
    await expect(page.locator('h3:has-text("添加菜品")')).not.toBeVisible()
  })
})
