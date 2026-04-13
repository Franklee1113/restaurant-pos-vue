import { test, expect } from '@playwright/test'

test.describe('系统设置', () => {
  test.use({ storageState: 'playwright/.auth/user.json' })

  test('应该能访问设置页面并显示各个配置区块', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.locator('h2')).toContainText('系统设置')
    await expect(page.locator('text=餐厅信息')).toBeVisible()
    await expect(page.locator('text=菜品分类')).toBeVisible()
    await expect(page.locator('text=桌号管理')).toBeVisible()
    await expect(page.locator('button:has-text("保存设置")')).toBeVisible()
  })

  test('应该能添加和删除分类标签', async ({ page }) => {
    await page.goto('/settings')

    // 获取当前分类数量
    const categoryTags = page.locator('.bg-blue-50.text-blue-700')
    const initialCount = await categoryTags.count()

    // 添加新分类
    const newCategory = `测试分类_${Date.now()}`
    await page.locator('.bg-white:has-text("菜品分类") input[type="text"]').fill(newCategory)
    await page.locator('.bg-white:has-text("菜品分类") button:has-text("添加")').click()

    // 验证新分类出现
    await expect(page.locator('.bg-blue-50.text-blue-700').filter({ hasText: newCategory })).toBeVisible()

    // 删除新分类
    await page.locator('.bg-blue-50.text-blue-700').filter({ hasText: newCategory }).locator('button').click()

    // 验证分类消失
    await expect(page.locator('.bg-blue-50.text-blue-700').filter({ hasText: newCategory })).not.toBeVisible()
  })
})
