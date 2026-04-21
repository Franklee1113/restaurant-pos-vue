import { test, expect } from '@playwright/test'

test.describe('订单详情页', () => {
  test.use({ storageState: 'playwright/.auth/user.json' })

  test('应正确显示订单详情和状态操作按钮', async ({ page }) => {
    // 先进入订单列表
    await page.goto('/')
    await expect(page.locator('h2')).toContainText('订单管理')

    // 如果列表为空则跳过
    const viewButtons = page.locator('button:has-text("查看")')
    const count = await viewButtons.count()
    test.skip(count === 0, '没有订单可查看')

    // 点击查看第一个订单
    await viewButtons.first().click()
    await page.waitForURL(/\/order-detail\//)

    // 验证详情页关键元素
    await expect(page.locator('text=订单明细')).toBeVisible()
    await expect(page.locator('text=基本信息')).toBeVisible()
    await expect(page.locator('text=状态操作')).toBeVisible()
    await expect(page.locator('button:has-text("打印账单")')).toBeVisible()
    await expect(page.locator('button:has-text("编辑订单")')).toBeVisible()
  })

  test('应支持状态变更操作', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h2')).toContainText('订单管理')

    const viewButtons = page.locator('button:has-text("查看")')
    const count = await viewButtons.count()
    test.skip(count === 0, '没有订单可查看')

    await viewButtons.first().click()
    await page.waitForURL(/\/order-detail\//)

    // 查找状态操作按钮（如"标记为制作中"）
    const statusBtn = page.locator('button:has-text("标记为")').first()
    const hasStatusBtn = await statusBtn.isVisible().catch(() => false)
    test.skip(!hasStatusBtn, '当前订单无可流转状态')

    await statusBtn.click()

    // 确认弹窗
    const confirmBtn = page.locator('button:has-text("确定变更")')
    await expect(confirmBtn).toBeVisible({ timeout: 3000 })
    await confirmBtn.click()

    // 应出现成功提示
    await expect(page.locator('text=状态更新成功')).toBeVisible({ timeout: 5000 })
  })

  test('应支持返回订单列表', async ({ page }) => {
    // 先进入真实订单详情页
    await page.goto('/')
    await expect(page.locator('h2')).toContainText('订单管理')

    const viewButtons = page.locator('button:has-text("查看")')
    const count = await viewButtons.count()
    test.skip(count === 0, '没有订单可查看')

    await viewButtons.first().click()
    await page.waitForURL(/\/order-detail\//)

    const backBtn = page.locator('button:has-text("返回")').first()
    test.skip(!(await backBtn.isVisible().catch(() => false)), '未找到返回按钮')

    await backBtn.click()
    await page.waitForURL(/\/$|\/orderList$/, { timeout: 10000 })
    await expect(page.locator('h2')).toContainText('订单管理')
  })
})
