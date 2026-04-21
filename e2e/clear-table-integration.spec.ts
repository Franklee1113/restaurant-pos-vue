import { test, expect } from '@playwright/test'
import { createApiClient, TEST_TABLE, type ApiClient, type Dish } from './helpers/api-client'
import type { APIRequestContext } from '@playwright/test'

/**
 * E2E-003: 清台状态联动
 * 覆盖场景：
 *   1. completed 订单清台 → 订单自动变为 settled + 桌台变为 idle
 *   2. pending/dining 等未完成订单 → 清台按钮被阻断
 *   3. 已清台（idle）桌台 → 重复清台被阻断
 */

test.describe.serial('清台状态联动', () => {
  let api: ApiClient
  let apiContext: APIRequestContext
  let tableStatusId = ''
  const testOrders: string[] = []
  let testDish: Dish | null = null

  test.beforeAll(async ({ playwright }) => {
    const res = await createApiClient(playwright)
    api = res.api
    apiContext = res.context

    const ts = await api.getTableStatus(TEST_TABLE)
    if (!ts) {
      throw new Error(`找不到桌号 ${TEST_TABLE} 的 table_status 记录`)
    }
    tableStatusId = ts.id

    await api.cleanupTableOrders(TEST_TABLE)
    await api.updateTableStatus(tableStatusId, { status: 'idle', currentOrderId: '' })

    const dishes = await api.getAvailableDishes(1)
    if (dishes.length > 0) testDish = dishes[0]!
  })

  test.afterAll(async () => {
    for (const id of testOrders) {
      try { await api.deleteOrder(id) } catch { /* ignore */ }
    }
    if (tableStatusId) {
      await api.updateTableStatus(tableStatusId, { status: 'idle', currentOrderId: '' })
    }
    await apiContext.dispose()
  })

  test('completed 订单清台应联动更新订单为 settled 且桌台变为 idle', async ({ page }) => {
    test.skip(!testDish, '没有可用菜品')

    const order = await api.createOrder({
      tableNo: TEST_TABLE,
      orderNo: `E2E-CT-${Date.now()}`,
      status: 'completed',
      guests: 2,
      items: [
        { dishId: testDish!.id, name: testDish!.name, price: testDish!.price, quantity: 1, status: 'served' },
      ],
      source: 'staff',
    })
    testOrders.push(order.id)
    await api.updateTableStatus(tableStatusId, { status: 'dining', currentOrderId: order.id })

    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('h2')).toContainText('订单管理')

    const orderRow = page.locator('tr').filter({ hasText: order.orderNo }).first()
    await expect(orderRow).toBeVisible({ timeout: 10000 })
    await orderRow.locator('button:has-text("查看")').click()
    await page.waitForURL(/\/order-detail\//)

    const clearBtn = page.locator(`button:has-text("清台（${TEST_TABLE}号桌）")`)
    await expect(clearBtn).toBeVisible({ timeout: 5000 })

    await clearBtn.click()
    await expect(page.locator('text=确认清台')).toBeVisible({ timeout: 3000 })
    // 弹窗中的确认按钮（DialogModal 使用 flex justify-end 布局，确认按钮是最后一个）
    await page.locator('.fixed.inset-0 button:has-text("清台")').last().click()
    await expect(page.locator('text=清台成功')).toBeVisible({ timeout: 10000 })

    // API 验证
    const updatedOrder = await api.getOrdersByTable(TEST_TABLE, 1)
    expect(updatedOrder[0]!.status).toBe('settled')
    expect(updatedOrder[0]!.id).toBe(order.id)

    const ts = await api.getTableStatus(TEST_TABLE)
    expect(ts!.status).toBe('idle')
    expect(ts!.currentOrderId).toBe('')
  })

  test('pending 订单不应显示清台按钮，且无法清台', async ({ page }) => {
    test.skip(!testDish, '没有可用菜品')

    const order = await api.createOrder({
      tableNo: TEST_TABLE,
      orderNo: `E2E-CT-PENDING-${Date.now()}`,
      status: 'pending',
      guests: 2,
      items: [
        { dishId: testDish!.id, name: testDish!.name, price: testDish!.price, quantity: 1, status: 'pending' },
      ],
      source: 'staff',
    })
    testOrders.push(order.id)
    await api.updateTableStatus(tableStatusId, { status: 'dining', currentOrderId: order.id })

    await page.goto(`/order-detail/${order.id}`)
    await page.waitForLoadState('networkidle')

    const clearBtn = page.locator(`button:has-text("清台（${TEST_TABLE}号桌）")`)
    await expect(clearBtn).not.toBeVisible()
    await expect(page.locator('button:has-text("开始制作")')).toBeVisible()
  })

  test('dining 订单尝试清台应被阻断提示', async ({ page }) => {
    test.skip(!testDish, '没有可用菜品')

    const order = await api.createOrder({
      tableNo: TEST_TABLE,
      orderNo: `E2E-CT-DINING-${Date.now()}`,
      status: 'dining',
      guests: 2,
      items: [
        { dishId: testDish!.id, name: testDish!.name, price: testDish!.price, quantity: 1, status: 'served' },
      ],
      source: 'staff',
    })
    testOrders.push(order.id)
    await api.updateTableStatus(tableStatusId, { status: 'dining', currentOrderId: order.id })

    await page.goto(`/order-detail/${order.id}`)
    await page.waitForLoadState('networkidle')

    const clearBtn = page.locator(`button:has-text("清台（${TEST_TABLE}号桌）")`)
    await expect(clearBtn).not.toBeVisible()
    await expect(page.locator('button:has-text("确认结账")')).toBeVisible()
  })

  test('已 idle 桌台的 completed 订单不应允许重复清台', async ({ page }) => {
    test.skip(!testDish, '没有可用菜品')

    const order = await api.createOrder({
      tableNo: TEST_TABLE,
      orderNo: `E2E-CT-SETTLED-${Date.now()}`,
      status: 'settled',
      guests: 2,
      items: [
        { dishId: testDish!.id, name: testDish!.name, price: testDish!.price, quantity: 1, status: 'served' },
      ],
      source: 'staff',
    })
    testOrders.push(order.id)
    await api.updateTableStatus(tableStatusId, { status: 'idle', currentOrderId: '' })

    await page.goto(`/order-detail/${order.id}`)
    await page.waitForLoadState('networkidle')

    const clearBtn = page.locator(`button:has-text("清台（${TEST_TABLE}号桌）")`)
    await expect(clearBtn).not.toBeVisible()
    await expect(page.locator('text=当前订单已结束，无需进一步操作')).toBeVisible()
  })

  test('订单列表快捷筛选「待清台」应正确展示 completed 订单', async ({ page }) => {
    test.skip(!testDish, '没有可用菜品')

    const order = await api.createOrder({
      tableNo: TEST_TABLE,
      orderNo: `E2E-CT-FILTER-${Date.now()}`,
      status: 'completed',
      guests: 2,
      items: [
        { dishId: testDish!.id, name: testDish!.name, price: testDish!.price, quantity: 1, status: 'served' },
      ],
      source: 'staff',
    })
    testOrders.push(order.id)
    await api.updateTableStatus(tableStatusId, { status: 'dining', currentOrderId: order.id })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const statusSelect = page.locator('select').first()
    await statusSelect.selectOption('completed')
    await page.waitForTimeout(800)

    const orderRow = page.locator('tr').filter({ hasText: order.orderNo }).first()
    await expect(orderRow).toBeVisible({ timeout: 10000 })

    const rowText = await orderRow.textContent()
    expect(rowText).toMatch(/已结账|待清台/)
  })
})
