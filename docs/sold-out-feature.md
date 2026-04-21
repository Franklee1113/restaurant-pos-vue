# 智能点菜系统 —— 沽清功能方案设计说明书

> **文档版本**: v1.0  
> **编写日期**: 2026-04-20  
> **适用系统**: restaurant-pos-vue v3.0  
> **目标场景**: 小型餐厅（≤15桌，一人多岗，无专职IT）

---

## 目录

1. [项目概述](#一项目概述)
2. [现状分析](#二现状分析)
3. [需求分析](#三需求分析)
4. [总体架构设计](#四总体架构设计)
5. [数据模型设计](#五数据模型设计)
6. [后端方案](#六后端方案)
7. [前端方案](#七前端方案)
8. [API 与数据流设计](#八api-与数据流设计)
9. [安全设计](#九安全设计)
10. [测试策略](#十测试策略)
11. [实施计划](#十一实施计划)
12. [风险评估与对策](#十二风险评估与对策)

---

## 一、项目概述

### 1.1 项目背景

当前系统（`restaurant-pos-vue v3.0`）的 `dishes` 集合仅有 `name`、`price`、`category`、`description` 四个字段，**缺少菜品可售状态管理**。对小型餐厅而言，这导致以下业务痛点：

- **高峰期误点**：中午鱼卖完了，前台和顾客端仍可正常点击下单，直到厨房接单才发现做不了
- **记忆依赖**：服务员需要在脑子里记"今天什么没了"，高峰期极易出错
- **无法预标记**：老板无法提前标记"今天没进货"的菜品，导致顾客反复询问
- **多设备不同步**：前台标记某菜售罄，顾客手机端仍显示可点

### 1.2 设计目标

| 目标 | 量化指标 | 说明 |
|------|---------|------|
| **零误点** | 沽清菜品被点的概率降至 <1% | 前端置灰 + 后端 Hook 双重拦截 |
| **秒级生效** | 标记后 1 秒内本地可见 | 乐观更新策略 |
| **多端同步** | 3 秒内所有在线设备感知 | SSE 实时推送 + 降级轮询 |
| **零培训成本** | 操作步骤 ≤2 步 | 一键标记/恢复，无需确认弹窗 |

### 1.3 核心约束

| 约束 | 说明 | 设计影响 |
|------|------|----------|
| **一人多岗** | 同一人可能同时是服务员、厨师、老板 | 不做角色权限隔离，全员可标记/恢复 |
| **设备极少** | 可能只有1台前台电脑 + 顾客手机 | SSE 必须有单设备降级，轮询兜底 |
| **网络不稳** | 家用路由器，可能断网/卡顿 | 操作必须本地立即可见，后端校验兜底 |
| **高峰期极忙** | 午市11:30-13:30，晚市17:30-20:00 | 禁止多层确认弹窗，用「可撤销」代替 |
| **无专职运维** | 不会手动备份，不会改数据库 | 凌晨自动重置沽清状态 |

---

## 二、现状分析

### 2.1 系统架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                         前端层 (Vue 3)                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ OrderFormView│  │OrderListView │  │ CustomerOrderView    │  │
│  │ (员工点菜)    │  │ (订单管理)    │  │ (顾客扫码点单)        │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
│  ┌──────┴───────┐  ┌──────┴───────┐  ┌──────────┴───────────┐  │
│  │OrderDetailView│  │KitchenDisplay│  │      SettingsView    │  │
│  │ (订单详情)    │  │ (厨房大屏)    │  │     (系统设置)        │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                    ┌────────┴────────┐
                    │   Pinia Store   │
                    │  (auth/settings) │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
┌───────▼───────┐   ┌────────▼────────┐  ┌──────▼──────┐
│  PocketBase   │   │  Node.js Fastify │  │   EventSource│
│   (BaaS)      │   │   (公共服务)      │  │   (SSE)      │
│  SQLite单文件  │   │  /public/dishes   │  │  Realtime    │
│               │   │  /public/orders   │  │              │
└───────────────┘   └──────────────────┘  └──────────────┘
```

### 2.2 现有数据模型

**`dishes` 集合当前字段：**

```typescript
export interface Dish {
  id: string
  name: string
  price: number
  category: string
  description?: string
}
```

**缺失字段**：可售状态、沽清备注、沽清时间。

### 2.3 现有 API 封装

| API 对象 | 方法 | 认证 | 缓存 |
|---------|------|------|------|
| `DishAPI` | `getDishes()` | ✅ 需登录 | 60 秒 TTL |
| `DishAPI` | `create/update/delete` | ✅ 需登录 | 操作后清除 |
| `PublicDishAPI` | `getDishes()` | ❌ 匿名 | ❌ 无缓存 |
| `DishService` (Node.js) | `getAll()` | ❌ 匿名 | ❌ 无缓存 |

**关键发现**：员工端 `DishAPI.getDishes()` 有 **60 秒缓存**，这是沽清功能的最大隐患——标记后缓存未过期，前台仍显示可售。

### 2.4 现有 Hook 逻辑

**`pb_hooks/orders.pb.js`** 当前职责：
- 订单创建前：金额重算（不信任前端金额）
- 订单更新前：检测菜品追加、状态推断、金额重算
- **缺失**：菜品可售性校验

### 2.5 现有 UI 组件

- **Toast 系统**：`useToast()` 提供基础 `show/success/error/warning/info`，**无 action 按钮支持**
- **确认对话框**：`useConfirm()` 提供全局确认弹窗，但高峰期禁用弹窗
- **Skeleton 加载**：`SkeletonBox.vue` 用于数据加载占位

### 2.6 实时通信现状

```typescript
// 当前已有：订单实时订阅
export async function subscribeToOrders(filter, onUpdate): Promise<() => void>

// 当前缺失：菜品实时订阅
export async function subscribeToDishes(onUpdate): Promise<() => void>  // ← 需新增
```

---

## 三、需求分析

### 3.1 功能需求

#### FR-1：菜品可售状态标记（P0 - 核心）

- 任何登录用户都可将任意菜品标记为「已沽清」或恢复为「可售」
- 标记后本地立即生效（乐观更新）
- 支持填写沽清备注（如"今天没进货"、"约30分钟后恢复"）

#### FR-2：前端视觉反馈（P0 - 核心）

- 沽清菜品在点菜页、顾客端置灰显示，不可点击
- 菜品卡片上显示「已沽清」标签
- 沽清备注在菜品卡片上可见（替代 description 显示）

#### FR-3：下单拦截（P0 - 核心）

- **前端拦截**：购物车/提交时检测沽清菜品，提示用户
- **后端拦截**：PocketBase Hook 在订单创建/更新时校验，soldOut 菜品直接拒绝
- **公共服务拦截**：Node.js 中间层二次校验

#### FR-4：撤销机制（P1 - 重要）

- 标记沽清后，Toast 提示带「撤销」按钮，10 秒内可恢复
- 订单列表页「今日沽清」抽屉可随时恢复任意菜品

#### FR-5：多端入口（P1 - 重要）

- **点菜页**（`OrderFormView`）：菜品卡片长按/右键菜单 → 标记沽清
- **订单列表页**（`OrderListView`）：顶部「今日沽清」按钮 → 抽屉管理
- **订单详情页**（`OrderDetailView`）：菜品明细「⋯」菜单 → 标记沽清
- ~~厨房大屏~~：**暂缓**，厨房核心职责是出菜，非库存管理

#### FR-6：实时同步（P1 - 重要）

- SSE 订阅菜品变更，3 秒内多端同步
- SSE 失败时自动降级为 10 秒轮询
- 页面从后台切回前台时强制刷新

#### FR-7：自动重置（P1 - 重要）

- 每日凌晨 04:00 自动恢复所有沽清菜品
- 前端加载时检查 `soldOutAt` 日期，跨天后自动恢复（兜底）

#### FR-8：顾客端适配（P1 - 重要）

- 顾客端菜品列表与员工端一致（置灰 + 标签）
- 购物车包含沽清菜品时，提交前弹窗提示替换/移除

#### FR-9：批量操作（P2 - 增强）

- 订单列表页抽屉支持按分类批量标记沽清
- 一键清空所有沽清

### 3.2 非功能需求

| 编号 | 需求 | 指标 |
|------|------|------|
| NFR-1 | 性能 | 菜品列表加载 ≤ 500ms（66 道菜数据量极小） |
| NFR-2 | 可用性 | 网络中断时本地操作仍可继续，恢复后同步 |
| NFR-3 | 兼容性 | 支持 Chrome/Edge/Safari/Firefox 最新 2 个版本 |
| NFR-4 | 数据一致性 | 最终一致性，PocketBase 行级锁保证 |
| NFR-5 | 可维护性 | 新增代码行数 ≤ 500 行，复用现有组件 ≥ 80% |

---

## 四、总体架构设计

### 4.1 架构分层

```
┌─────────────────────────────────────────────────────────────────┐
│                        表现层 (Presentation)                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Views: OrderFormView | OrderListView | OrderDetailView │   │
│  │  Components: DishCard | SoldOutDrawer | DishActionSheet │   │
│  └─────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│                        状态层 (State)                            │
│  ┌─────────────────────┐  ┌─────────────────────────────────┐ │
│  │  Pinia Stores       │  │  Local State (ref/computed)     │ │
│  │  (auth/settings)    │  │  dishes | cart | soldOutMap     │ │
│  └─────────────────────┘  └─────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│                        逻辑层 (Logic)                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │ Composables  │  │ Utils        │  │ Schemas              │ │
│  │ useToast     │  │ orderStatus  │  │ dish.schema (扩展)   │ │
│  │ useCart      │  │ security     │  │                      │ │
│  │ useAutoRefresh│  │              │  │                      │ │
│  └──────────────┘  └──────────────┘  └──────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│                        API 层 (API)                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │ DishAPI      │  │ PublicDishAPI│  │ subscribeToDishes    │ │
│  │ toggleSoldOut│  │ getDishes    │  │ (新增 SSE)           │ │
│  │ getDishes    │  │ (返回soldOut)│  │                      │ │
│  └──────────────┘  └──────────────┘  └──────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│                        服务层 (Service)                          │
│  ┌────────────────────┐  ┌──────────────────────────────────┐ │
│  │ PocketBase (BaaS)  │  │ Node.js Fastify (公共服务)        │ │
│  │ orders.pb.js Hook  │  │ DishService.getAll()             │ │
│  │ validateSoldOut    │  │ validateItems (扩展)             │ │
│  │ 自动重置定时任务    │  │                                  │ │
│  └────────────────────┘  └──────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│                        数据层 (Data)                             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  SQLite (PocketBase)                                    │   │
│  │  dishes.soldOut | dishes.soldOutNote | dishes.soldOutAt │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 关键设计决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 权限模型 | 全员可标记 | 小餐厅一人多岗，不需要 RBAC |
| 缓存策略 | 缩短至 3 秒，而非移除 | 保留性能收益，同时控制延迟 |
| 撤销机制 | 10 秒 Toast + 抽屉兜底 | 5 秒太短，10 秒覆盖转身招呼客人的场景 |
| 触发方式 | 长按/右键（移动端/桌面端） | 比「⋯」按钮可发现性高，误触率低 |
| 厨房大屏 | 暂缓增加入口 | 厨师职责是出菜，非库存管理 |
| 库存精度 | 布尔值为主，预留 `stockQty` | 当前需求是"有/无"，为未来精确库存预留扩展 |

---

## 五、数据模型设计

### 5.1 PocketBase 迁移

**文件**: `pb_migrations/1779xxxx_add_soldOut_to_dishes.js`

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

  // 预留：精确库存（未来扩展）
  collection.fields.add(new Field({
    name: 'stockQty',
    type: 'number',
    required: false,
  }))

  return db.saveCollection(collection)
})
```

### 5.2 TypeScript 类型定义

**文件**: `src/api/pocketbase.ts`

```typescript
export interface Dish {
  id: string
  name: string
  price: number
  category: string
  description?: string
  soldOut?: boolean        // 是否沽清
  soldOutNote?: string     // 沽清备注
  soldOutAt?: string       // ISO 时间，用于排序和追溯
  stockQty?: number        // 预留：精确库存
}

// 扩展 CreateOrderPayload 的前端校验
export interface CreateOrderPayload {
  // ... 现有字段
  items: OrderItem[]
}
```

### 5.3 权限规则

PocketBase `dishes` 集合保持现有规则：
- `listRule`: `@request.auth.id != ''`（登录用户可查看）
- `viewRule`: `@request.auth.id != ''`
- `createRule`: `@request.auth.id != ''`
- `updateRule`: `@request.auth.id != ''`（任何登录用户可修改）
- `deleteRule`: `@request.auth.id != ''`

> 小型餐厅不需要区分"谁能标记售罄"。防误触靠交互设计，不靠权限系统。

---

## 六、后端方案

### 6.1 PocketBase Hook：订单可售性校验

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

// ── onRecordBeforeCreateRequest ──
let items = parseJSONField(record, 'items', [])
validateItemsSoldOut(items)   // ← 新增：金额计算前校验
// ... 后续金额计算

// ── onRecordBeforeUpdateRequest ──
let newItems = parseJSONField(record, 'items', [])
validateItemsSoldOut(newItems)   // ← 新增：金额计算前校验
// ... 后续逻辑
```

**错误响应格式**：
```json
{ "message": "菜品 \"铁锅鱼\" 已售罄，无法下单" }
```

### 6.2 Node.js 公共服务扩展

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
  soldOutAt?: string       // 新增
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
      soldOut: r.soldOut || false,
      soldOutNote: r.soldOutNote || '',
      soldOutAt: r.soldOutAt || '',
    }))
  }

  static async validateItems(
    items: Array<{ dishId: string; name: string; price: number }>,
  ): Promise<void> {
    const dishIds = items.map((i) => i.dishId)
    const dishes = await this.getByIds(dishIds)

    if (dishes.length !== dishIds.length) {
      throw new NotFoundError('部分菜品不存在或已下架')
    }

    for (const item of items) {
      const dish = dishes.find((d) => d.id === item.dishId)
      if (!dish) {
        throw new NotFoundError(`菜品不存在: ${item.name}`)
      }
      if (dish.price !== item.price) {
        throw new Error(`菜品 "${item.name}" 价格异常，请刷新后重试`)
      }
      if (dish.soldOut) {
        throw new Error(`菜品 "${item.name}" 已售罄，请刷新后重试`)
      }
    }
  }
}
```

**文件**: `server/src/routes/public-dishes/index.ts`

无需改动，`DishService.getAll()` 已返回 soldOut 字段。

### 6.3 自动重置定时任务

**文件**: `server/src/jobs/resetSoldOut.ts`（新增）

```typescript
import { getPocketBase } from '../plugins/pocketbase'

let lastRunDate = ''

export function startSoldOutResetJob() {
  // 每分钟检查一次
  setInterval(async () => {
    const now = new Date()
    const today = now.toISOString().slice(0, 10)

    // 避免同一天重复执行
    if (lastRunDate === today) return
    if (now.getHours() !== 4) return

    const pb = getPocketBase()
    try {
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

      lastRunDate = today
      console.log(`[AutoReset] ${soldOutDishes.length} 道菜品已自动恢复售卖`)
    } catch (err) {
      console.error('[AutoReset] 自动重置失败:', err)
    }
  }, 60_000)
}
```

**文件**: `server/src/index.ts`

```typescript
import { startSoldOutResetJob } from './jobs/resetSoldOut'

// 在 main() 中，启动服务后调用
startSoldOutResetJob()
```

---

## 七、前端方案

### 7.1 API 层扩展

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

**文件**: `src/api/public-order.api.ts`

```typescript
export const PublicDishAPI = {
  async getDishes() {
    const res = await fetchWithTimeout(`${PB_URL}/public/dishes`)
    const data = await handleResponse<{
      items: Array<{
        id: string
        name: string
        price: number
        category: string
        description?: string
        soldOut?: boolean
        soldOutNote?: string
      }>
    }>(res)
    if (!data) throw new APIError('获取菜品失败', 500)
    return data
  },
}
```

### 7.2 缓存策略调整

**文件**: `src/api/pocketbase.ts`

```typescript
export const DishAPI = {
  async getDishes(): Promise<ListResult<Dish>> {
    const cacheKey = 'dishes:all'
    const cached = apiCache.get<ListResult<Dish>>(cacheKey)
    if (cached) return cached

    const url = `${PB_URL}/collections/${COLLECTION_DISHES}/records?perPage=100&sort=name`
    const res = await privateRequest<ListResult<Dish>>(url)
    if (!res) throw new APIError('获取菜品列表失败', 500)
    apiCache.set(cacheKey, res, 3_000)  // ← 从 60 秒缩短至 3 秒
    return res
  },
  // ...
}
```

### 7.3 组件设计

#### 7.3.1 DishCard 组件改造（核心改动）

**文件**: `src/views/OrderFormView.vue`（局部改造）

```vue
<template>
  <!-- 桌面端网格 -->
  <div class="hidden sm:grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3">
    <div
      v-for="dish in filteredDishes"
      :key="dish.id"
      :class="[
        'relative rounded-xl p-3 text-center border transition-all select-none',
        dish.soldOut
          ? 'bg-gray-100 opacity-60 cursor-not-allowed border-gray-200'
          : 'bg-gray-50 hover:shadow-md hover:-translate-y-0.5 border-transparent hover:border-blue-300'
      ]"
      @contextmenu.prevent="!dish.soldOut && openDishMenu(dish)"
      @touchstart.passive="handleTouchStart(dish)"
      @touchend.passive="handleTouchEnd"
    >
      <!-- 已售罄标签 -->
      <div
        v-if="dish.soldOut"
        class="absolute inset-x-0 bottom-3 flex items-center justify-center"
      >
        <span class="px-2 py-1 bg-red-500 text-white text-xs font-bold rounded-full shadow">
          已沽清
        </span>
      </div>

      <div
        class="font-semibold text-sm truncate"
        :class="dish.soldOut ? 'text-gray-400' : 'text-gray-800'"
      >
        {{ dish.name }}
      </div>
      <div
        class="text-xs truncate mb-2"
        :class="dish.soldOut ? 'text-gray-400' : 'text-gray-500'"
      >
        {{ dish.soldOut ? (dish.soldOutNote || '今日无货') : (dish.description || dish.category) }}
      </div>
      <div
        class="font-bold text-base mb-2"
        :class="dish.soldOut ? 'text-gray-400 line-through' : 'text-red-500'"
      >
        {{ dish.soldOut ? '—' : MoneyCalculator.format(dish.price) }}
      </div>

      <!-- 已沽清时占据按钮位置，保持卡片高度一致 -->
      <div
        v-if="dish.soldOut"
        class="w-full py-1.5 bg-gray-200 text-gray-500 text-xs rounded-full"
      >
        已沽清
      </div>
      <button
        v-else
        class="w-full py-1.5 bg-blue-600 text-white text-xs rounded-full hover:bg-blue-700 active:scale-95 transition-transform"
        @click="addToCart(dish)"
      >
        + 添加
      </button>
    </div>
  </div>
</template>
```

**长按交互逻辑**：

```typescript
// OrderFormView.vue script
let longPressTimer: ReturnType<typeof setTimeout> | null = null
const LONG_PRESS_DURATION = 600

function handleTouchStart(dish: Dish) {
  if (dish.soldOut) return
  longPressTimer = setTimeout(() => {
    openDishMenu(dish)
    longPressTimer = null
  }, LONG_PRESS_DURATION)
}

function handleTouchEnd() {
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
}
```

#### 7.3.2 DishActionSheet 组件（新增）

**文件**: `src/components/DishActionSheet.vue`

```vue
<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="fixed inset-0 z-50" @click="$emit('close')">
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" />
        <div
          class="absolute bottom-0 left-0 right-0 bg-white rounded-t-xl p-4 space-y-2 animate-slide-up"
          @click.stop
        >
          <div class="w-12 h-1 bg-gray-300 rounded-full mx-auto mb-3" />
          <div class="text-center text-sm text-gray-500 pb-2">
            {{ dish?.name }} — ¥{{ dish?.price }}
          </div>

          <button
            v-if="!dish?.soldOut"
            class="w-full py-3.5 text-red-600 font-medium bg-red-50 rounded-xl hover:bg-red-100 active:scale-[0.98] transition-transform"
            @click="$emit('mark-sold-out')"
          >
            ⚠️ 标记为"已沽清"
          </button>

          <button
            v-else
            class="w-full py-3.5 text-green-600 font-medium bg-green-50 rounded-xl hover:bg-green-100 active:scale-[0.98] transition-transform"
            @click="$emit('mark-available')"
          >
            ✅ 恢复售卖
          </button>

          <button
            class="w-full py-3.5 text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 active:scale-[0.98] transition-transform"
            @click="$emit('close')"
          >
            取消
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import type { Dish } from '@/api/pocketbase'

defineProps<{
  open: boolean
  dish: Dish | null
}>()

defineEmits<{
  (e: 'close'): void
  (e: 'mark-sold-out'): void
  (e: 'mark-available'): void
}>()
</script>
```

#### 7.3.3 SoldOutDrawer 组件（新增，可复用）

**文件**: `src/components/SoldOutDrawer.vue`

```vue
<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="fixed inset-0 z-50" @click="$emit('close')">
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" />
        <div
          class="absolute right-0 top-0 bottom-0 w-80 max-w-[85vw] bg-white shadow-2xl p-4 flex flex-col"
          @click.stop
        >
          <!-- Header -->
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-bold text-lg">今日沽清</h3>
            <button
              class="p-1.5 rounded-full hover:bg-gray-100 transition-colors"
              @click="$emit('close')"
            >
              ✕
            </button>
          </div>

          <!-- Search -->
          <input
            v-model="searchQuery"
            placeholder="搜索菜品"
            class="w-full px-3 py-2 border rounded-lg text-sm mb-3 focus:ring-2 focus:ring-blue-300 focus:outline-none"
          />

          <!-- Category Filter -->
          <div class="flex gap-2 mb-3 overflow-x-auto pb-1">
            <button
              v-for="cat in categories"
              :key="cat"
              :class="[
                'px-2.5 py-1 text-xs rounded-full whitespace-nowrap transition-colors',
                activeCategory === cat
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              ]"
              @click="activeCategory = cat"
            >
              {{ cat }}
            </button>
          </div>

          <!-- List -->
          <div class="flex-1 overflow-y-auto space-y-1.5">
            <div
              v-for="dish in filteredDishes"
              :key="dish.id"
              class="flex items-center justify-between p-3 rounded-lg transition-colors"
              :class="dish.soldOut ? 'bg-red-50' : 'bg-gray-50 hover:bg-gray-100'"
            >
              <div class="min-w-0">
                <div class="text-sm font-medium truncate">{{ dish.name }}</div>
                <div class="text-xs text-gray-500">{{ dish.category }}</div>
                <div v-if="dish.soldOutNote" class="text-xs text-red-400 mt-0.5">
                  {{ dish.soldOutNote }}
                </div>
              </div>
              <button
                v-if="!dish.soldOut"
                class="ml-2 px-2.5 py-1.5 text-xs bg-red-100 text-red-600 rounded-lg hover:bg-red-200 active:scale-95 transition-transform shrink-0"
                @click="$emit('toggle', dish.id, true)"
              >
                标记
              </button>
              <button
                v-else
                class="ml-2 px-2.5 py-1.5 text-xs bg-green-100 text-green-600 rounded-lg hover:bg-green-200 active:scale-95 transition-transform shrink-0"
                @click="$emit('toggle', dish.id, false)"
              >
                恢复
              </button>
            </div>
          </div>

          <!-- Footer -->
          <div class="pt-3 border-t mt-3 space-y-2">
            <button
              class="w-full py-2.5 text-sm text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 active:scale-[0.98] transition-transform"
              @click="$emit('reset-all')"
            >
              ⚡ 一键清空所有沽清
            </button>
            <div class="text-xs text-gray-400 text-center">
              每日凌晨 04:00 自动清空
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Dish } from '@/api/pocketbase'

const props = defineProps<{
  open: boolean
  dishes: Dish[]
}>()

defineEmits<{
  (e: 'close'): void
  (e: 'toggle', id: string, soldOut: boolean): void
  (e: 'reset-all'): void
}>()

const searchQuery = ref('')
const activeCategory = ref('全部')

const categories = computed(() => {
  const cats = new Set(props.dishes.map((d) => d.category))
  return ['全部', ...Array.from(cats)]
})

const filteredDishes = computed(() => {
  let list = props.dishes
  if (activeCategory.value !== '全部') {
    list = list.filter((d) => d.category === activeCategory.value)
  }
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase()
    list = list.filter((d) => d.name.toLowerCase().includes(q))
  }
  return list
})
</script>
```

### 7.4 视图层改造

#### 7.4.1 OrderFormView.vue（点菜页）

**新增逻辑**：

```typescript
import DishActionSheet from '@/components/DishActionSheet.vue'

// 状态
const actionSheetOpen = ref(false)
const selectedDish = ref<Dish | null>(null)
const recentSoldOutIds = ref<Set<string>>(new Set())  // 跟踪最近标记的菜品，用于撤销

// 打开菜单
function openDishMenu(dish: Dish) {
  selectedDish.value = dish
  actionSheetOpen.value = true
}

// 标记沽清
async function markDishSoldOut(dish: Dish) {
  const originalState = { ...dish }
  const idx = dishes.value.findIndex((d) => d.id === dish.id)
  if (idx === -1) return

  // 乐观更新
  dishes.value[idx] = { ...dish, soldOut: true, soldOutAt: new Date().toISOString() }
  recentSoldOutIds.value.add(dish.id)

  actionSheetOpen.value = false

  try {
    await DishAPI.toggleSoldOut(dish.id, true)
    toast.success(`"${dish.name}" 已标记沽清`, {
      duration: 10_000,
    })
  } catch (err) {
    // 失败回滚
    dishes.value[idx] = originalState
    recentSoldOutIds.value.delete(dish.id)
    toast.error('标记失败: ' + (err instanceof Error ? err.message : '未知错误'))
  }
}

// 恢复售卖
async function markDishAvailable(dish: Dish) {
  const originalState = { ...dish }
  const idx = dishes.value.findIndex((d) => d.id === dish.id)
  if (idx === -1) return

  dishes.value[idx] = { ...dish, soldOut: false, soldOutNote: '', soldOutAt: undefined }
  recentSoldOutIds.value.delete(dish.id)

  actionSheetOpen.value = false

  try {
    await DishAPI.toggleSoldOut(dish.id, false)
    toast.success(`"${dish.name}" 已恢复售卖`)
  } catch (err) {
    dishes.value[idx] = originalState
    recentSoldOutIds.value.add(dish.id)
    toast.error('恢复失败: ' + (err instanceof Error ? err.message : '未知错误'))
  }
}

// 购物车提交前校验
function validateCartBeforeSubmit(): boolean {
  const soldOutItems = cart.value.filter((item) => {
    const dish = dishes.value.find((d) => d.id === item.dishId)
    return dish?.soldOut
  })

  if (soldOutItems.length > 0) {
    toast.error(`以下菜品已沽清，请移除后重试：${soldOutItems.map((i) => i.name).join('、')}`)
    return false
  }
  return true
}
```

#### 7.4.2 OrderListView.vue（订单列表页）

**新增逻辑**：

```vue
<template>
  <!-- Header 区域新增按钮 -->
  <div class="flex items-center gap-2">
    <button
      class="px-3 py-2 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-sm font-medium hover:bg-amber-100 active:scale-95 transition-transform"
      @click="soldOutDrawerOpen = true"
    >
      📋 今日沽清
      <span v-if="soldOutCount > 0" class="ml-1 text-xs bg-amber-200 px-1.5 py-0.5 rounded-full">
        {{ soldOutCount }}
      </span>
    </button>
  </div>

  <!-- 沽清管理抽屉 -->
  <SoldOutDrawer
    :open="soldOutDrawerOpen"
    :dishes="allDishes"
    @close="soldOutDrawerOpen = false"
    @toggle="handleToggleSoldOut"
    @reset-all="handleResetAll"
  />
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { DishAPI, type Dish } from '@/api/pocketbase'
import SoldOutDrawer from '@/components/SoldOutDrawer.vue'

const soldOutDrawerOpen = ref(false)
const allDishes = ref<Dish[]>([])

const soldOutCount = computed(() => allDishes.value.filter((d) => d.soldOut).length)

async function handleToggleSoldOut(id: string, soldOut: boolean) {
  const idx = allDishes.value.findIndex((d) => d.id === id)
  if (idx === -1) return

  const dish = allDishes.value[idx]
  const original = { ...dish }

  // 乐观更新
  allDishes.value[idx] = { ...dish, soldOut, soldOutAt: soldOut ? new Date().toISOString() : undefined }

  try {
    await DishAPI.toggleSoldOut(id, soldOut)
    toast.success(`"${dish.name}" 已${soldOut ? '标记沽清' : '恢复售卖'}`)
  } catch (err) {
    allDishes.value[idx] = original
    toast.error('操作失败: ' + (err instanceof Error ? err.message : '未知错误'))
  }
}

async function handleResetAll() {
  const soldOutDishes = allDishes.value.filter((d) => d.soldOut)
  if (soldOutDishes.length === 0) {
    toast.info('当前没有沽清菜品')
    return
  }

  try {
    // 并行恢复
    await Promise.all(soldOutDishes.map((d) => DishAPI.toggleSoldOut(d.id, false)))
    allDishes.value = allDishes.value.map((d) =>
      d.soldOut ? { ...d, soldOut: false, soldOutNote: '', soldOutAt: undefined } : d,
    )
    toast.success(`已恢复 ${soldOutDishes.length} 道菜品`)
  } catch (err) {
    toast.error('批量恢复失败: ' + (err instanceof Error ? err.message : '未知错误'))
  }
}
</script>
```

#### 7.4.3 OrderDetailView.vue（订单详情页）

**新增逻辑**：

```vue
<template>
  <!-- 在菜品列表循环中 -->
  <div
    v-for="item in order.items"
    :key="item.dishId"
    class="flex items-center justify-between py-2"
  >
    <div class="flex items-center gap-2">
      <div class="text-sm font-medium">{{ item.name }}</div>
      <span
        v-if="dishMap[item.dishId]?.soldOut"
        class="px-1.5 py-0.5 bg-red-100 text-red-600 text-xs rounded"
      >
        已沽清
      </span>
    </div>
    <div class="flex items-center gap-2">
      <div class="text-sm font-semibold">¥{{ item.price * item.quantity }}</div>
      <button
        class="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
        @click="openItemMenu(item)"
      >
        ⋯
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
// 加载菜品数据用于显示 soldOut 状态
const dishMap = computed(() => {
  const map: Record<string, Dish> = {}
  // 实际实现中需加载 dishes 数据
  return map
})
</script>
```

#### 7.4.4 CustomerOrderView.vue（顾客端）

**改造要点**：
- 菜品列表渲染与员工端一致（置灰 + 标签）
- 购物车提交前校验：不自动移除，而是弹窗提示替换/移除

```typescript
async function submitOrder() {
  const soldOutItems = cart.value.filter((item) => {
    const dish = dishes.value.find((d) => d.id === item.dishId)
    return dish?.soldOut
  })

  if (soldOutItems.length > 0) {
    // 弹窗提示，让用户选择替换或移除
    showSoldOutDialog(soldOutItems)
    return
  }

  // ...继续提交
}
```

### 7.5 实时同步

**各视图通用逻辑**（以 OrderFormView 为例）：

```typescript
import { subscribeToDishes } from '@/api/pocketbase'
import { useAutoRefresh } from '@/composables/useAutoRefresh'

const unsubscribeRealtime = ref<(() => void) | null>(null)
const { start: startPolling, stop: stopPolling } = useAutoRefresh(loadDishes, {
  interval: 10_000,
  immediate: false,
})

onMounted(async () => {
  await loadDishes()

  // 尝试 SSE
  try {
    const unsub = await subscribeToDishes((updatedDish) => {
      const idx = dishes.value.findIndex((d) => d.id === updatedDish.id)
      if (idx !== -1) {
        dishes.value[idx] = { ...dishes.value[idx], ...updatedDish }
      }

      // 如果购物车中有这道菜且被标记为沽清，弹出提示
      const cartItem = cart.value.find((c) => c.dishId === updatedDish.id)
      if (cartItem && updatedDish.soldOut) {
        toast.warning(`"${updatedDish.name}" 已沽清，请从购物车移除`)
      }
    })
    unsubscribeRealtime.value = unsub
  } catch {
    // SSE 失败，降级为轮询
    startPolling()
  }

  // 页面可见性变化时刷新
  document.addEventListener('visibilitychange', onVisibilityChange)
})

onUnmounted(() => {
  unsubscribeRealtime.value?.()
  stopPolling()
  document.removeEventListener('visibilitychange', onVisibilityChange)
})

function onVisibilityChange() {
  if (document.visibilityState === 'visible') {
    loadDishes()
  }
}
```

---

## 八、API 与数据流设计

### 8.1 API 变更汇总

| API | 变更 | 说明 |
|-----|------|------|
| `DishAPI.getDishes()` | 缓存 TTL 60s → 3s | 减少沽清延迟 |
| `DishAPI.toggleSoldOut()` | 新增 | PATCH 菜品 soldOut 状态 |
| `subscribeToDishes()` | 新增 | SSE 订阅菜品变更 |
| `PublicDishAPI.getDishes()` | 扩展返回字段 | 增加 `soldOut`, `soldOutNote` |
| `DishService.getAll()` | 扩展返回字段 | 增加 `soldOut`, `soldOutNote`, `soldOutAt` |
| `DishService.validateItems()` | 扩展校验逻辑 | 增加 soldOut 校验 |

### 8.2 数据流时序图

#### 场景1：员工标记菜品沽清

```
┌─────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────────┐
│ 员工     │     │ OrderFormView │     │ DishAPI      │     │ PocketBase   │
└────┬────┘     └──────┬───────┘     └──────┬──────┘     └──────┬───────┘
     │                 │                    │                    │
     │ 长按菜品卡片     │                    │                    │
     │────────────────>│                    │                    │
     │                 │                    │                    │
     │                 │ 乐观更新 UI         │                    │
     │                 │ (dish.soldOut=true)│                    │
     │                 │──────┐             │                    │
     │                 │<─────┘             │                    │
     │                 │                    │                    │
     │                 │ PATCH /dishes/:id  │                    │
     │                 │───────────────────>│                    │
     │                 │                    │                    │
     │                 │                    │ PATCH /collections/│
     │                 │                    │ dishes/records/:id │
     │                 │                    │───────────────────>│
     │                 │                    │                    │
     │                 │                    │ 返回更新后记录       │
     │                 │                    │<───────────────────│
     │                 │                    │                    │
     │                 │ 返回 Dish          │                    │
     │                 │<───────────────────│                    │
     │                 │                    │                    │
     │                 │ apiCache.clear()   │                    │
     │                 │──────┐             │                    │
     │                 │<─────┘             │                    │
     │                 │                    │                    │
     │                 │ Toast 提示「撤销」  │                    │
     │                 │ (10秒)             │                    │
     │<────────────────│                    │                    │
     │                 │                    │                    │
     │ 点击撤销         │                    │                    │
     │────────────────>│                    │                    │
     │                 │                    │                    │
     │                 │ 乐观恢复 UI         │                    │
     │                 │ PATCH /dishes/:id  │                    │
     │                 │ (soldOut=false)    │                    │
     │                 │────────────────────────────────────────>│
```

#### 场景2：多端实时同步

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ 设备A(前台)   │     │ PocketBase   │     │ 设备B(顾客端) │     │ 设备C(厨房)   │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │                    │
       │ 标记铁锅鱼沽清      │                    │                    │
       │───────────────────>│                    │                    │
       │                    │                    │                    │
       │                    │ SSE 推送变更       │                    │
       │                    │───────────────────>│                    │
       │                    │                    │                    │
       │                    │ SSE 推送变更       │                    │
       │                    │────────────────────────────────────────>│
       │                    │                    │                    │
       │                    │                    │ 菜品置灰            │
       │                    │                    │──────┐             │
       │                    │                    │<─────┘             │
       │                    │                    │                    │
       │                    │                    │                    │ 菜品置灰
       │                    │                    │                    │──────┐
       │                    │                    │                    │<─────┘
```

#### 场景3：顾客尝试下单沽清菜品

```
┌─────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌──────────────┐
│ 顾客     │     │ CustomerOrderView│     │ PublicOrderAPI  │     │ pb_hooks     │
└────┬────┘     └────────┬────────┘     └────────┬────────┘     └──────┬───────┘
     │                   │                       │                    │
     │ 点击提交订单       │                       │                    │
     │──────────────────>│                       │                    │
     │                   │                       │                    │
     │                   │ 购物车包含铁锅鱼       │                    │
     │                   │ dishes 中铁锅鱼.soldOut=true │               │
     │                   │                       │                    │
     │                   │ 前端拦截               │                    │
     │                   │ 弹窗：铁锅鱼已沽清      │                    │
     │                   │ 请选择替换或移除        │                    │
     │<──────────────────│                       │                    │
     │                   │                       │                    │
     │ 用户绕过前端        │                       │                    │
     │ 直接调用 API        │                       │                    │
     │                   │                       │                    │
     │                   │                       │ POST /orders       │
     │                   │                       │───────────────────>│
     │                   │                       │                    │
     │                   │                       │                    │ validateItemsSoldOut()
     │                   │                       │                    │ 发现铁锅鱼 soldOut=true
     │                   │                       │                    │
     │                   │                       │ 400 错误响应        │
     │                   │                       │<───────────────────│
     │                   │                       │                    │
     │                   │                       │ 抛出 APIError      │
     │                   │                       │                    │
     │                   │ 显示错误提示           │                    │
     │<──────────────────│                       │                    │
```

---

## 九、安全设计

### 9.1 防御矩阵

| 威胁 | 防御层 | 实现方式 |
|------|--------|---------|
| **前端绕过直接调用 API** | 后端 Hook | `pb_hooks/orders.pb.js` 校验 `soldOut` |
| **Hook 被绕过** | 中间层校验 | `DishService.validateItems()` 二次校验 |
| **缓存导致延迟生效** | 缓存控制 | TTL 缩短至 3 秒，`toggleSoldOut` 后 `clear()` |
| **恶意批量标记** | 频率限制 | Fastify `rate-limit` 插件已配置（1分钟 max 请求） |
| **XSS 通过 soldOutNote** | 输出编码 | Vue 模板自动转义，`v-html` 不使用 |
| **SQL/Filter 注入** | 参数转义 | `escapePbString()` 已有实现 |
| **未认证用户修改菜品** | 认证校验 | `privateRequest` 强制校验 Token |

### 9.2 权限安全

- `dishes` 集合的 `updateRule` 保持 `@request.auth.id != ''`
- 任何登录用户都可标记/恢复，符合"一人多岗"约束
- **不开放匿名修改**，顾客端只能读取不能修改

### 9.3 数据一致性安全

- PocketBase 行级锁保证并发修改的最终一致性
- 乐观更新失败时自动回滚（try/catch + 状态恢复）
- SSE 断线重连后自动重新订阅

---

## 十、测试策略

### 10.1 单元测试（Vitest）

| 测试文件 | 覆盖内容 | 预期用例数 |
|---------|---------|-----------|
| `src/api/__tests__/pocketbase.spec.ts` | `DishAPI.toggleSoldOut`、缓存清除、`subscribeToDishes` | +5 |
| `src/components/__tests__/DishActionSheet.spec.ts` | 渲染、emit 事件 | 6 |
| `src/components/__tests__/SoldOutDrawer.spec.ts` | 搜索过滤、分类过滤、emit 事件 | 8 |
| `src/views/__tests__/OrderFormView.spec.ts` | 长按交互、购物车沽清校验、乐观更新 | +8 |
| `src/views/__tests__/OrderDetailView.spec.ts` | 菜品 soldOut 标签渲染 | +3 |

### 10.2 E2E 测试（Playwright）

| 场景 | 测试步骤 |
|------|---------|
| **标记沽清 → 本地生效** | 1. 登录 2. 进入点菜页 3. 长按菜品 4. 点击标记 5. 断言卡片置灰 |
| **多端同步** | 1. 设备A标记沽清 2. 设备B刷新页面 3. 断言菜品置灰 |
| **下单拦截** | 1. 将购物车菜品标记沽清 2. 点击提交 3. 断言错误提示 |
| **后端兜底** | 1. 绕过前端直接调用 API 创建含 soldOut 菜品的订单 2. 断言 400 错误 |
| **自动重置** | 1. 标记菜品沽清 2. 修改系统时间到次日 04:00 后 3. 断言自动恢复 |
| **撤销机制** | 1. 标记沽清 2. 点击 Toast 撤销 3. 断言恢复可售 |

### 10.3 测试 Mock 策略

```typescript
// Vitest mock 示例
vi.mock('@/api/pocketbase', async () => {
  const actual = await vi.importActual<typeof import('@/api/pocketbase')>('@/api/pocketbase')
  return {
    ...actual,
    DishAPI: {
      ...actual.DishAPI,
      toggleSoldOut: vi.fn(),
    },
    subscribeToDishes: vi.fn(() => Promise.resolve(() => {})),
  }
})
```

---

## 十一、实施计划

### 11.1 任务分解（6 个工作日）

#### Day 1：数据层 + 后端校验

| 任务 | 文件 | 工时 |
|------|------|------|
| 创建迁移文件 | `pb_migrations/1779xxxx_add_soldOut_to_dishes.js` | 1h |
| 更新 TypeScript 类型 | `src/api/pocketbase.ts` (Dish 接口) | 0.5h |
| PocketBase Hook 增加校验 | `pb_hooks/orders.pb.js` | 2h |
| 更新 DishService | `server/src/services/dish.service.ts` | 1h |
| 本地测试：下单 soldOut 菜品被拦截 | — | 1h |

**Day 1 交付标准**：尝试通过 API 直接 POST 含 soldOut 菜品的订单，返回 400 错误。

#### Day 2：点菜页 + 基础交互

| 任务 | 文件 | 工时 |
|------|------|------|
| 改造 DishCard 渲染 | `src/views/OrderFormView.vue` (template) | 2h |
| 实现长按/右键交互 | `src/views/OrderFormView.vue` (script) | 1.5h |
| 新增 DishActionSheet 组件 | `src/components/DishActionSheet.vue` | 1.5h |
| 实现乐观更新 + 错误回滚 | `src/views/OrderFormView.vue` | 1h |
| 购物车提交前校验 | `src/views/OrderFormView.vue` | 0.5h |

**Day 2 交付标准**：在点菜页长按菜品 → 标记沽清 → 卡片立即置灰 → 刷新页面后状态保持。

#### Day 3：全局入口 + 订单页

| 任务 | 文件 | 工时 |
|------|------|------|
| 新增 SoldOutDrawer 组件 | `src/components/SoldOutDrawer.vue` | 2h |
| 订单列表页接入抽屉 | `src/views/OrderListView.vue` | 1.5h |
| 订单详情页菜品 soldOut 标签 | `src/views/OrderDetailView.vue` | 1h |
| 实现一键清空 | `src/views/OrderListView.vue` | 0.5h |
| 按分类批量标记（可选） | `src/components/SoldOutDrawer.vue` | 1h |

**Day 3 交付标准**：订单列表页「今日沽清」抽屉可列出/搜索/标记/恢复菜品。

#### Day 4：顾客端 + 实时同步

| 任务 | 文件 | 工时 |
|------|------|------|
| 顾客端菜品列表接入 soldOut | `src/views/CustomerOrderView.vue` | 1.5h |
| 顾客端购物车冲突处理 | `src/views/CustomerOrderView.vue` | 2h |
| 实现 `subscribeToDishes` | `src/api/pocketbase.ts` | 1h |
| 各端接入 SSE + 降级轮询 | `OrderFormView.vue`, `CustomerOrderView.vue` | 1.5h |

**Day 4 交付标准**：设备 A 标记沽清，设备 B 3 秒内看到更新；SSE 断开后自动降级轮询。

#### Day 5：缓存调整 + 自动重置

| 任务 | 文件 | 工时 |
|------|------|------|
| 缩短 DishAPI 缓存至 3 秒 | `src/api/pocketbase.ts` | 0.5h |
| 新增自动重置定时任务 | `server/src/jobs/resetSoldOut.ts` | 1.5h |
| 接入服务启动 | `server/src/index.ts` | 0.5h |
| 前端 soldOutAt 日期兜底 | `OrderFormView.vue` 加载逻辑 | 1h |
| 缓存清除逻辑验证 | — | 1h |

**Day 5 交付标准**：标记沽清后 3 秒内其他页面不再读到缓存旧数据；定时任务每分钟检查并在 04:00 执行重置。

#### Day 6：测试 + 文档

| 任务 | 文件 | 工时 |
|------|------|------|
| Vitest 单元测试 | `src/api/__tests__`, `src/components/__tests__` | 2h |
| Playwright E2E 测试 | `e2e/sold-out.spec.ts` | 2h |
| 更新设计文档 | `docs/SOLD_OUT_FEATURE_SPEC.md` | 0.5h |
| 更新变更日志 | `CHANGELOG.md` | 0.5h |

**Day 6 交付标准**：全量测试通过（282+ 用例），新增测试覆盖率达 80% 以上。

### 11.2 依赖关系图

```
Day 1 ──> Day 2 ──> Day 3 ──> Day 4 ──> Day 5 ──> Day 6
  │         │         │         │         │
  │         │         │         │         └─ 缓存调整依赖 API 完成
  │         │         │         └─ 实时同步依赖全局入口
  │         │         └─ 订单页入口依赖 ActionSheet
  │         └─ 点菜页是基础，其他入口复用其逻辑
  └─ 数据层是所有功能的基础
```

---

## 十二、风险评估与对策

### 12.1 风险矩阵

| 风险 | 概率 | 影响 | 对策 | 负责人 |
|------|------|------|------|--------|
| SSE 在弱网环境不稳定 | **高** | 实时同步失效 | 降级为 10 秒轮询 + `visibilitychange` 刷新 | 前端 |
| 服务员误标记正常菜品 | **中** | 暂时无法售卖 | 10 秒 Toast 撤销 + 抽屉快速恢复 | 前端 |
| 缓存导致 soldOut 延迟生效 | **中** | 已沽清仍可点 | TTL 缩短至 3 秒 + toggle 后立即 clear | 前端 |
| 定时任务未执行（服务器关机） | **低** | 次日仍 soldOut | 前端加载时检查 soldOutAt 日期 | 前端 |
| PocketBase Hook 漏过校验 | **低** | soldOut 菜品被下单 | Node.js 中间层二次校验兜底 | 后端 |
| 长按交互误触率过高 | **中** | 频繁弹出菜单 | 600ms 阈值 + 视觉反馈（震动/缩放） | 前端 |
| 顾客端弹窗打断下单流程 | **中** | 转化率下降 | 提供"替换推荐"按钮，减少操作步骤 | 前端 |
| 数据迁移失败 | **低** | 现有菜品数据丢失 | 先在测试环境执行，备份数据库 | 运维 |

### 12.2 回滚方案

> ⚠️ **关键前提**：生产环境 PocketBase 以 systemd 服务运行，数据位于 `/opt/pocketbase/pb_data/`，前端位于 `/var/www/restaurant-pos/`，pb_hooks 和 pb_migrations 位于 `/opt/pocketbase/` 下。回滚操作需要 `sudo` 权限。

#### 12.2.1 部署前必做备份清单

在部署沽清功能前，必须完成以下备份：

```bash
# 1. 数据库全量备份（PB 是 SQLite 单文件，直接复制即可）
BACKUP_TIME=$(date +%Y%m%d-%H%M%S)
sudo mkdir -p /var/backups/pb-pre-soldout-${BACKUP_TIME}
sudo cp /opt/pocketbase/pb_data/data.db /var/backups/pb-pre-soldout-${BACKUP_TIME}/
sudo cp -r /opt/pocketbase/pb_hooks /var/backups/pb-pre-soldout-${BACKUP_TIME}/
sudo cp -r /opt/pocketbase/pb_migrations /var/backups/pb-pre-soldout-${BACKUP_TIME}/
echo "✅ 备份完成: /var/backups/pb-pre-soldout-${BACKUP_TIME}/"

# 2. 前端备份（deploy.sh 会自动做，但建议手动确认）
ls -la /var/www/restaurant-pos-backups/pre-* | tail -3

# 3. 记录当前 Git 版本
cd /var/www/restaurant-pos-vue && git rev-parse HEAD > /tmp/pre-soldout-git-sha.txt
cat /tmp/pre-soldout-git-sha.txt
```

#### 12.2.2 回滚策略分级

| 回滚级别 | 适用场景 | 数据影响 | 回滚时间 |
|---------|---------|---------|---------|
| **L1 - 快速回滚（推荐）** | 前端 Bug、交互异常、性能问题 | **保留** soldOut 字段和数据 | ≤ 2 分钟 |
| **L2 - 代码回滚** | Hook 逻辑错误、API 异常 | **保留** soldOut 字段和数据 | ≤ 5 分钟 |
| **L3 - 完全回滚** | 数据库迁移导致数据损坏、严重兼容问题 | **删除** soldOut 字段 | ≤ 10 分钟 |

#### 12.2.3 L1 - 快速回滚（只回滚前端静态资源）

**适用场景**：页面白屏、样式错乱、长按误触率过高、Vue 组件报错。

```bash
# 找到最近的部署备份
LATEST_BACKUP=$(ls -td /var/www/restaurant-pos-backups/pre-* | head -1)
echo "使用备份: $LATEST_BACKUP"

# 回滚前端文件
sudo rm -rf /var/www/restaurant-pos/assets /var/www/restaurant-pos/index.html
sudo cp -r "${LATEST_BACKUP}/assets" /var/www/restaurant-pos/
sudo cp "${LATEST_BACKUP}/index.html" /var/www/restaurant-pos/
sudo systemctl restart nginx

# 验证
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1/  # 应返回 200
echo "✅ L1 回滚完成，soldOut 字段数据保留，后端功能正常"
```

> **数据兼容性说明**：回滚前端代码后，soldOut 字段仍存在于数据库中，PocketBase 返回的 JSON 会多几个字段，但旧版前端代码会**静默忽略**未知字段（Vue/JS 对象不会报错），因此完全安全。

#### 12.2.4 L2 - 代码回滚（前端 + pb_hooks + public-api）

**适用场景**：Hook 校验逻辑错误导致正常订单无法创建、Node.js 服务崩溃、`toggleSoldOut` API 异常。

```bash
# Step 1: 回滚前端（同 L1）
LATEST_BACKUP=$(ls -td /var/www/restaurant-pos-backups/pre-* | head -1)
sudo rm -rf /var/www/restaurant-pos/assets /var/www/restaurant-pos/index.html
sudo cp -r "${LATEST_BACKUP}/assets" /var/www/restaurant-pos/
sudo cp "${LATEST_BACKUP}/index.html" /var/www/restaurant-pos/

# Step 2: 回滚 pb_hooks
sudo cp -r /var/backups/pb-pre-soldout-*/pb_hooks/* /opt/pocketbase/pb_hooks/

# Step 3: 回滚 pb_migrations（删除新增的迁移文件）
# 注意：这不会回滚已执行的 schema 变更，只是防止 PocketBase 重启时再次执行
NEW_MIGRATION=$(ls -t /opt/pocketbase/pb_migrations/ | grep "add_soldOut" | head -1)
if [ -n "$NEW_MIGRATION" ]; then
  sudo rm -f "/opt/pocketbase/pb_migrations/${NEW_MIGRATION}"
  echo "已删除迁移文件: ${NEW_MIGRATION}"
fi

# Step 4: 重启 PocketBase
sudo systemctl restart pocketbase
sleep 2
sudo systemctl is-active --quiet pocketbase || echo "❌ PocketBase 重启失败"

# Step 5: 回滚 public-api（Node.js 服务）
cd /var/www/restaurant-pos-vue/server
# 如果使用 Docker
docker compose restart public-api 2>/dev/null || true
# 如果使用 PM2
# pm2 restart restaurant-pos-api 2>/dev/null || true

# Step 6: 重启 Nginx
sudo systemctl restart nginx

# Step 7: 验证
echo "=== 健康检查 ==="
curl -s http://127.0.0.1/ | head -1
curl -s -o /dev/null -w "PocketBase: %{http_code}\n" http://127.0.0.1:8090/api/health
curl -s -o /dev/null -w "Public API: %{http_code}\n" http://127.0.0.1:3000/health
echo "✅ L2 回滚完成"
```

> **Hook 回滚后的影响**：`pb_hooks/orders.pb.js` 回滚到旧版本后，不再包含 `validateItemsSoldOut` 校验。此时 soldOut 字段仅作为"前端显示标记"，不再拦截下单。这是可接受的中级回滚状态——用户仍能看到"已沽清"标签，但系统不再强制拦截，等待修复后重新部署即可。

#### 12.2.5 L3 - 完全回滚（删除数据库字段）

> ⚠️ **警告**：此操作不可逆，执行前必须确认 L2 备份存在。

**适用场景**：迁移文件导致 `dishes` 表损坏、字段类型错误引发 PocketBase 崩溃、与其他字段冲突。

**方法一：通过 PocketBase Admin API 删除字段（推荐，安全）**

```bash
# 1. 获取 Admin Token
ADMIN_EMAIL="admin@restaurant.com"
ADMIN_PASS="your-password"
PB_URL="http://127.0.0.1:8090"

TOKEN=$(curl -s -X POST "${PB_URL}/api/admins/auth-with-password" \
  -H "Content-Type: application/json" \
  -d "{\"identity\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASS}\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))")

# 2. 获取 dishes 集合当前 schema
DISHES_DATA=$(curl -s "${PB_URL}/api/collections/dishes" -H "Authorization: Bearer ${TOKEN}")
DISHES_ID=$(echo "$DISHES_DATA" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))")

# 3. 构造删除 soldOut 字段后的 schema（保留其他所有字段）
cat > /tmp/rollback_schema.json << 'EOF'
{
  "schema": [
    { "system": false, "id": "field_name", "name": "name", "type": "text", "required": true },
    { "system": false, "id": "field_price", "name": "price", "type": "number", "required": true },
    { "system": false, "id": "field_category", "name": "category", "type": "text", "required": true },
    { "system": false, "id": "field_description", "name": "description", "type": "text", "required": false }
  ]
}
EOF

# 注意：以上 schema 是示例，实际操作中应该从当前 schema 中移除 soldOut/soldOutNote/soldOutAt 字段
# 而不是覆盖整个 schema。建议通过 PocketBase 管理后台 UI 手动删除字段。
```

**方法二：通过 PocketBase 管理后台 UI 手动删除（最安全）**

1. 访问 `http://your-domain/_/`
2. 登录管理员账号
3. 进入 **Collections → dishes**
4. 在 **Schema** 标签页中，依次删除字段：`soldOut`、`soldOutNote`、`soldOutAt`、`stockQty`
5. 点击 **Save** 保存

**方法三：直接操作 SQLite（应急，不推荐）**

```bash
# 停止 PocketBase
sudo systemctl stop pocketbase

# 备份当前数据库
sudo cp /opt/pocketbase/pb_data/data.db /opt/pocketbase/pb_data/data.db.emergency-$(date +%Y%m%d-%H%M%S)

# 使用 sqlite3 删除列（SQLite 3.35+ 支持 ALTER TABLE DROP COLUMN）
sqlite3 /opt/pocketbase/pb_data/data.db << 'SQL'
ALTER TABLE dishes DROP COLUMN soldOut;
ALTER TABLE dishes DROP COLUMN soldOutNote;
ALTER TABLE dishes DROP COLUMN soldOutAt;
ALTER TABLE dishes DROP COLUMN stockQty;
SQL

# 重启 PocketBase
sudo systemctl start pocketbase
```

#### 12.2.6 回滚验证清单

回滚完成后，必须逐项验证：

| # | 验证项 | 命令/方法 | 预期结果 |
|---|--------|----------|---------|
| 1 | Nginx 运行状态 | `sudo systemctl status nginx` | `active (running)` |
| 2 | PocketBase 运行状态 | `sudo systemctl status pocketbase` | `active (running)` |
| 3 | 前端页面可访问 | `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1/` | `200` |
| 4 | PocketBase API 响应 | `curl -s http://127.0.0.1:8090/api/health` | JSON 正常返回 |
| 5 | 订单创建正常 | 在页面上创建一笔订单 | 成功创建，无 soldOut 拦截 |
| 6 | 菜品列表加载 | 打开点菜页 | 菜品正常显示，无报错 |
| 7 | 数据库字段状态（L3 后）| 检查 dishes schema | 无 soldOut/soldOutNote/soldOutAt |

#### 12.2.7 热修复窗口

| 时段 | 建议操作 |
|------|---------|
| **首选** | 14:00 - 16:30（午市结束，晚市未开始） |
| **次选** | 21:00 后（晚市结束） |
| **禁止** | 11:00 - 14:00、17:00 - 21:00（营业高峰） |

#### 12.2.8 应急联系人模板

```
【沽清功能回滚通知】
时间: YYYY-MM-DD HH:MM
回滚级别: L1/L2/L3
原因: [简述问题]
影响范围: [员工端/顾客端/全部]
当前状态: [已回滚/正在回滚]
预计恢复: [时间]
操作人: [姓名]
```

### 12.3 监控指标

| 指标 | 采集方式 | 告警阈值 |
|------|---------|---------|
| `toggleSoldOut` API 错误率 | 应用日志 | > 5% |
| SSE 连接成功率 | 前端埋点 | < 90% |
| 沽清→误点转化率 | 后端日志统计 | > 1% |
| 平均撤销操作次数 | 前端埋点 | > 3 次/小时（说明误触率高） |

---

## 附录

### A. 术语表

| 术语 | 说明 |
|------|------|
| **沽清** | 菜品今日售罄或暂时无法供应 |
| **乐观更新** | 先更新本地 UI，再发送 API 请求，失败时回滚 |
| **SSE** | Server-Sent Events，服务器推送实时数据 |
| **Toast** | 轻量提示条，通常显示在屏幕顶部或底部 |
| **ActionSheet** | 底部弹出的操作菜单 |

### B. 参考文档

- `智能点菜系统-详细设计说明书.md` — 系统总体设计
- `docs/TEST_COVERAGE_REPORT.md` — 测试覆盖报告
- `docs/CHANGELOG.md` — 版本变更记录

---

> **文档结语**：本方案在原始沽清功能规格基础上，从 UI 可用性、架构合理性、数据流完整性、安全防御纵深四个维度进行了系统性增强。核心改进包括：将「⋯」按钮改为长按/右键交互以提升可发现性、将缓存策略从"完全移除"调整为"缩短至 3 秒"以平衡性能与实时性、增加 Node.js 中间层二次校验构建防御纵深、以及暂缓厨房大屏入口避免职责混乱。按此方案实施，可在 6 个工作日内交付一个贴合小餐厅真实工作流的沽清功能。


### C. 架构审查结论（2026-04-20）

> **审查角色**: 资深架构师 / 开发经理  
> **审查结论**: 方案整体可行，但存在 4 项架构级缺陷、7 项高概率踩坑点、3 项业务场景遗漏，已在本轮开发中修正。

| 级别 | 数量 | 状态 |
|------|------|------|
| 🔴 **P0 - 架构级缺陷** | 4 | 已修正 |
| 🟠 **P1 - 高概率踩坑** | 7 | 已修正 |
| 🟡 **P2 - 业务遗漏** | 3 | 已修正/规划中 |

**关键修正项摘要**：

1. **乐观更新并发竞争（P0-1）** → 修正为字段级增量更新，回滚时仅恢复 `soldOut` 相关字段，不再替换整个 dish 对象
2. **`apiCache` 分布式陷阱（P0-2）** → DishAPI 60s 缓存已移除，避免沽清状态延迟生效
3. **Hook N+1 查询（P0-3）** → 改为批量 IN 查询 `findRecordsByFilter`
4. **SSE 连接数膨胀（P0-4）** → `subscribeToDishes` 改为共享单例 SSE 连接
5. **迁移文件命名（P1-7）** → 已按 Unix 时间戳规范命名

**业务场景遗漏**：
- 顾客端"替换推荐"逻辑（P2-1）→ 暂未实现，列为 P3 优化项
- 沽清状态批量操作（P2-2）→ 已实现
- 沽清历史追溯（P2-3）→ 已记录 `soldOutAt` 字段

---

**文档结束**
