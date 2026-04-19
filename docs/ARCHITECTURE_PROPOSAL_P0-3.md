# P0-3 数据架构重构技术方案设计

> **文档状态**: RFC (Request for Comments)  
> **版本**: v1.0  
> **日期**: 2026-04-19  
> **作者**: 架构师  
> **范围**: 顾客端匿名访问安全架构 redesign  

---

## 一、现状建模（System As-Is Modeling）

### 1.1 部署拓扑

```
┌─────────────────────────────────────────────────────────────┐
│                      单台云服务器 (4C8G)                      │
│                                                             │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────┐ │
│  │    Nginx     │─────→│  PocketBase  │      │   pb_data │ │
│  │   (port 80)  │      │ (port 8090)  │      │ (SQLite)  │ │
│  └──────────────┘      └──────────────┘      └──────────┘ │
│         │                                                   │
│         └────→ 静态文件 /var/www/restaurant-pos/            │
│                                                             │
│  ┌──────────────┐                                           │
│  │   pb_hooks   │  orders.pb.js (366行)                     │
│  │              │  stats.pb.js (149行)                      │
│  └──────────────┘                                           │
│                                                             │
│  ┌──────────────┐                                           │
│  │ pb_migrations│  14个迁移文件（不在版本控制中）            │
│  └──────────────┘                                           │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 双端数据流

#### 员工端（已认证）

```
浏览器 ──→ /login ──→ POST /api/collections/users/auth-with-password
                    └──→ localStorage: token + user
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│ 所有后续请求携带 Bearer token                                │
│                                                              │
│ OrderAPI.getOrders()        ──→ privateRequest ──→ GET /orders      │
│ OrderAPI.updateOrder()      ──→ privateRequest ──→ PATCH /orders/:id│
│ DishAPI.*                   ──→ privateRequest/publicRequest        │
│ TableStatusAPI.*            ──→ privateRequest ──→ GET/PATCH table_status│
│ SettingsAPI.*               ──→ privateRequest                      │
│ StatsAPI.*                  ──→ privateRequest ──→ GET /api/stats   │
└──────────────────────────────────────────────────────────────┘
```

#### 顾客端（未认证）

```
扫码 ──→ /customer-order?table=A01
         │
         ├─→ DishAPI.getDishes() ──→ publicRequest ──→ GET /dishes ✅
         │
         ├─→ TableStatusAPI.getTableStatus('A01')
         │     ──→ privateRequest → 检查 localStorage token
         │     ──→ 无token → 前端抛出401 → .catch(() => null)
         │     ──→ 返回 null（顾客不知道桌台是否有订单）
         │
         ├─→ 如果 ts?.currentOrderId:
         │     PublicOrderAPI.getOrder(id) ──→ publicRequest ──→ GET /orders/:id
         │     （当前权限开放，可访问）
         │
         ├─→ 提交订单:
         │     有currentOrder → PublicOrderAPI.appendOrderItems(id, items)
         │         ──→ publicRequest GET /orders/:id
         │         ──→ publicRequest PATCH /orders/:id {items}
         │     无currentOrder → PublicOrderAPI.createOrder(orderData)
         │         ──→ publicRequest POST /orders
         │
         └─→ useClearTable.ts (员工端使用，但调用了PublicOrderAPI.getOrdersByTable)
```

### 1.3 当前数据模型

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     dishes      │     │     orders      │     │  table_status   │
├─────────────────┤     ├─────────────────┤     ├─────────────────┤
│ id (PK)         │     │ id (PK)         │     │ id (PK)         │
│ name            │◄────┤ orderNo         │     │ tableNo (UQ)    │
│ price           │     │ tableNo         │◄───→│ status          │
│ category        │     │ guests          │     │ currentOrderId  │
│ description     │     │ items (JSON)    │     │ openedAt        │
│                 │     │ status          │     │                 │
│                 │     │ totalAmount     │     └─────────────────┘
│                 │     │ discount        │              │
│                 │     │ discountType    │              │
│                 │     │ discountValue   │              │
│                 │     │ finalAmount     │              │
│                 │     │ cutlery (JSON)  │              │
│                 │     │ source          │              │
│                 │     │ customerPhone   │              │
│                 │     │ created         │              │
│                 │     │ updated         │              │
└─────────────────┘     └─────────────────┘              │
         │                                               │
         │         ┌─────────────────┐                   │
         └────────→│    settings     │                   │
                   ├─────────────────┤                   │
                   │ id (PK)         │                   │
                   │ restaurantName  │                   │
                   │ tableNumbers    │───────────────────┘
                   │ categories      │
                   │ ...             │
                   └─────────────────┘
```

### 1.4 当前权限状态（危险）

| 集合 | listRule | viewRule | createRule | updateRule | deleteRule | 风险等级 |
|------|----------|----------|------------|------------|------------|----------|
| orders | `""` | `""` | `""` | `""` | `""` | 🔴 极高 |
| table_status | `""` | `""` | `""` | `""` | `""` | 🔴 极高 |
| dishes | `@request.auth.id != ''` | `@request.auth.id != ''` | `@request.auth.id != ''` | `@request.auth.id != ''` | `@request.auth.id != ''` | 🟡 中 |
| settings | `@request.auth.id != ''` | `@request.auth.id != ''` | `@request.auth.id != ''` | `@request.auth.id != ''` | `@request.auth.id != ''` | 🟢 低 |

> **"" (空字符串) 在 PocketBase 中表示：完全开放，无需任何认证。**

### 1.5 安全风险量化

假设攻击者获取了订单 ID（UUID v4，128位，理论不可猜测）：
- **但实际上**：订单 ID 可能通过前端网络请求泄漏（浏览器 DevTools 可见）
- **更危险的**：listRule = "" 允许 `GET /api/collections/orders/records` 返回**所有订单**
- **攻击面**：
  - 爬虫可抓取全部订单数据（客户信息、金额、桌号）
  - 恶意用户可篡改任意订单的 items（插入垃圾菜品）
  - 恶意用户可删除任意订单
  - 恶意用户可创建虚假订单干扰厨房

---

## 二、方案 B：订单 AccessToken（Capability-based Security）

### 2.1 核心思想

> 不依赖用户身份认证，而是为每个订单生成一个**不可猜测的访问令牌**。顾客凭令牌操作自己的订单，令牌即能力（Capability）。

```
顾客 ──→ 创建订单 ──→ 后端生成订单 + accessToken
    │                    │
    │                    └────→ accessToken 存入订单记录（hidden）
    │
    └────→ 获得订单号 + 访问链接（含 token）
              │
              ▼
    后续所有操作: GET/PATCH /orders/:id?token=<accessToken>
```

### 2.2 架构设计

```
┌──────────────────────────────────────────────────────────────┐
│                        PocketBase v0.22                      │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              权限规则（声明式）                         │   │
│  │                                                      │   │
│  │  orders.listRule:  "@request.auth.id != ''"           │   │
│  │  orders.viewRule:  "@request.auth.id != '' ||         │   │
│  │                    accessToken = @request.query.token"│   │
│  │  orders.createRule:"@request.auth.id != '' ||         │   │
│  │                    (@request.data.status:isset = false│   │
│  │                    && @request.data.finalAmount:isset =│   │
│  │                    false)"                            │   │
│  │  orders.updateRule:"@request.auth.id != '' ||         │   │
│  │                    accessToken = @request.query.token"│   │
│  │  orders.deleteRule:"@request.auth.id != ''"           │   │
│  └──────────────────────────────────────────────────────┘   │
│                          │                                   │
│  ┌───────────────────────┼──────────────────────────────┐   │
│  │         pb_hooks/orders.pb.js                         │   │
│  │                      │                                │   │
│  │  onRecordAfterCreate: ──→ 生成 accessToken           │   │
│  │  onRecordBeforeUpdate: ──→ 校验匿名PATCH的字段范围    │   │
│  │  onRecordAfterUpdate: ──→ table_status 同步           │   │
│  └───────────────────────┼──────────────────────────────┘   │
│                          │                                   │
│  ┌───────────────────────┼──────────────────────────────┐   │
│  │         pb_hooks/public-api.pb.js (新增)              │   │
│  │                      │                                │   │
│  │  routerAdd('GET', '/api/public/orders/by-table')     │   │
│  │  routerAdd('POST', '/api/public/orders')             │   │
│  │  routerAdd('GET', '/api/public/orders/:id')          │   │
│  │  routerAdd('PATCH', '/api/public/orders/:id/items')  │   │
│  └───────────────────────┼──────────────────────────────┘   │
│                          │                                   │
└──────────────────────────┼───────────────────────────────────┘
                           │
                    ┌──────┴──────┐
                    │   前端顾客端   │
                    │              │
                    │  CustomerOrderView.vue
                    │   ──→ PublicOrderAPI (重构)
                    │   ──→ 所有请求携带 ?token=xxx
                    └──────────────┘
```

### 2.3 数据模型变更

#### 2.3.1 Orders 集合新增字段

```javascript
// 迁移文件: pb_migrations/xxxxxxxx_add_access_token_to_orders.js
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId('orders')

  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "field_access_token",
    "name": "accessToken",
    "type": "text",
    "required": false,
    "presentable": false,
    "unique": true,           // 唯一索引，确保不可碰撞
    "options": {
      "min": 32,
      "max": 64,
      "pattern": "^[a-zA-Z0-9_-]+$"
    }
  }))

  // 该字段不返回给前端（通过 API 规则隐藏）
  // PocketBase 无内置 hidden 字段，需通过 View API 规则控制

  return dao.saveCollection(collection)
})
```

> **注意**: PocketBase v0.22 没有 "hidden" 字段类型。`accessToken` 虽然存储在 orders 集合中，但需要通过以下方式保护：
> 1. 设置 `listRule` 为 `@request.auth.id != ''`，防止匿名用户列表查询看到 token
> 2. 创建自定义 API endpoint（routerAdd）返回订单时排除 accessToken 字段

#### 2.3.2 TableStatus 集合权限调整

```javascript
// table_status 权限（不需要 AccessToken，因为只是状态查询）
listRule:   "@request.auth.id != '' || status != ''"  // 开放查询
viewRule:   "@request.auth.id != '' || status != ''"
createRule: "@request.auth.id != ''"
updateRule: "@request.auth.id != ''"
deleteRule: "@request.auth.id != ''"
```

### 2.4 后端 Hook 变更设计

#### 2.4.1 生成 AccessToken（orders.pb.js 新增）

```javascript
/**
 * 生成加密安全的随机令牌
 * 使用 crypto.getRandomValues 确保不可预测
 */
function generateAccessToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  const arr = new Uint8Array(32)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr)
  } else {
    // Fallback for PocketBase JS VM
    for (let i = 0; i < 32; i++) {
      arr[i] = Math.floor(Math.random() * 256)
    }
  }
  let token = ''
  for (let i = 0; i < 32; i++) {
    token += chars[arr[i] % chars.length]
  }
  return token
}

// 在 onRecordAfterCreateRequest 中生成 token
onRecordAfterCreateRequest(
  (e) => {
    const record = e.record
    
    // 生成 accessToken
    const token = generateAccessToken()
    record.set('accessToken', token)
    
    try {
      $app.dao().saveRecord(record)
    } catch (err) {
      console.error('accessToken generation error:', err)
    }
    
    // 原有逻辑: table_status 同步...
    const tableNo = record.get('tableNo')
    // ...
  },
  'orders',
)
```

#### 2.4.2 匿名 PATCH 字段校验（加固）

```javascript
/**
 * 校验匿名用户只能修改特定字段
 * 即使 viewRule/updateRule 通过 token 开放，也要限制操作范围
 */
onRecordBeforeUpdateRequest(
  (e) => {
    const record = e.record
    const httpInfo = e.httpInfo
    
    // 原有逻辑...
    
    // 新增: 匿名用户字段级校验
    if (!httpInfo.authRecord) {
      // 获取原始记录
      const original = $app.dao().findRecordById('orders', record.id)
      
      // 匿名用户只允许修改以下字段
      const allowedFields = ['items', 'guests', 'customerPhone', 'cutlery']
      
      // 检查是否有非法字段变更
      for (const field of Object.keys(record.original())) {
        if (!allowedFields.includes(field)) {
          if (record.get(field) !== original.get(field)) {
            throw new Error('匿名用户不允许修改字段: ' + field)
          }
        }
      }
    }
    
    // 原有逻辑继续...
  },
  'orders',
)
```

#### 2.4.3 公共 API 路由（新增 pb_hooks/public-api.pb.js）

由于 PocketBase 的 `viewRule` 无法精确控制返回字段（会返回整条记录，包括 accessToken），需要创建自定义路由：

```javascript
/**
 * 公共 API - 顾客端访问接口
 * 不暴露 accessToken，不依赖 PocketBase 集合权限
 */

// 1. 按桌号查询当前订单
routerAdd('GET', '/api/public/orders/by-table', (c) => {
  const tableNo = c.queryParam('tableNo')
  
  if (!tableNo) {
    return c.json(400, { error: '缺少桌号参数' })
  }
  
  try {
    const records = $app.dao().findRecordsByFilter(
      'orders',
      "tableNo = {:tableNo} && status != 'completed' && status != 'cancelled' && status != 'settled'",
      '-created',
      1,
      0,
      { tableNo: tableNo }
    )
    
    if (!records || records.length === 0) {
      return c.json(200, { items: [] })
    }
    
    const order = records[0]
    return c.json(200, {
      id: order.id,
      orderNo: order.get('orderNo'),
      tableNo: order.get('tableNo'),
      status: order.get('status'),
      items: parseJSONField(order, 'items'),
      guests: order.get('guests'),
      totalAmount: order.get('totalAmount'),
      finalAmount: order.get('finalAmount'),
      cutlery: parseJSONField(order, 'cutlery'),
      created: order.get('created'),
      // ❌ 不返回 accessToken
    })
  } catch (err) {
    console.error('public orders by-table error:', err)
    return c.json(500, { error: '查询失败' })
  }
})

// 2. 创建订单（返回订单信息 + accessToken）
routerAdd('POST', '/api/public/orders', (c) => {
  const body = c.request().json()
  
  // 基础校验
  if (!body.tableNo || !body.items || !Array.isArray(body.items)) {
    return c.json(400, { error: '缺少必要字段' })
  }
  
  // 校验桌号
  const tableRecords = $app.dao().findRecordsByFilter(
    'table_status',
    'tableNo = {:tableNo}',
    '',
    1,
    0,
    { tableNo: body.tableNo }
  )
  
  if (tableRecords && tableRecords.length > 0) {
    const ts = tableRecords[0]
    if (ts.get('status') === 'dining') {
      return c.json(409, { error: '该桌台已有未完成订单' })
    }
  }
  
  // 创建订单（使用 PocketBase 内部 API，绕过权限规则）
  const collection = $app.dao().findCollectionByNameOrId('orders')
  const record = new Record(collection)
  
  record.set('orderNo', generateOrderNo())
  record.set('tableNo', body.tableNo)
  record.set('items', JSON.stringify(body.items))
  record.set('guests', body.guests || 1)
  record.set('cutlery', JSON.stringify(body.cutlery || null))
  record.set('status', 'pending')
  record.set('source', 'customer')
  
  // 金额由 onRecordBeforeCreateRequest Hook 自动计算
  
  $app.dao().saveRecord(record)
  
  // 生成并保存 accessToken
  const token = generateAccessToken()
  record.set('accessToken', token)
  $app.dao().saveRecord(record)
  
  return c.json(201, {
    id: record.id,
    orderNo: record.get('orderNo'),
    accessToken: token,  // ✅ 首次创建时返回 token
    totalAmount: record.get('totalAmount'),
    finalAmount: record.get('finalAmount'),
    status: record.get('status'),
  })
})

// 3. 获取订单详情（通过 token）
routerAdd('GET', '/api/public/orders/:id', (c) => {
  const id = c.pathParam('id')
  const token = c.queryParam('token')
  
  if (!token) {
    return c.json(401, { error: '缺少访问令牌' })
  }
  
  try {
    const record = $app.dao().findRecordById('orders', id)
    
    if (!record || record.get('accessToken') !== token) {
      return c.json(403, { error: '访问令牌无效' })
    }
    
    return c.json(200, {
      id: record.id,
      orderNo: record.get('orderNo'),
      tableNo: record.get('tableNo'),
      status: record.get('status'),
      items: parseJSONField(record, 'items'),
      guests: record.get('guests'),
      totalAmount: record.get('totalAmount'),
      finalAmount: record.get('finalAmount'),
      cutlery: parseJSONField(record, 'cutlery'),
      created: record.get('created'),
    })
  } catch (err) {
    return c.json(404, { error: '订单不存在' })
  }
})

// 4. 追加菜品（通过 token）
routerAdd('PATCH', '/api/public/orders/:id/items', (c) => {
  const id = c.pathParam('id')
  const token = c.queryParam('token')
  const body = c.request().json()
  
  if (!token) {
    return c.json(401, { error: '缺少访问令牌' })
  }
  
  if (!body.items || !Array.isArray(body.items)) {
    return c.json(400, { error: '缺少菜品数据' })
  }
  
  try {
    const record = $app.dao().findRecordById('orders', id)
    
    if (!record || record.get('accessToken') !== token) {
      return c.json(403, { error: '访问令牌无效' })
    }
    
    // 校验订单状态
    const status = record.get('status')
    if (status === 'completed' || status === 'cancelled' || status === 'settled') {
      return c.json(400, { error: '订单已结束，不能追加菜品' })
    }
    
    // 合并 items
    const existingItems = parseJSONField(record, 'items')
    const mergedItems = mergeOrderItems(existingItems, body.items)
    
    record.set('items', JSON.stringify(mergedItems))
    
    // 保存（触发 onRecordBeforeUpdateRequest 重算金额）
    $app.dao().saveRecord(record)
    
    return c.json(200, {
      id: record.id,
      orderNo: record.get('orderNo'),
      items: mergedItems,
      totalAmount: record.get('totalAmount'),
      finalAmount: record.get('finalAmount'),
    })
  } catch (err) {
    console.error('public append items error:', err)
    return c.json(500, { error: '追加失败' })
  }
})
```

### 2.5 前端 API 层重构

```typescript
// src/api/public-order.api.ts (新建文件)

import { APIError, fetchWithTimeout, handleResponse } from './base'
import type { Order, OrderItem, CreateOrderPayload } from './types'

const PB_URL = import.meta.env.VITE_PB_URL || '/api'

/**
 * 顾客端公共 API - 无需登录，通过 accessToken 访问
 */
export class CustomerSession {
  private orderId: string
  private accessToken: string

  constructor(orderId: string, accessToken: string) {
    this.orderId = orderId
    this.accessToken = accessToken
  }

  static restore(): CustomerSession | null {
    const orderId = sessionStorage.getItem('customer_order_id')
    const token = sessionStorage.getItem('customer_access_token')
    if (orderId && token) {
      return new CustomerSession(orderId, token)
    }
    return null
  }

  persist() {
    sessionStorage.setItem('customer_order_id', this.orderId)
    sessionStorage.setItem('customer_access_token', this.accessToken)
  }

  clear() {
    sessionStorage.removeItem('customer_order_id')
    sessionStorage.removeItem('customer_access_token')
  }

  get headers() {
    return { 'X-Order-Token': this.accessToken }
  }
}

export const PublicOrderAPI = {
  /**
   * 按桌号查询当前未完成订单
   */
  async getOrdersByTable(tableNo: string): Promise<Order[]> {
    const url = `${PB_URL}/public/orders/by-table?tableNo=${encodeURIComponent(tableNo)}`
    const res = await fetchWithTimeout(url)
    const data = await handleResponse<{ items: Order[] }>(res)
    return data?.items || []
  },

  /**
   * 创建新订单
   * 返回订单信息 + accessToken
   */
  async createOrder(orderData: CreateOrderPayload): Promise<Order & { accessToken: string }> {
    const res = await fetchWithTimeout(`${PB_URL}/public/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderData),
    })
    return handleResponse<Order & { accessToken: string }>(res)
  },

  /**
   * 获取订单详情（通过 CustomerSession）
   */
  async getOrder(id: string, session: CustomerSession): Promise<Order> {
    const url = `${PB_URL}/public/orders/${encodeURIComponent(id)}?token=${encodeURIComponent(session.accessToken)}`
    const res = await fetchWithTimeout(url)
    return handleResponse<Order>(res)
  },

  /**
   * 追加菜品（通过 CustomerSession）
   */
  async appendOrderItems(
    id: string,
    session: CustomerSession,
    newItems: OrderItem[],
  ): Promise<Order> {
    const url = `${PB_URL}/public/orders/${encodeURIComponent(id)}/items?token=${encodeURIComponent(session.accessToken)}`
    const res = await fetchWithTimeout(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: newItems }),
    })
    return handleResponse<Order>(res)
  },
}
```

### 2.6 前端状态管理变更

```typescript
// CustomerOrderView.vue - 重构后

import { CustomerSession } from '@/api/public-order.api'

const session = ref<CustomerSession | null>(CustomerSession.restore())
const currentOrder = ref<Order | null>(null)

// 页面初始化
onMounted(async () => {
  // 1. 获取桌台状态（table_status 已开放查询）
  const ts = await TableStatusAPI.getTableStatus(tableNo.value).catch(() => null)
  
  // 2. 如果有 session（页面未刷新），恢复当前订单
  if (session.value) {
    try {
      const order = await PublicOrderAPI.getOrder(session.value.orderId, session.value)
      if (order.status !== OrderStatus.COMPLETED && ...) {
        currentOrder.value = order
        return
      }
    } catch {
      session.value = null
    }
  }
  
  // 3. 按桌号查询是否有未完成订单
  const orders = await PublicOrderAPI.getOrdersByTable(tableNo.value)
  if (orders.length > 0) {
    currentOrder.value = orders[0]
    // 注意: 这里无法获得 accessToken，所以顾客刷新页面后
    // 如果通过 getOrdersByTable 获取到订单，只能查看不能追加
    // 需要引导顾客"扫码继续点餐"或让员工操作
  }
})

// 提交订单
async function submitOrder() {
  if (currentOrder.value && session.value) {
    // 追加到已有订单
    await PublicOrderAPI.appendOrderItems(
      currentOrder.value.id,
      session.value,
      items,
    )
  } else {
    // 创建新订单
    const result = await PublicOrderAPI.createOrder(orderData)
    currentOrder.value = result
    session.value = new CustomerSession(result.id, result.accessToken)
    session.value.persist()  // 保存到 sessionStorage
  }
}
```

### 2.7 优点与局限

| 维度 | 评估 |
|------|------|
| **安全性** | ⭐⭐⭐⭐ 高。Token 32字符随机，概率可忽略。即使泄漏也仅限单订单 |
| **用户体验** | ⭐⭐⭐⭐ 好。顾客刷新页面后可恢复订单（通过 sessionStorage） |
| **实现复杂度** | ⭐⭐⭐ 中。需新增字段 + 自定义路由 + 前端重构 |
| **性能影响** | ⭐⭐⭐⭐⭐ 无。纯 PocketBase 内部操作，无外部依赖 |
| **扩展性** | ⭐⭐⭐ 中。新增订单字段需同时改 Schema + 自定义路由 |
| **测试覆盖** | ⭐⭐ 需新增。自定义路由需单独测试 |

**核心局限**：
1. **Token 持久化问题**：使用 `sessionStorage`，顾客关闭标签页后 Token 丢失（可通过改为 `localStorage` 缓解，但有 XSS 风险）
2. **URL 泄漏风险**：如果顾客分享带 token 的 URL，他人可操作订单（可通过短期 token 或绑定设备指纹缓解）
3. **PocketBase 绑定**：仍在 PocketBase 框架内，未来迁移成本高

---

## 三、方案 C：公共 API 隔离（Service-oriented Architecture）

### 3.1 核心思想

> 将顾客端的业务逻辑从 PocketBase 集合操作中完全抽离，建立独立的**公共 API 服务**（Node.js/Fastify/Nest.js）。顾客端只与公共 API 交互，公共 API 以**服务账号**身份操作 PocketBase。PocketBase 回归"内部数据库"角色，权限收紧为仅员工 + 服务账号可访问。

```
┌──────────────────────────────────────────────────────────────┐
│                        公共 API 服务层                         │
│                     (Node.js / Fastify)                      │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  路由层                                               │   │
│  │  POST /api/public/orders                             │   │
│  │  GET  /api/public/orders/:id                         │   │
│  │  PATCH /api/public/orders/:id/items                  │   │
│  │  GET  /api/public/orders/by-table/:tableNo           │   │
│  │  GET  /api/public/dishes                             │   │
│  │  GET  /api/public/table-status/:tableNo              │   │
│  └──────────────────────────────────────────────────────┘   │
│                         │                                    │
│  ┌──────────────────────┼──────────────────────────────┐   │
│  │  业务逻辑层                                           │   │
│  │  - 桌号合法性校验                                     │   │
│  │  - 菜品存在性校验                                     │   │
│  │  - 金额计算（不信任前端）                             │   │
│  │  - 状态机校验                                         │   │
│  │  - 订单合并策略                                       │   │
│  │  - Token 生成与管理                                   │   │
│  └──────────────────────┼──────────────────────────────┘   │
│                         │                                    │
│  ┌──────────────────────┼──────────────────────────────┐   │
│  │  数据访问层 (PocketBase SDK)                          │   │
│  │  - pb.admins.authWithPassword() 服务账号认证          │   │
│  │  - pb.collection('orders').create/get/update          │   │
│  │  - pb.collection('table_status').*                    │   │
│  └──────────────────────┼──────────────────────────────┘   │
│                         │                                    │
└─────────────────────────┼────────────────────────────────────┘
                          │
              ┌───────────┴───────────┐
              │                       │
    ┌─────────▼─────────┐   ┌─────────▼─────────┐
    │   顾客浏览器       │   │   员工浏览器       │
    │  (Public API)     │   │  (PocketBase API) │
    └───────────────────┘   └───────────────────┘
```

### 3.2 部署架构

```
┌──────────────────────────────────────────────────────────────┐
│                         Docker Compose                       │
│                                                              │
│  ┌─────────────────┐    ┌─────────────────┐    ┌──────────┐ │
│  │     Nginx       │    │  public-api     │    │pocketbase│ │
│  │   (reverse      │◄───┤  (Node.js)      │───→│ (内部DB) │ │
│  │    proxy)       │    │  port 3000      │    │ port 8090│ │
│  └────────┬────────┘    └─────────────────┘    └──────────┘ │
│           │                                                  │
│           ├────→ location /api/public/ ──→ public-api:3000 │
│           ├────→ location /api/ ─────────→ pocketbase:8090 │
│           └────→ location / ────────────→ frontend static  │
│                                                              │
│  ┌─────────────────┐                                         │
│  │   frontend      │                                         │
│  │  (Nginx static) │                                         │
│  └─────────────────┘                                         │
└──────────────────────────────────────────────────────────────┘
```

#### Nginx 路由配置变更

```nginx
server {
    listen 80;
    
    # 前端静态文件
    location / {
        root /var/www/restaurant-pos;
        try_files $uri $uri/ /index.html;
    }
    
    # 公共 API → 转发到 Node.js 服务
    location /api/public/ {
        proxy_pass http://127.0.0.1:3000/api/public/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
    
    # 员工 API + Admin UI → PocketBase（需认证）
    location /api/ {
        proxy_pass http://127.0.0.1:8090/api/;
        # ...
    }
    
    location /_/ {
        proxy_pass http://127.0.0.1:8090/_/;
        # ...
    }
}
```

### 3.3 技术选型

| 组件 | 选型 | 理由 |
|------|------|------|
| 运行时 | Node.js 22 LTS | 与前端技术栈一致，团队学习成本低 |
| 框架 | Fastify 5.x | 性能优于 Express，Schema 校验内置，TypeScript 原生支持 |
| ORM/SDK | pocketbase/esdk | 官方 SDK，支持 Admin 认证和实时订阅 |
| 校验 | Zod | 与前端 schema 共享，类型安全 |
| 缓存 | Node-cache / LRU | 菜品列表等读多写少数据缓存 |
| 日志 | Pino | Fastify 内置，高性能 JSON 日志 |
| 监控 | 初期 console + 后期 Sentry | 与前端监控统一 |

### 3.4 数据流设计

#### 3.4.1 创建订单

```
顾客 ──→ POST /api/public/orders
            {
              tableNo: "A01",
              guests: 4,
              items: [{dishId, name, price, quantity}],
              cutlery: {type, quantity}
            }
              │
              ▼
        ┌─────────────────────┐
        │ 1. 校验桌号格式      │
        │ 2. 校验菜品存在性    │ ← 查询 dishes 集合
        │ 3. 校验价格未被篡改  │ ← 对比 dishes 中的 price
        │ 4. 计算金额（后端）  │ ← MoneyCalculator
        │ 5. 生成订单号        │ ← generateOrderNo()
        │ 6. 生成 accessToken  │ ← crypto.randomUUID()
        │ 7. 写入 orders       │ ← pb.collection('orders').create()
        │ 8. 同步 table_status │ ← pb.collection('table_status').update()
        └─────────────────────┘
              │
              ▼
        返回: {
          id, orderNo, accessToken,
          totalAmount, finalAmount, status
        }
```

#### 3.4.2 获取订单

```
顾客 ──→ GET /api/public/orders/:id?token=<accessToken>
              │
              ▼
        1. 校验 token 存在
        2. 查询订单
        3. 比对订单.accessToken === token
        4. 返回订单详情（排除敏感字段）
```

#### 3.4.3 追加菜品

```
顾客 ──→ PATCH /api/public/orders/:id/items?token=<accessToken>
            { items: [{dishId, name, price, quantity}] }
              │
              ▼
        1. 校验 token
        2. 查询订单
        3. 校验订单状态（非 completed/cancelled/settled）
        4. 合并 items（mergeOrderItems 逻辑）
        5. 重新计算金额
        6. 更新 orders
        7. 如果原状态为 completed/serving → 重置为 pending
        8. 同步 table_status → dining
        9. 返回更新后的订单
```

### 3.5 项目结构

```
server/                              ← 新增目录
├── src/
│   ├── config/
│   │   └── index.ts                 # 环境变量配置 (PB_URL, PB_ADMIN_EMAIL, etc.)
│   │
│   ├── plugins/
│   │   ├── pocketbase.ts            # PocketBase SDK 初始化 + 服务账号认证
│   │   ├── error-handler.ts         # 全局错误处理
│   │   └── request-logger.ts        # 请求日志
│   │
│   ├── routes/
│   │   ├── public-orders/
│   │   │   ├── index.ts             # 路由注册
│   │   │   ├── create.ts            # POST /api/public/orders
│   │   │   ├── get-by-id.ts         # GET /api/public/orders/:id
│   │   │   ├── get-by-table.ts      # GET /api/public/orders/by-table/:tableNo
│   │   │   └── append-items.ts      # PATCH /api/public/orders/:id/items
│   │   │
│   │   ├── public-dishes/
│   │   │   └── index.ts             # GET /api/public/dishes
│   │   │
│   │   └── public-table-status/
│   │       └── index.ts             # GET /api/public/table-status/:tableNo
│   │
│   ├── services/
│   │   ├── order.service.ts         # 订单业务逻辑
│   │   ├── dish.service.ts          # 菜品服务
│   │   ├── table-status.service.ts  # 桌台状态服务
│   │   └── token.service.ts         # Token 生成与验证
│   │
│   ├── schemas/
│   │   ├── order.schema.ts          # Zod 校验 schema（与前端共享）
│   │   └── dish.schema.ts
│   │
│   ├── utils/
│   │   ├── money.ts                 # MoneyCalculator（与前端共享逻辑）
│   │   ├── order-status.ts          # 状态机定义（与前端共享）
│   │   └── errors.ts                # 业务错误类
│   │
│   └── index.ts                     # 服务入口
│
├── tests/
│   ├── unit/
│   │   ├── order.service.test.ts
│   │   └── token.service.test.ts
│   │
│   └── integration/
│       ├── public-orders.test.ts
│       └── append-items.test.ts
│
├── Dockerfile                       # 多阶段构建
├── package.json
├── tsconfig.json
└── ecosystem.config.js              # PM2 配置（生产）
```

### 3.6 核心代码示例

#### 3.6.1 PocketBase 服务账号连接

```typescript
// server/src/plugins/pocketbase.ts
import PocketBase from 'pocketbase'

const pb = new PocketBase(process.env.PB_URL || 'http://localhost:8090')

// 服务账号认证（Admin）
export async function authenticateServiceAccount() {
  await pb.admins.authWithPassword(
    process.env.PB_ADMIN_EMAIL!,
    process.env.PB_ADMIN_PASSWORD!,
  )
}

// 导出带认证状态的 pb 实例
export { pb }
```

#### 3.6.2 订单服务

```typescript
// server/src/services/order.service.ts
import { pb } from '../plugins/pocketbase'
import { generateOrderNo, MoneyCalculator } from '../utils'
import { mergeOrderItems } from '../utils/order'
import { TokenService } from './token.service'
import { TableStatusService } from './table-status.service'

export class OrderService {
  static async create(data: CreateOrderInput) {
    // 1. 校验菜品
    const dishIds = data.items.map(i => i.dishId)
    const dishes = await pb.collection('dishes').getFullList({
      filter: dishIds.map(id => `id='${id}'`).join(' || '),
    })
    
    if (dishes.length !== dishIds.length) {
      throw new Error('部分菜品不存在')
    }
    
    // 2. 校验价格未被篡改
    for (const item of data.items) {
      const dish = dishes.find(d => d.id === item.dishId)
      if (!dish || dish.price !== item.price) {
        throw new Error(`菜品 ${item.name} 价格异常`)
      }
    }
    
    // 3. 计算金额
    const { total, final } = MoneyCalculator.calculate(data.items, data.discount || 0)
    
    // 4. 生成 Token
    const accessToken = TokenService.generate()
    
    // 5. 创建订单
    const order = await pb.collection('orders').create({
      orderNo: generateOrderNo(),
      tableNo: data.tableNo,
      guests: data.guests,
      items: data.items,
      cutlery: data.cutlery,
      totalAmount: total,
      finalAmount: final,
      status: 'pending',
      accessToken,
      source: 'customer',
    })
    
    // 6. 同步 table_status
    await TableStatusService.setDining(order.tableNo, order.id)
    
    return {
      id: order.id,
      orderNo: order.orderNo,
      accessToken,
      totalAmount: order.totalAmount,
      finalAmount: order.finalAmount,
      status: order.status,
    }
  }
  
  static async appendItems(orderId: string, token: string, newItems: OrderItem[]) {
    // 1. 验证 token
    const order = await pb.collection('orders').getOne(orderId)
    if (order.accessToken !== token) {
      throw new Error('无权操作此订单')
    }
    
    // 2. 校验状态
    if (['completed', 'cancelled', 'settled'].includes(order.status)) {
      throw new Error('订单已结束')
    }
    
    // 3. 合并 items
    const merged = mergeOrderItems(order.items, newItems)
    
    // 4. 重算金额
    const { total, final } = MoneyCalculator.calculate(merged)
    
    // 5. 更新
    const updates: any = {
      items: merged,
      totalAmount: total,
      finalAmount: final,
    }
    
    // 如果原状态是 completed/serving，重置为 pending（重新开台逻辑）
    if (['completed', 'serving'].includes(order.status)) {
      updates.status = 'pending'
      await TableStatusService.setDining(order.tableNo, order.id)
    }
    
    return pb.collection('orders').update(orderId, updates)
  }
}
```

#### 3.6.3 Fastify 路由

```typescript
// server/src/routes/public-orders/index.ts
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { OrderService } from '../../services/order.service'

const createOrderSchema = z.object({
  tableNo: z.string().min(1),
  guests: z.number().min(1).default(1),
  items: z.array(z.object({
    dishId: z.string(),
    name: z.string(),
    price: z.number().positive(),
    quantity: z.number().positive(),
    remark: z.string().optional(),
  })).min(1),
  cutlery: z.object({
    type: z.enum(['free', 'charged']),
    quantity: z.number().min(0),
  }).optional(),
})

export default async function publicOrderRoutes(fastify: FastifyInstance) {
  // POST /api/public/orders
  fastify.post('/', async (request, reply) => {
    const data = createOrderSchema.parse(request.body)
    const result = await OrderService.create(data)
    return reply.code(201).send(result)
  })
  
  // GET /api/public/orders/:id?token=xxx
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { token } = request.query as { token?: string }
    
    if (!token) {
      return reply.code(401).send({ error: '缺少访问令牌' })
    }
    
    const order = await OrderService.getById(id, token)
    return order
  })
  
  // PATCH /api/public/orders/:id/items?token=xxx
  fastify.patch('/:id/items', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { token } = request.query as { token?: string }
    const { items } = request.body as { items: OrderItem[] }
    
    if (!token) {
      return reply.code(401).send({ error: '缺少访问令牌' })
    }
    
    const result = await OrderService.appendItems(id, token, items)
    return result
  })
}
```

### 3.7 PocketBase 权限收紧

实施方案 C 后，PocketBase 所有集合权限可收紧为：

```javascript
// 所有非 system 集合
listRule:   "@request.auth.id != ''"
viewRule:   "@request.auth.id != ''"
createRule: "@request.auth.id != ''"
updateRule: "@request.auth.id != ''"
deleteRule: "@request.auth.id != ''"
```

> 因为顾客端不再直接访问 PocketBase API，所有顾客操作都经过公共 API 服务，由服务账号（Admin）内部调用。

### 3.8 优点与局限

| 维度 | 评估 |
|------|------|
| **安全性** | ⭐⭐⭐⭐⭐ 极高。PocketBase 完全内网化，顾客无直接 DB 访问 |
| **用户体验** | ⭐⭐⭐⭐⭐ 好。Token 管理、页面恢复与方案 B 相同 |
| **实现复杂度** | ⭐⭐ 高。需新增 Node.js 服务、部署、监控、日志 |
| **性能影响** | ⭐⭐⭐ 中。增加一跳网络（Nginx → Node → PocketBase） |
| **扩展性** | ⭐⭐⭐⭐⭐ 极高。可独立扩容、缓存、限流 |
| **技术债务** | ⭐⭐⭐⭐ 低。解耦 PocketBase，未来可替换为 PostgreSQL |
| **测试覆盖** | ⭐⭐⭐⭐ 中。公共 API 可独立测试，Mock PocketBase SDK |

**核心局限**：
1. **运维复杂度**：新增服务需要进程管理（PM2/systemd）、健康检查、日志收集
2. **冷启动问题**：Node.js 服务启动需要时间，需配置 PM2 常驻或 systemd
3. **成本增加**：即使当前单服务器部署，也需要分配部分资源给 Node.js

---

## 四、方案对比矩阵

| 对比维度 | 方案 B (AccessToken) | 方案 C (公共 API) | 胜出方 |
|----------|---------------------|-------------------|--------|
| **安全性** | Token 保护单订单，listRule 需开放或自定义路由 | 完全隔离，PocketBase 可内网化 | **C** |
| **实现成本** | 2-3 天（改 Hook + 前端） | 1-2 周（新服务 + 部署 + 测试） | **B** |
| **运维成本** | 几乎为零（仍单服务） | 中等（新增 Node 进程监控） | **B** |
| **业务逻辑集中** | 分散在 pb_hooks + 前端 | 集中在 Node.js 服务 | **C** |
| **扩展性** | 受限于 PocketBase 单实例 | 可独立扩展 API 层 | **C** |
| **未来迁移** | 仍深度绑定 PocketBase | 低耦合，DB 可替换 | **C** |
| **团队技能要求** | PocketBase JS VM | Node.js + Fastify + 部署 | 持平 |
| **测试友好度** | pb_hooks 测试困难 | 标准 Node.js 单元/集成测试 | **C** |
| **实时订阅** | PocketBase 原生支持 | 需自行实现 SSE/WebSocket | **B** |
| **TypeScript 类型安全** | pb_hooks 无类型检查 | 全链路类型安全 | **C** |

---

## 五、架构师推荐

### 5.1 推荐方案：C（公共 API 隔离）

**理由**：

1. **安全是根本性优势**：餐饮业涉及支付（未来可能集成微信支付）、客户隐私（手机号）、经营数据。PocketBase 直接暴露在外网且权限开放，等于把数据库大门敞开。方案 C 从根本上消除了这个风险。

2. **业务逻辑归位**：当前 `orders.pb.js` 已经 366 行，承担了金额计算、状态机、table_status 同步、JSON 解析。继续添加 Token 管理、字段校验会让它更加臃肿。公共 API 将这些逻辑移到应用层，符合分层架构原则。

3. **为未来铺路**：项目当前是单店版，但餐饮业天然有多门店、加盟、 SaaS 化的扩展路径。方案 C 的 API 层可独立部署、独立扩展，为微服务演进预留空间。

4. **开发体验提升**：pb_hooks 的 JS VM 是 PocketBase 的 Go 运行时内嵌的 QuickJS，调试困难（靠 console.error），无 TypeScript，无热重载。Node.js 服务可用 ts-node-dev 热重载，VSCode 断点调试，Vitest 单元测试。

### 5.2 实施路径（渐进式，非大爆炸）

> 既然"时间不是问题"，建议用 **2 周** 完成，采用**灰度切换**策略。

#### Week 1：基建与核心 API

| 天数 | 任务 | 产出 |
|------|------|------|
| Day 1-2 | 搭建 `server/` 项目骨架（Fastify + TS + Zod + PB SDK） | 可运行的空服务 |
| Day 3-4 | 实现 dishes / table-status 公共查询 API | 菜品列表、桌台状态查询 |
| Day 5 | 实现 orders 创建 API + 金额计算 | 可创建订单 |

#### Week 2：业务逻辑迁移与切换

| 天数 | 任务 | 产出 |
|------|------|------|
| Day 6-7 | 实现订单查询 + 追加菜品 API | 完整顾客端闭环 |
| Day 8 | 前端重构：CustomerOrderView 接入新 API | 前端联调通过 |
| Day 9 | 收紧 PocketBase 权限 + 测试 | 安全基线建立 |
| Day 10 | E2E 测试 + 部署脚本更新 | 可上线 |

#### 灰度切换机制

```typescript
// 前端切换开关（环境变量控制）
const USE_PUBLIC_API = import.meta.env.VITE_USE_PUBLIC_API === 'true'

export const PublicOrderAPI = USE_PUBLIC_API 
  ? new PublicOrderAPIv2()  // 调用 /api/public/* (Node.js)
  : new PublicOrderAPIv1()  // 调用 /api/collections/* (PocketBase)
```

部署流程：
1. 先部署 Node.js 服务（不影响现有流量）
2. 前端发布时带 `VITE_USE_PUBLIC_API=true`
3. 观察监控，如有问题立即回滚前端环境变量

### 5.3 如果团队资源有限，备选：B+（方案 B 的增强版）

如果评估后认为方案 C 的运维负担过重，可实施方案 B 的增强版：

```
方案 B+ = 方案 B + 自定义路由集中化

- 所有顾客端操作通过 PocketBase routerAdd 自定义路由
- 不直接暴露 collections 端点给顾客端
- 前端只访问 /api/public/* (PocketBase 内部路由)
- 权限规则收紧，list/view/create/update 全部设为 @request.auth.id != ''
```

这相当于**在 PocketBase 内部构建一个轻量级公共 API 层**，无需新增 Node.js 服务。

---

## 六、待决策事项

| # | 问题 | 选项 | 建议 |
|---|------|------|------|
| 1 | 顾客 Token 存储位置 | sessionStorage / localStorage / URL query | **sessionStorage**（平衡安全与体验） |
| 2 | 追加菜品时是否允许修改已 cooking 的菜品状态 | 是 / 否 | **是**（重置为 pending，符合现有业务逻辑） |
| 3 | 厨房大屏是否也需要公共 API | 保持 PocketBase 直连 / 走公共 API | **保持 PocketBase**（厨房大屏在店内，可登录） |
| 4 | 现有 pb_hooks 是否保留 | 保留 / 部分迁移到 Node.js | **保留**（金额计算、状态机、table_status 同步继续由 pb_hooks 处理） |
| 5 | Node.js 服务部署方式 | PM2 / systemd / Docker | **PM2**（简单有效，与现有部署风格一致） |

---

## 七、附录：迁移后架构全景图

```
┌─────────────────────────────────────────────────────────────────────┐
│                         客户端层                                     │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │   员工管理后台    │  │   顾客扫码点餐    │  │   厨房大屏        │  │
│  │  (Vue 3 + Pinia) │  │  (Vue 3 + Pinia) │  │  (Vue 3)         │  │
│  │                  │  │                  │  │                  │  │
│  │ OrderAPI         │  │ PublicOrderAPI   │  │ OrderAPI         │  │
│  │ DishAPI          │  │ DishAPI          │  │ subscribeToOrders│  │
│  │ TableStatusAPI   │  │ TableStatusAPI   │  │                  │  │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘  │
│           │                     │                     │             │
│           │         ┌───────────┘                     │             │
│           │         │                                 │             │
│           │    ┌────┴────┐                            │             │
│           │    │  CDN    │                            │             │
│           │    │ (静态)  │                            │             │
│           │    └────┬────┘                            │             │
└───────────┼─────────┼─────────────────────────────────┼─────────────┘
            │         │                                 │
┌───────────┼─────────┼─────────────────────────────────┼─────────────┐
│           │         │                                 │             │
│      ┌────┴─────────┴────┐                      ┌────┴────┐        │
│      │      Nginx        │                      │         │        │
│      │   (Reverse Proxy) │                      │         │        │
│      └────┬──────┬───┬──┘                      │         │        │
│           │      │   │                          │         │        │
│           │      │   └────→ /api/public/* ─────→├─→ Fastify/Node │
│           │      │                               │   (port 3000)  │
│           │      │                               │        │       │
│           │      │                               │   ┌────┴────┐  │
│           │      │                               │   │ 业务逻辑 │  │
│           │      │                               │   │ Token    │  │
│           │      │                               │   │ 金额计算 │  │
│           │      │                               │   └────┬────┘  │
│           │      │                               │        │       │
│           │      └────→ /api/* /_/ ──────────────┼────────┘       │
│           │                                      │                │
│           │                               ┌──────┴──────┐         │
│           │                               │ PocketBase  │         │
│           │                               │ (port 8090) │         │
│           │                               │             │         │
│           │                               │ ┌─────────┐ │         │
│           └───────────────────────────────┼→│ pb_hooks│ │         │
│                                           │ │ orders  │ │         │
│                                           │ │ stats   │ │         │
│                                           │ └─────────┘ │         │
│                                           │ ┌─────────┐ │         │
│                                           │ │pb_migs  │ │         │
│                                           │ └─────────┘ │         │
│                                           │ ┌─────────┐ │         │
│                                           │ │ pb_data │ │         │
│                                           │ │(SQLite) │ │         │
│                                           │ └─────────┘ │         │
│                                           └─────────────┘         │
│                                                                   │
│                          单台服务器 (4C8G)                         │
└───────────────────────────────────────────────────────────────────┘
```

---

> **下一步行动**：请确认方案选择（B / C / B+），我将立即输出详细的实施计划和代码模板。
