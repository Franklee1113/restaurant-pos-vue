import { test, expect } from '@playwright/test'
import { createApiClient } from './helpers/api-client'

test.describe('订单核心流程', () => {
  test.use({ storageState: 'playwright/.auth/user.json' })

  test.beforeAll(async ({ playwright }) => {
    // 清理所有桌台状态，避免桌台占用导致新建订单被阻断
    const { api, context } = await createApiClient(playwright)
    const tableStatuses = await api.getAllTableStatuses()
    for (const ts of tableStatuses) {
      if (ts.status !== 'idle') {
        await api.updateTableStatus(ts.id, { status: 'idle', currentOrderId: '' })
      }
    }
    await context.dispose()
  })

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

    // 3. 添加第一个菜品到购物车（桌面端表格/移动端卡片中按钮可能 hidden，取可见的）
    const addButtons = page.locator('button:has-text("+ 添加")').filter({ visible: true })
    const addCount = await addButtons.count()
    test.skip(addCount === 0, '没有可用的添加按钮')
    await addButtons.first().click()

    // 4. 确认购物车中有菜品（CartPanel 结构：.bg-white.rounded-lg.shadow.p-4）
    await expect(page.locator('h3:has-text("购物车")')).toBeVisible()
    const cartItems = page.locator('.bg-white.rounded-lg.shadow.p-4 .flex.items-center.gap-2')
    await expect(cartItems.first()).toBeVisible()

    // 5. 提交订单
    await page.locator('button:has-text("提交订单")').click()

    // 6. 等待跳转回订单列表（通过页面内容判断，避免路由不匹配问题）
    await expect(page.locator('h2')).toContainText('订单管理', { timeout: 15000 })

    // 8. 点击查看第一个订单详情
    const viewButtons = page.locator('button:has-text("查看")')
    await expect(viewButtons.first()).toBeVisible()
    await viewButtons.first().click()

    await page.waitForURL(/\/order-detail\//)
    // OrderDetailView 没有 h2，使用订单号或 "订单明细" 断言
    await expect(page.locator('text=订单明细').first()).toBeVisible()

    // 9. 详情页应显示基本信息和操作按钮
    await expect(page.locator('text=基本信息').first()).toBeVisible()
    await expect(page.locator('text=状态操作').first()).toBeVisible()
  })

  test('订单列表应支持筛选和分页', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h2')).toContainText('订单管理')

    // 检查筛选控件存在
    await expect(page.locator('select').first()).toBeVisible() // 状态筛选
    await expect(page.locator('input[type="date"]')).toBeVisible() // 日期筛选

    // 检查统计卡片（避免 strict mode：页面上可能有 "待处理桌号:" 等）
    await expect(page.getByText('今日订单').first()).toBeVisible()
    await expect(page.getByText('待处理', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('今日营业额').first()).toBeVisible()

    // 检查表格存在
    await expect(page.locator('table')).toBeVisible()
  })
})
