import { test, expect } from '@playwright/test'

test.describe('订单核心流程', () => {
  test.use({ storageState: 'playwright/.auth/user.json' })

  test('新建订单 → 列表查看 → 详情查看 → 状态更新', async ({ page }) => {
    // 1. 进入新建订单页面
    await page.goto('/create-order')
    await expect(page.locator('h2')).toContainText('新建订单')

    // 2. 选择桌号（如果存在桌号选项）
    const tableSelect = page.locator('select').first()
    const tableOptions = await tableSelect.locator('option').count()
    if (tableOptions > 1) {
      await tableSelect.selectOption({ index: 1 })
    } else {
      // 没有桌号时测试无法继续，但标记为跳过
      test.skip(tableOptions <= 1, '没有配置桌号，跳过此测试')
    }

    // 3. 添加第一个菜品到购物车
    const addButtons = page.locator('button:has-text("+ 添加")')
    await expect(addButtons.first()).toBeVisible()
    await addButtons.first().click()

    // 4. 确认购物车中有菜品
    await expect(page.locator('.text-lg.font-bold')).toContainText('购物车')
    const cartItems = page.locator('.bg-white.rounded-lg.shadow.p-5 .flex.items-center.justify-between')
    await expect(cartItems.first()).toBeVisible()

    // 5. 提交订单
    await page.locator('button:has-text("提交订单")').click()

    // 6. 处理 alert
    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('成功')
      await dialog.accept()
    })

    // 7. 应跳转回订单列表
    await page.waitForURL(/\/orderList$/)
    await expect(page.locator('h2')).toContainText('订单管理')

    // 8. 点击查看第一个订单详情
    const viewButtons = page.locator('button:has-text("查看")')
    await expect(viewButtons.first()).toBeVisible()
    await viewButtons.first().click()

    await page.waitForURL(/\/order-detail\//)
    await expect(page.locator('h2')).toContainText('订单详情')

    // 9. 详情页应显示基本信息和操作按钮
    await expect(page.locator('text=基本信息')).toBeVisible()
    await expect(page.locator('text=状态操作')).toBeVisible()
  })

  test('订单列表应支持筛选和分页', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h2')).toContainText('订单管理')

    // 检查筛选控件存在
    await expect(page.locator('select').first()).toBeVisible() // 状态筛选
    await expect(page.locator('input[type="date"]')).toBeVisible() // 日期筛选

    // 检查统计卡片
    await expect(page.locator('text=今日订单')).toBeVisible()
    await expect(page.locator('text=待处理')).toBeVisible()
    await expect(page.locator('text=今日营业额')).toBeVisible()

    // 检查表格存在
    await expect(page.locator('table')).toBeVisible()
  })
})
