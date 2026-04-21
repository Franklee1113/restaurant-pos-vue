import { test, expect } from '@playwright/test'
import { createApiClient, TEST_TABLE, type ApiClient, type Dish } from './helpers/api-client'
import type { APIRequestContext } from '@playwright/test'

/**
 * E2E-001: 扫码点餐完整链路
 * 覆盖场景：顾客首次扫码 → 选菜下单 → 员工端查看 → 厨房大屏显示 → 员工完成结账 → 顾客追加菜品
 */

test.describe.serial('扫码点餐完整链路', () => {
  let api: ApiClient
  let apiContext: APIRequestContext
  let testDish: Dish | null = null
  let testOrderId = ''
  let testCategory = ''

  test.beforeAll(async ({ playwright }) => {
    const res = await createApiClient(playwright)
    api = res.api
    apiContext = res.context

    await api.cleanupTableOrders(TEST_TABLE)
    const ts = await api.getTableStatus(TEST_TABLE)
    if (ts && ts.status !== 'idle') {
      await api.updateTableStatus(ts.id, { status: 'idle', currentOrderId: '' })
    }

    const dishes = await api.getDishes()
    const categories = api.getCategories(dishes)
    if (categories.length === 0) throw new Error('没有可用分类')

    // 选择默认分类（第一个）中的一道菜品作为测试目标
    testCategory = categories[0]!
    const available = await api.getAvailableDishesByCategory(testCategory, 1)
    if (available.length === 0) throw new Error(`分类 ${testCategory} 中没有可用菜品`)
    testDish = available[0]!
  })

  test.afterAll(async () => {
    await api.cleanupTableOrders(TEST_TABLE)
    const ts = await api.getTableStatus(TEST_TABLE)
    if (ts) {
      await api.updateTableStatus(ts.id, { status: 'idle', currentOrderId: '' })
    }
    await apiContext.dispose()
  })

  test('顾客端首次扫码点餐并提交订单', async ({ page }) => {
    // 1. 进入顾客端点餐页（清除旧会话避免干扰）
    await page.goto(`/customer-order?table=${encodeURIComponent(TEST_TABLE)}`)
    await page.evaluate(() => sessionStorage.clear())
    await page.reload()
    await page.waitForLoadState('networkidle')

    // 2. 应弹出人数选择
    await expect(page.locator('text=请选择用餐人数')).toBeVisible({ timeout: 5000 })

    // 3. 设置 3 人并开始点餐
    const increaseBtn = page.locator('[aria-label="增加人数"]').first()
    await increaseBtn.click()
    await increaseBtn.click()
    await page.locator('button:has-text("开始点餐")').click()
    await expect(page.locator('text=请选择用餐人数')).not.toBeVisible()

    // 4. 如果默认分类不是目标分类，点击切换
    const activeCatBtn = page.locator('button').filter({ hasText: testCategory }).first()
    if (await activeCatBtn.isVisible().catch(() => false)) {
      await activeCatBtn.click()
      await page.waitForTimeout(300)
    }

    // 5. 选择目标菜品（使用 aria-label 精确定位）
    const addBtn = page.locator(`button[aria-label="选择${testDish!.name}"]`)
    await expect(addBtn).toBeVisible({ timeout: 5000 })
    await addBtn.click()

    // 6. 购物车应显示数量 1
    await expect(page.locator('[aria-label="打开购物车"]')).toContainText('1', { timeout: 3000 })

    // 7. 打开购物车并提交
    await page.locator('[aria-label="打开购物车"]').click()
    await expect(page.locator('text=我的购物车')).toBeVisible()
    await expect(page.locator('text=确认下单')).toBeVisible()
    await page.locator('text=确认下单').click()

    // 8. 验证成功提示（使用 waitForSelector 确保在 2s 提示窗口内捕获）
    await page.waitForSelector('text=订单提交成功！', { timeout: 10000 })

    // 9. 通过 API 验证订单已入库
    const orders = await api.getOrdersByTable(TEST_TABLE, 1)
    expect(orders.length).toBeGreaterThan(0)
    const order = orders[0]!
    expect(order.tableNo).toBe(TEST_TABLE)
    expect(order.source).toBe('customer')
    expect(order.status).toBe('pending')
    expect(order.guests).toBe(3)
    testOrderId = order.id
  })

  test('员工端订单列表应出现新订单并可查看详情', async ({ page }) => {
    test.skip(!testOrderId, '前置测试未创建订单')

    await page.goto('/')
    await expect(page.locator('h2')).toContainText('订单管理')
    await page.reload()
    await page.waitForLoadState('networkidle')

    const orderRow = page.locator('tr').filter({ hasText: TEST_TABLE }).first()
    await expect(orderRow).toBeVisible({ timeout: 10000 })

    await orderRow.locator('button:has-text("查看")').click()
    await page.waitForURL(/\/order-detail\//)

    await expect(page.locator('text=订单明细')).toBeVisible()
    await expect(page.locator('text=基本信息')).toBeVisible()
    await expect(page.locator('text=状态操作')).toBeVisible()
  })

  test('厨房大屏应显示顾客端新订单的待制作菜品', async ({ page }) => {
    test.skip(!testOrderId, '前置测试未创建订单')

    await page.goto('/kitchen')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('text=厨房大屏')).toBeVisible()
    await expect(page.locator('text=待制作').first()).toBeVisible()

    // 由于 SSE/轮询延迟，给 3 秒时间让 KDS 感知到新订单
    await page.waitForTimeout(3000)
    const content = await page.content()
    expect(content).toContain(TEST_TABLE)
  })

  test('员工将订单流转到 dining 后顾客端可追加菜品', async ({ browser }) => {
    test.skip(!testOrderId, '前置测试未创建订单')

    // ---- 员工端：将订单状态流转到 dining（用餐中）----
    const staffContext = await browser.newContext({ storageState: 'playwright/.auth/user.json' })
    const staffPage = await staffContext.newPage()

    await staffPage.goto(`/order-detail/${testOrderId}`)
    await staffPage.waitForLoadState('networkidle')
    await expect(staffPage.locator('text=订单明细')).toBeVisible({ timeout: 10000 })

    // 状态流转：点击可用的状态按钮直到"上菜完毕"（变为 dining）
    for (let i = 0; i < 5; i++) {
      await staffPage.waitForTimeout(500)
      await staffPage.reload()
      await staffPage.waitForLoadState('networkidle')

      // 目标状态：dining（上菜完毕即 dining），停止流转
      const diningLabel = staffPage.locator('text=用餐中')
      if (await diningLabel.isVisible().catch(() => false)) {
        break
      }

      const actionBtn = staffPage.locator('button').filter({ hasText: /^(开始制作|开始上菜|上菜完毕)$/ }).first()
      if (await actionBtn.isVisible().catch(() => false)) {
        await actionBtn.click()
        await staffPage.locator('button:has-text("确定变更")').click()
        await expect(staffPage.locator('text=状态更新成功')).toBeVisible({ timeout: 5000 })
      }
    }

    await staffContext.close()

    // ---- 验证订单状态为 dining ----
    const order = await api.getOrdersByTable(TEST_TABLE, 1)
    expect(order[0]!.status).toBe('dining')

    // ---- 顾客端：再次扫码应能追加菜品 ----
    const customerPage = await browser.newPage()
    await customerPage.goto(`/customer-order?table=${encodeURIComponent(TEST_TABLE)}`)
    await customerPage.evaluate(() => sessionStorage.clear())
    await customerPage.reload()
    await customerPage.waitForLoadState('networkidle')

    await expect(customerPage.locator('text=当前已有订单')).toBeVisible({ timeout: 10000 })

    // 在当前分类中选菜追加
    const activeCatBtn = customerPage.locator('button').filter({ hasText: testCategory }).first()
    if (await activeCatBtn.isVisible().catch(() => false)) {
      await activeCatBtn.click()
      await customerPage.waitForTimeout(300)
    }

    const addBtn = customerPage.locator(`button[aria-label="选择${testDish!.name}"]`)
    if (await addBtn.isVisible().catch(() => false)) {
      await addBtn.click()
    } else {
      // 已在购物车中，直接增加数量
      const dishCard = customerPage.locator('div.rounded-2xl').filter({ has: customerPage.getByText(testDish!.name) }).first()
      await dishCard.locator('[aria-label="增加数量"]').click()
    }

    await customerPage.locator('[aria-label="打开购物车"]').click()
    await expect(customerPage.locator('text=确认追加')).toBeVisible()
    await customerPage.locator('text=确认追加').click()

    await expect(customerPage.locator('text=追加成功！')).toBeVisible({ timeout: 10000 })
    await customerPage.close()
  })
})
