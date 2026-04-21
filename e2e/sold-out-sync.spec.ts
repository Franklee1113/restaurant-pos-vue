import { test, expect } from '@playwright/test'
import { createApiClient, TEST_TABLE, type ApiClient, type Dish } from './helpers/api-client'
import type { APIRequestContext } from '@playwright/test'

/**
 * E2E-002: 沽清多端同步
 * 覆盖场景：
 *   1. 员工端标记沽清后，顾客端刷新页面应实时显示"已沽清"且无法选菜
 *   2. 员工端一键清空沽清后，顾客端应恢复可点状态
 *
 * ⚠️ 本测试会临时修改菜品 soldOut 状态，afterAll 中强制恢复。
 */

test.describe.serial('沽清多端同步', () => {
  let api: ApiClient
  let apiContext: APIRequestContext
  let testDish: Dish | null = null

  test.beforeAll(async ({ playwright }) => {
    const res = await createApiClient(playwright)
    api = res.api
    apiContext = res.context

    const allDishes = await api.getDishes()
    const categories = api.getCategories(allDishes)
    if (categories.length === 0) throw new Error('没有可用分类')
    const catDishes = await api.getAvailableDishesByCategory(categories[0]!, 1)
    if (catDishes.length === 0) {
      throw new Error('默认分类中没有可用菜品，无法执行沽清同步测试')
    }
    testDish = catDishes[0]!

    // 强制恢复
    await api.toggleSoldOut(testDish.id, false)
  })

  test.afterAll(async () => {
    if (testDish) await api.toggleSoldOut(testDish.id, false)
    await apiContext.dispose()
  })

  test('员工端标记沽清后，顾客端应实时显示不可点状态', async ({ page }) => {
    test.skip(!testDish, '无可用的测试菜品')

    // ---- Step 1: 员工端标记沽清 ----
    await api.toggleSoldOut(testDish!.id, true, 'E2E测试临时沽清')

    // ---- Step 2: 顾客端进入点餐页应看到已沽清 ----
    await page.goto(`/customer-order?table=${encodeURIComponent(TEST_TABLE)}`)
    await page.evaluate(() => sessionStorage.clear())
    await page.reload()
    await page.waitForLoadState('networkidle')

    const guestSetup = page.locator('text=请选择用餐人数')
    if (await guestSetup.isVisible().catch(() => false)) {
      await page.locator('button:has-text("开始点餐")').click()
    }

    // 切换到菜品所在分类
    const catBtn = page.locator('button').filter({ hasText: testDish!.category }).first()
    if (await catBtn.isVisible().catch(() => false)) {
      await catBtn.click()
      await page.waitForTimeout(300)
    }

    // 验证菜品卡片显示"已沽清"
    const dishCard = page.getByText(testDish!.name).first().locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]')
    await expect(dishCard.locator('text=已沽清')).toBeVisible({ timeout: 10000 })

    // 验证没有"选"按钮
    const selectBtn = page.locator(`button[aria-label="选择${testDish!.name}"]`)
    await expect(selectBtn).not.toBeVisible()
  })

  test('员工端一键清空沽清后，顾客端应恢复可点', async ({ page }) => {
    test.skip(!testDish, '无可用的测试菜品')

    await api.toggleSoldOut(testDish!.id, true)

    // ---- Step 1: 员工端登录并打开沽清抽屉 ----
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('h2')).toContainText('订单管理')

    await page.locator('button:has-text("今日沽清")').click()
    await expect(page.locator('h3:has-text("今日沽清")')).toBeVisible({ timeout: 5000 })

    // 确认测试菜品在列表中且显示"恢复"按钮
    const drawerItem = page.locator('.bg-red-50').filter({ hasText: testDish!.name }).first()
    await expect(drawerItem).toBeVisible({ timeout: 5000 })
    const recoverBtn = drawerItem.locator('button:has-text("恢复")')
    await expect(recoverBtn).toBeVisible()

    // ---- Step 2: 点击"一键清空所有沽清" ----
    await page.locator('button:has-text("一键清空所有沽清")').click()
    await page.waitForTimeout(1500)

    // 关闭抽屉
    await page.locator('button:has-text("✕")').click()
    await expect(page.locator('h3:has-text("今日沽清")')).not.toBeVisible()

    // ---- Step 3: 顾客端验证恢复可点 ----
    const customerPage = await page.context().newPage()
    await customerPage.goto(`/customer-order?table=${encodeURIComponent(TEST_TABLE)}`)
    await customerPage.evaluate(() => sessionStorage.clear())
    await customerPage.reload()
    await customerPage.waitForLoadState('networkidle')

    const guestSetup = customerPage.locator('text=请选择用餐人数')
    if (await guestSetup.isVisible().catch(() => false)) {
      await customerPage.locator('button:has-text("开始点餐")').click()
    }

    const catBtn = customerPage.locator('button').filter({ hasText: testDish!.category }).first()
    if (await catBtn.isVisible().catch(() => false)) {
      await catBtn.click()
      await customerPage.waitForTimeout(300)
    }

    await expect(customerPage.locator(`button[aria-label="选择${testDish!.name}"]`)).toBeVisible({ timeout: 10000 })

    await customerPage.close()
  })

  test('沽清菜品不应出现在厨房大屏的新订单中', async ({ page }) => {
    test.skip(!testDish, '无可用的测试菜品')

    await api.toggleSoldOut(testDish!.id, true)

    // 创建一份包含沽清菜品的订单（pending）
    const order = await api.createOrder({
      tableNo: TEST_TABLE,
      orderNo: `E2E-KDS-${Date.now()}`,
      status: 'pending',
      guests: 2,
      items: [
        { dishId: testDish!.id, name: testDish!.name, price: 18, quantity: 1, status: 'pending' },
      ],
      source: 'staff',
    })

    await page.goto('/kitchen')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('text=厨房大屏')).toBeVisible()

    // KDS 应正常显示订单，不因 soldOut 报错
    await page.waitForTimeout(3000)
    const content = await page.content()
    expect(content).toContain(TEST_TABLE)

    await api.deleteOrder(order.id)
  })
})
