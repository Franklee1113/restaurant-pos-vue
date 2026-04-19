# 智能点菜系统 —— 沽清功能详细解决方案概要

> **版本**: v1.0  
> **日期**: 2026-04-19  
> **适用场景**: 小型餐厅（≤15桌，一人多岗，无专职IT）  
> **核心约束**: 全员可操作、极简交互、单设备/弱网兼容

---

## 一、项目背景与约束

### 1.1 为什么要做沽清

当前系统（`restaurant-pos-vue v3.0`）的 `dishes` 集合只有 `name/price/category/description`，**没有菜品可售状态**。对小型餐厅而言，这意味着：

- 中午鱼卖完了，前台和顾客端仍然可以正常点，直到下单后才发现做不了
- 服务员需要在脑子里记"今天什么没了"，高峰期极易出错
- 老板无法提前标记"今天没进货"的菜品

### 1.2 业务约束（必须遵守）

| 约束 | 说明 | 设计影响 |
|------|------|----------|
| **一人多岗** | 同一人可能同时是服务员、厨师、老板 | 不做角色权限隔离，全员可标记/恢复 |
| **设备极少** | 可能只有1台前台电脑 + 顾客手机 | SSE 必须有单设备降级，轮询兜底 |
| **网络不稳** | 家用路由器，可能断网/卡顿 | 操作必须本地立即可见，后端校验兜底 |
| **高峰期极忙** | 午市11:30-13:30，晚市17:30-20:00 | 禁止多层确认弹窗，用「可撤销」代替 |
| **无专职运维** | 不会手动备份，不会改数据库 | 凌晨自动重置沽清状态 |

### 1.3 技术现状

| 组件 | 现状 | 与沽清的关联 |
|------|------|-------------|
| PocketBase v0.22.27 | BaaS，SQLite 单文件 | `dishes` 集合需新增字段 |
| `pb_hooks/orders.pb.js` | 已托管金额计算、状态机、table_status 同步 | 需增加「菜品可售性校验」 |
| Node.js 公共服务 (`server/`) | Fastify，提供 `/public/dishes` 等匿名 API | 需返回 `soldOut` 字段，增加校验 |
| Vue 3 前端 | Pinia + Composition API | 多端需接入 soldOut 状态渲染 |
| SSE Realtime | `subscribeToOrders` 已跑通 | 复用模式实现 `subscribeToDishes` |
| DishAPI 缓存 | `apiCache` 60 秒 TTL | **必须缩短或移除**，否则沽清延迟 |

---

## 二、核心设计原则

```
┌─────────────────────────────────────────────────────────────┐
│  原则1：人在哪，入口就在哪                                      │
│  点菜页 / 订单列表 / 订单详情 / 厨房大屏，全部能一键标记          │
├─────────────────────────────────────────────────────────────┤
│  原则2：一键生效，一秒撤销                                      │
│  点击「标记售罄」→ 立即生效 → Toast 提示「撤销」→ 5秒内可点撤销   │
├─────────────────────────────────────────────────────────────┤
│  原则3：单设备也要自洽                                          │
│  即使只有一台电脑，标记后本地立即刷新，无需等服务器回包           │
├─────────────────────────────────────────────────────────────┤
│  原则4：后端永远兜底                                            │
│  前端信任本地状态，但 PocketBase Hook 必须拦截 soldOut 菜品下单  │
└─────────────────────────────────────────────────────────────┘
```

---

## 三、数据模型设计

### 3.1 PocketBase `dishes` 集合扩展

**迁移文件**: `pb_migrations/1779xxxx_add_soldOut_to_dishes.js`

```javascript
migrate((db) => {
  const collection = db.findCollectionByNameOrId('dishes')

  collection.fields.add(new Field({
    name: 'soldOut',
    type: 'bool',
    required: false,
    presentable: true,
  }))

  collection.fields.add(new Field({
    name: 'soldOutNote',
    type: 'text',
    required: false,
  }))

  collection.fields.add(new Field({
    name: 'soldOutAt',
    type: 'date',
    required: false,
  }))

  return db.saveCollection(collection)
})
```

### 3.2 TypeScript 类型定义

**文件**: `src/api/pocketbase.ts`

```typescript
export interface Dish {
  id: string
  name: string
  price: number
  category: string
  description?: string
  soldOut?: boolean        // 是否沽清
  soldOutNote?: string     // 备注，如"约30分钟后恢复"
  soldOutAt?: string       // ISO 时间，用于排序和追溯
}
```

### 3.3 权限规则（保持扁平）

PocketBase `dishes` 集合的 `updateRule` 保持 `@request.auth.id != ''`，**任何登录用户都能修改**。

> 小型餐厅不需要区分"谁能标记售罄"。防误触靠交互设计，不靠权限系统。

---

## 四、后端方案

### 4.1 PocketBase Hook：订单创建/更新时校验菜品可售性

**文件**: `pb_hooks/orders.pb.js`

在 `onRecordBeforeCreateRequest` 和 `onRecordBeforeUpdateRequest` 中，在金额计算**之前**插入校验：

```javascript
// ── 内联辅助函数 ──
function validateItemsSoldOut(items) {
  if (!items || items.length === 0) return
  for (let i = 0; i < items.length; i++) {
    const dishId = items[i].dishId
    try {
      const dish = $app.dao().findRecordById('dishes', dishId)
      if (dish && dish.get('soldOut') === true) {
        throw new Error('菜品 "' + items[i].name + '" 已售罄，无法下单')
      }
    } catch (e) {
      if (e.message && e.message.indexOf('已售罄') !== -1) throw e
      // 找不到菜品记录时，由后续逻辑处理
    }
  }
}

// ── 在 onRecordBeforeCreateRequest 中，解析 items 后调用 ──
let items = parseJSONField(record, 'items', [])
validateItemsSoldOut(items)   // ← 新增
// ... 后续金额计算

// ── 在 onRecordBeforeUpdateRequest 中，同样位置插入 ──
let newItems = parseJSONField(record, 'items', [])
validateItemsSoldOut(newItems)   // ← 新增
```

**错误响应示例**：
```json
{ "message": "菜品 \"铁锅鱼\" 已售罄，无法下单" }
```

### 4.2 Node.js 公共服务：公共接口返回 soldOut

**文件**: `server/src/services/dish.service.ts`

```typescript
export interface DishRecord {
  id: string
  name: string
  price: number
  category: string
  description?: string
  soldOut?: boolean        // 新增
  soldOutNote?: string     // 新增
}

export class DishService {
  static async getAll(): Promise<DishRecord[]> {
    const pb = getPocketBase()
    const records = await pb.collection('dishes').getFullList({ sort: 'category,name' })
    return records.map((r) => ({
      id: r.id,
      name: r.name,
      price: r.price,
      category: r.category,
      description: r.description,
      soldOut: r.soldOut || false,        // 新增
      soldOutNote: r.soldOutNote || '',   // 新增
    }))
  }

  static async validateItems(items: Array<{ dishId: string; name: string }>): Promise<void> {
    const dishes = await this.getByIds(items.map(i => i.dishId))
    for (const item of items) {
      const dish = dishes.find(d => d.id === item.dishId)
      if (!dish) throw new NotFoundError(`菜品不存在: ${item.name}`)
      if (dish.soldOut) {
        throw new Error(`菜品 "${item.name}" 已售罄，请刷新后重试`)
      }
    }
  }
}
```

**文件**: `server/src/routes/public-dishes/index.ts`

无需改动，因为 `DishService.getAll()` 已经返回 soldOut。

### 4.3 自动重置：每日凌晨恢复所有菜品

**方案 A（推荐）**：PocketBase Hook 无法做 cron，改为在 **Node.js 公共服务** 中增加定时任务：

**文件**: `server/src/index.ts`（或独立 `src/jobs/resetSoldOut.ts`）

```typescript
import { getPocketBase } from './plugins/pocketbase'

// 每天凌晨 04:00 检查并执行
setInterval(async () => {
  const now = new Date()
  if (now.getHours() === 4 && now.getMinutes() === 0) {
    const pb = getPocketBase()
    const soldOutDishes = await pb.collection('dishes').getFullList({
      filter: 'soldOut = true',
    })
    for (const dish of soldOutDishes) {
      await pb.collection('dishes').update(dish.id, {
        soldOut: false,
        soldOutNote: '',
        soldOutAt: null,
      })
    }
    console.log(`[AutoReset] ${soldOutDishes.length} 道菜品已自动恢复售卖`)
  }
}, 60_000) // 每分钟检查一次
```

**方案 B（备选）**：服务器 crontab（如果运维能力允许）：
```bash
0 4 * * * cd /var/www/restaurant-pos-vue/server && npm run reset-sold-out
```

---

## 五、前端方案：多端入口详细设计

### 5.1 API 层扩展

**文件**: `src/api/pocketbase.ts`

```typescript
export const DishAPI = {
  // ... 现有方法

  async toggleSoldOut(id: string, soldOut: boolean, note?: string): Promise<Dish> {
    const url = `${PB_URL}/collections/${COLLECTION_DISHES}/records/${encodeURIComponent(id)}`
    const res = await privateRequest<Dish>(url, {
      method: 'PATCH',
      body: JSON.stringify({
        soldOut,
        soldOutNote: note || '',
        soldOutAt: soldOut ? new Date().toISOString() : null,
      }),
    })
    if (!res) throw new APIError('更新沽清状态失败', 500)
    apiCache.clear('dishes:all')   // 立即清除缓存
    return res
  },
}

// SSE 订阅 dishes 集合变更
export async function subscribeToDishes(
  onUpdate: (record: Dish) => void,
): Promise<() => void> {
  if (typeof EventSource === 'undefined') {
    throw new Error('EventSource not supported')
  }
  const authRes = await privateRequest<{ clientId: string }>(`${PB_URL}/realtime`, { method: 'POST' })
  if (!authRes) throw new APIError('获取实时连接失败', 500)
  const { clientId } = authRes

  const es = new EventSource(`${PB_URL}/realtime?clientId=${clientId}`)
  const doSubscribe = () => {
    fetch(`${PB_URL}/realtime/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, subscriptions: { [COLLECTION_DISHES]: '' } }),
    }).catch(() => {})
  }
  es.addEventListener('PB_CONNECT', doSubscribe)
  es.addEventListener(COLLECTION_DISHES, (e) => {
    try {
      const data = JSON.parse((e as MessageEvent).data)
      if (data.record) onUpdate(data.record)
    } catch { /* ignore */ }
  })
  return () => es.close()
}
```

> **关键**：`apiCache.clear('dishes:all')` 在 toggleSoldOut 后立即执行，确保下一个人打开页面不会读到缓存。

### 5.2 入口一：点菜页 OrderFormView（最重要）

**场景**：小王在前台点菜，发现铁锅鱼没了，当场标记。

**交互**：菜品卡片右上角「⋯」菜单 → 标记售罄。

**文件**: `src/views/OrderFormView.vue`

```vue
<template>
  <!-- 桌面端网格 -->
  <div class="hidden sm:grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3">
    <div
      v-for="dish in filteredDishes"
      :key="dish.id"
      :class="[
        'relative rounded-xl p-3 text-center border transition-all',
        dish.soldOut
          ? 'bg-gray-100 opacity-50 cursor-not-allowed border-gray-200'
          : 'bg-gray-50 hover:shadow-md hover:-translate-y-0.5 border-transparent hover:border-blue-300'
      ]"
    >
      <!-- 更多操作按钮 -->
      <button
        v-if="!dish.soldOut"
        class="absolute top-1 right-1 p-1 rounded-full bg-white/90 opacity-0 hover:opacity-100 focus:opacity-100 transition-opacity z-10"
        @click.stop="openDishMenu(dish)"
      >⋯</button>
      
      <!-- 已售罄标签 -->
      <div v-if="dish.soldOut" class="absolute inset-0 flex items-center justify-center">
        <span class="px-2 py-1 bg-red-500 text-white text-xs font-bold rounded-full shadow">
          已售罄
        </span>
      </div>

      <div class="font-semibold text-sm truncate" :class="dish.soldOut ? 'text-gray-400' : 'text-gray-800'">
        {{ dish.name }}
      </div>
      <div class="text-xs truncate mb-2" :class="dish.soldOut ? 'text-gray-400' : 'text-gray-500'">
        {{ dish.soldOutNote || dish.description || dish.category }}
      </div>
      <div class="font-bold text-base mb-2" :class="dish.soldOut ? 'text-gray-400' : 'text-red-500'">
        {{ MoneyCalculator.format(dish.price) }}
      </div>
      <button
        v-if="!dish.soldOut"
        class="w-full py-1.5 bg-blue-600 text-white text-xs rounded-full hover:bg-blue-700"
        @click="addToCart(dish)"
      >+ 添加</button>
    </div>
  </div>
</template>
```

**ActionSheet 菜单组件**（可复用）：

```vue
<!-- src/components/DishActionSheet.vue -->
<template>
  <div v-if="open" class="fixed inset-0 z-50" @click="$emit('close')">
    <div class="absolute inset-0 bg-black/40" />
    <div class="absolute bottom-0 left-0 right-0 bg-white rounded-t-xl p-4 space-y-2" @click.stop>
      <div class="text-center text-sm text-gray-500 pb-2">{{ dish?.name }}</div>
      <button
        class="w-full py-3 text-red-600 font-medium bg-red-50 rounded-lg hover:bg-red-100"
        @click="markSoldOut"
      >⚠️ 标记为"已售罄"</button>
      <button class="w-full py-3 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200" @click="$emit('close')">
        取消
      </button>
    </div>
  </div>
</template>
```

**标记后撤销逻辑**：

```typescript
// OrderFormView.vue script
async function markDishSoldOut(dish: Dish) {
  // 1. 本地乐观更新（单设备场景下用户立即看到效果）
  const originalState = { ...dish }
  const idx = dishes.value.findIndex(d => d.id === dish.id)
  if (idx !== -1) dishes.value[idx] = { ...dish, soldOut: true, soldOutAt: new Date().toISOString() }

  // 2. 调用 API
  try {
    await DishAPI.toggleSoldOut(dish.id, true)
    // 3. Toast 带撤销按钮
    toast.success(`"${dish.name}" 已标记售罄`, {
      action: {
        label: '撤销',
        onClick: async () => {
          await DishAPI.toggleSoldOut(dish.id, false)
          dishes.value[idx] = originalState
        }
      },
      duration: 5000,
    })
  } catch (err) {
    // 失败回滚
    dishes.value[idx] = originalState
    toast.error('标记失败: ' + (err instanceof Error ? err.message : '未知错误'))
  }
}
```

### 5.3 入口二：订单列表页 OrderListView（全局管理）

**场景**：老板在订单列表页盯台，发现某道菜被连续点但做不了，想批量管理今日沽清。

**文件**: `src/views/OrderListView.vue`

在页面顶部增加「今日沽清」抽屉按钮：

```vue
<template>
  <!-- Header 区域新增按钮 -->
  <div class="flex items-center gap-2">
    <button
      class="px-3 py-2 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-sm font-medium hover:bg-amber-100"
      @click="soldOutDrawerOpen = true"
    >
      📋 今日沽清
    </button>
    <!-- ...原有按钮 -->
  </div>

  <!-- 沽清管理抽屉 -->
  <Teleport to="body">
    <div v-if="soldOutDrawerOpen" class="fixed inset-0 z-50" @click="soldOutDrawerOpen = false">
      <div class="absolute inset-0 bg-black/40" />
      <div class="absolute right-0 top-0 bottom-0 w-80 max-w-[85vw] bg-white shadow-xl p-4 flex flex-col" @click.stop>
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-bold text-lg">今日沽清</h3>
          <button @click="soldOutDrawerOpen = false">✕</button>
        </div>
        
        <input v-model="soldOutSearch" placeholder="搜索菜品" class="w-full px-3 py-2 border rounded-lg text-sm mb-3" />
        
        <div class="flex-1 overflow-y-auto space-y-2">
          <div
            v-for="dish in filteredSoldOutDishes"
            :key="dish.id"
            class="flex items-center justify-between p-3 rounded-lg"
            :class="dish.soldOut ? 'bg-red-50' : 'bg-gray-50'"
          >
            <div>
              <div class="text-sm font-medium">{{ dish.name }}</div>
              <div class="text-xs text-gray-500">{{ dish.category }}</div>
            </div>
            <button
              v-if="!dish.soldOut"
              class="px-2 py-1 text-xs bg-red-100 text-red-600 rounded hover:bg-red-200"
              @click="toggleSoldOut(dish, true)"
            >标记</button>
            <button
              v-else
              class="px-2 py-1 text-xs bg-green-100 text-green-600 rounded hover:bg-green-200"
              @click="toggleSoldOut(dish, false)"
            >恢复</button>
          </div>
        </div>
        
        <div class="pt-3 border-t mt-3">
          <button
            class="w-full py-2 text-sm text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100"
            @click="resetAllSoldOut"
          >⚡ 一键清空所有沽清</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
```

### 5.4 入口三：订单详情页 OrderDetailView（从订单反推）

**场景**：查看订单详情时，发现某道菜做不了，直接从这里标记。

**文件**: `src/views/OrderDetailView.vue`

在订单明细的每道菜品行增加「⋯」菜单：

```vue
<!-- 在菜品列表循环中 -->
<div v-for="item in order.items" :key="item.dishId" class="flex items-center justify-between py-2">
  <div class="flex items-center gap-2">
    <div class="text-sm font-medium">{{ item.name }}</div>
    <!-- ...状态标签 -->
  </div>
  <div class="flex items-center gap-2">
    <div class="text-sm font-semibold">¥{{ item.price * item.quantity }}</div>
    <!-- 新增：更多操作 -->
    <button class="p-1 text-gray-400 hover:text-gray-600" @click="openItemMenu(item)">⋯</button>
  </div>
</div>
```

弹出菜单包含：「标记"{{item.name}}"售罄」（直接调用 `DishAPI.toggleSoldOut`）。

### 5.5 入口四：厨房大屏 KitchenDisplayView

**场景**：厨房大屏前有人盯着，发现原料不够，直接标记。

**文件**: `src/views/KitchenDisplayView.vue`

增加右下角浮动「菜品管理」按钮，点击后复用 `OrderListView` 同款抽屉组件（可抽取为 `SoldOutManager` 组件）。

### 5.6 顾客端 CustomerOrderView

**文件**: `src/views/CustomerOrderView.vue`

菜品列表渲染与员工端一致（置灰 + 已售罄标签）。

**购物车冲突处理**：

```typescript
// 提交前校验
async function submitOrder() {
  const soldOutItems = cart.value.filter(item => {
    const dish = dishes.value.find(d => d.id === item.dishId)
    return dish?.soldOut
  })
  
  if (soldOutItems.length > 0) {
    toast.error(`以下菜品已售罄，已自动移除：${soldOutItems.map(i => i.name).join('、')}`)
    cart.value = cart.value.filter(item => !soldOutItems.find(s => s.dishId === item.dishId))
    return
  }
  
  // ...继续提交
}
```

---

## 六、实时同步策略

### 6.1 主方案：SSE 订阅

**文件**: `src/views/OrderFormView.vue` / `CustomerOrderView.vue`

```typescript
onMounted(() => {
  loadData()
  
  // 尝试 SSE 实时订阅
  subscribeToDishes((updatedDish) => {
    const idx = dishes.value.findIndex(d => d.id === updatedDish.id)
    if (idx !== -1) {
      dishes.value[idx] = { ...dishes.value[idx], ...updatedDish }
    }
    
    // 如果购物车中有这道菜且被标记为售罄，弹出提示
    const cartItem = cart.value.find(c => c.dishId === updatedDish.id)
    if (cartItem && updatedDish.soldOut) {
      toast.warning(`"${updatedDish.name}" 已售罄，请从购物车移除`)
    }
  }).catch(() => {
    // SSE 失败：降级为 10 秒轮询
    startPolling(loadData, 10000)
  })
})
```

### 6.2 降级方案：可见性变化时刷新

```typescript
// 页面从后台切回前台时，强制刷新菜品列表
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    loadData()
  }
})
```

### 6.3 缓存策略调整

**文件**: `src/api/pocketbase.ts`

```typescript
async getDishes(): Promise<ListResult<Dish>> {
  // 原有 60 秒缓存必须移除或大幅缩短
  // 方案 A：完全移除（推荐，66 道菜数据量极小）
  const url = `${PB_URL}/collections/${COLLECTION_DISHES}/records?perPage=100&sort=name`
  const res = await privateRequest<ListResult<Dish>>(url)
  if (!res) throw new APIError('获取菜品列表失败', 500)
  return res

  // 方案 B：如需保留缓存，缩短至 3 秒
  // apiCache.set(cacheKey, res, 3_000)
}
```

---

## 七、边界情况与异常处理

| 场景 | 处理方案 | 代码位置 |
|------|---------|----------|
| **购物车已有菜品，此时被沽清** | 菜品项变红提示，提交时拦截并自动移除 | `OrderFormView.submit()` / `CustomerOrderView.submitOrder()` |
| **顾客端离线期间菜品被沽清** | 重新联网提交时，后端 Hook 拦截并返回明确错误 | `pb_hooks/orders.pb.js` |
| **恶意请求直接调用 API 下单 soldOut 菜品** | PocketBase Hook 拦截，返回 400 | `pb_hooks/orders.pb.js` |
| **标记售罄后网络中断，撤销失败** | Toast 提示"网络异常，请手动恢复"，保留本地状态 | `OrderFormView.vue` 错误处理 |
| **凌晨自动重置时服务器宕机** | 启动后首次加载菜品时，检查「soldOutAt 是否为昨天」并自动恢复 | 可选：前端加载时判断 |
| **多人同时操作同一菜品** | PocketBase 行级锁保证最终一致性，SSE 推送最新状态 | PocketBase 原生支持 |

---

## 八、实施路线图（5 个工作日）

### Day 1：数据层 + 后端校验
- [ ] 创建迁移文件 `pb_migrations/1779xxxx_add_soldOut_to_dishes.js`
- [ ] 更新 `src/api/pocketbase.ts` 类型定义
- [ ] 更新 `pb_hooks/orders.pb.js` 增加 `validateItemsSoldOut`
- [ ] 更新 `server/src/services/dish.service.ts` 返回 soldOut 字段
- [ ] 本地测试：尝试下单 soldOut 菜品，验证被拦截

### Day 2：点菜页 + 撤销逻辑
- [ ] `src/views/OrderFormView.vue`：菜品卡片增加 soldOut 状态渲染
- [ ] 实现 `DishActionSheet` 组件（标记/恢复）
- [ ] 实现乐观更新 + Toast 撤销逻辑
- [ ] 购物车提交前校验 soldOut

### Day 3：全局入口 + 订单页入口
- [ ] 抽取 `SoldOutManager.vue` 通用抽屉组件
- [ ] `src/views/OrderListView.vue`：顶部增加「今日沽清」按钮 + 抽屉
- [ ] `src/views/OrderDetailView.vue`：菜品明细增加标记入口
- [ ] 实现「一键清空所有沽清」

### Day 4：顾客端 + 实时同步
- [ ] `src/views/CustomerOrderView.vue`：菜品列表接入 soldOut
- [ ] 实现 `subscribeToDishes` SSE 订阅
- [ ] 各端接入 SSE + 降级轮询
- [ ] 移除/缩短 DishAPI 缓存

### Day 5：自动恢复 + 测试
- [ ] `server/src/index.ts`：增加凌晨 4 点自动重置定时任务
- [ ] Vitest 单元测试：DishAPI.toggleSoldOut、购物车校验
- [ ] Playwright E2E：标记售罄 → 顾客端感知 → 下单拦截 → 撤销恢复
- [ ] 更新 `CODE_CHECKLIST.md` 和 `智能点菜系统-详细设计说明书.md`

---

## 九、测试验收清单

### 功能测试
- [ ] 在 OrderFormView 点击「⋯」→ 标记售罄 → 该菜品立即置灰
- [ ] 5 秒内点击 Toast「撤销」→ 菜品恢复可点
- [ ] 订单列表页「今日沽清」抽屉能正确列出/搜索/标记/恢复菜品
- [ ] 订单详情页菜品「⋯」菜单能标记该菜品售罄
- [ ] 顾客端看到 soldOut 菜品为灰色且不可点击
- [ ] 购物车包含 soldOut 菜品时，提交被拦截并提示
- [ ] 后端 Hook 拦截包含 soldOut 菜品的订单创建请求

### 实时同步测试
- [ ] 设备 A 标记售罄，设备 B（或同设备另一标签页）3 秒内看到更新
- [ ] SSE 断开时，自动降级为轮询，页面仍能刷新

### 边界测试
- [ ] 离线标记后恢复网络，撤销操作成功
- [ ] 尝试直接调用 API POST 包含 soldOut 菜品的订单，返回 400
- [ ] 凌晨 4 点后，前一日标记的 soldOut 菜品自动恢复

---

## 十、风险与对策

| 风险 | 概率 | 影响 | 对策 |
|------|------|------|------|
| SSE 在弱网环境不稳定 | 高 | 实时同步失效 | 降级为 10 秒轮询 + 页面可见性刷新 |
| 服务员误标记正常菜品 | 中 | 暂时无法售卖 | 「5 秒撤销」机制 + 订单列表页快速恢复 |
| 缓存导致 soldOut 延迟生效 | 中 | 已沽清仍可点 | 缩短缓存至 3 秒或移除 |
| 定时任务未执行（服务器关机） | 低 | 次日菜品仍处于 soldOut | 前端加载时检查 soldOutAt 日期，过期自动恢复 |
| PocketBase Hook 漏过校验 | 低 |  soldOut 菜品被下单 | Node.js 中间层二次校验兜底 |

---

> **总结**：沽清功能的核心不是技术复杂度，而是**「贴合小餐厅一人多岗的现实」**。入口要分散在每一个操作现场，交互要快过大脑反应，后端要默默兜底。做完后，服务员应该感觉"这道菜没了，点一下就没了，和我在纸上划掉一样简单"。
