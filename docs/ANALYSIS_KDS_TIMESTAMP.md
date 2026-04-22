# KDS 追加菜品时间显示问题 — 方案 B 全面分析报告

> 状态：待确认 | 作者：AI Assistant | 日期：2026-04-22

---

## 一、问题确认

### 1.1 现象描述

顾客在 **12:00** 首次下单（订单 `created = 12:00`），**12:30** 追加一份铁锅鱼。KDS 显示：

| 区域 | 当前显示 | 期望显示 | 偏差 |
|---|---|---|---|
| Pending "下单时间" | `12:00` | `12:30` | **30 分钟** |
| Cooking "已制作" | 从 `12:00` 起算 | 从实际开始制作起算 | 可能更大 |

### 1.2 根因

`OrderItem` 目前**没有任何时间戳字段**，所有时间都是订单级 `order.created`：

```ts
// src/api/pocketbase.ts
export interface OrderItem {
  dishId: string
  name: string
  price: number
  quantity: number
  remark?: string
  status?: 'pending' | 'cooking' | 'cooked' | 'served'
  // ❌ 没有 createdAt / startedAt / finishedAt
}
```

KDS 中两处关键代码：

```vue
<!-- Pending 区：显示订单创建时间 -->
<div class="text-xl font-bold">{{ formatTime(order.created) }}</div>

<!-- Cooking 区：计算从订单创建起的分钟数 -->
const minutes = Math.floor((now - new Date(order.created).getTime()) / 60000)
```

---

## 二、数据流全景分析

### 2.1 新建订单

```
OrderFormView.submit() / CustomerOrderView.submitOrder()
  ↓ 构造 items（无 createdAt）
  { dishId, name, price, quantity, remark, status: 'pending' }
  ↓
OrderAPI.createOrder() / PublicOrderAPI.createOrder()
  ↓
PB onRecordBeforeCreateRequest
  ↓ 解析 items → 校验 soldOut → 重算金额
  ↓ items 原样透传（后端不添加时间戳）
  ↓
数据库存储
```

### 2.2 追加菜品（追加后作为独立 item）

```
CustomerOrderView.submitOrder() 或员工端 append
  ↓ 构造 newItems（无 createdAt）
  ↓
PublicOrderAPI.appendOrderItems() / OrderAPI.appendOrderItems()
  ↓ mergeOrderItems(existing, newItems) — 当前仅设置 status='pending'
  ↓ OrderAPI.updateOrder(id, { items })
  ↓
PB onRecordBeforeUpdateRequest
  ↓ 检测 itemsAppended → 校验 soldOut
  ↓ items 原样透传（后端不添加时间戳）
  ↓
数据库存储
```

### 2.3 编辑订单（⚠️ 关键发现）

```
OrderFormView.loadData() — 编辑模式
  ↓ cart.value = order.items.map(item => ({
      dishId, name, price, quantity, remark, status
      // ❌ 丢失所有额外字段（如 createdAt / startedAt）
    }))
  ↓ 用户修改菜品/数量
  ↓
OrderFormView.submit()
  ↓ items: cart.value.map(item => ({...})) — 重新构造，无额外字段
  ↓ OrderAPI.updateOrder(id, orderData)
  ↓
数据库存储
```

**结论：编辑订单会导致任何 per-item 时间戳被丢弃。**

### 2.4 状态变更（cooking / cooked）

```
KitchenDisplayView.startCooking(order, itemIndex)
  ↓ OrderAPI.updateOrderItemStatus(id, itemIndex, 'cooking')
  ↓ items.map((item, idx) =>
       idx === itemIndex ? { ...item, status: itemStatus } : item
     )
  ↓ OrderAPI.updateOrder(id, { items })
  ↓
PB onRecordBeforeUpdateRequest
  ↓ 检测 itemStatusChanged → 推断订单整体状态
  ↓ items 原样透传
  ↓
数据库存储
```

**结论：`...item` 展开操作会保留现有字段（包括新增的时间戳），此路径安全。**

---

## 三、方案 B 设计（Pending + Cooking 双修正）

### 3.1 核心设计

给 `OrderItem` 增加两个可选时间戳：

```ts
export interface OrderItem {
  dishId: string
  name: string
  price: number
  quantity: number
  remark?: string
  status?: 'pending' | 'cooking' | 'cooked' | 'served'
  createdAt?: string   // 该 item 首次加入订单的时间
  startedAt?: string   // 该 item 进入 cooking 状态的时间
}
```

### 3.2 时间戳赋值规则

| 场景 | 谁赋值 | 字段 | 值 |
|---|---|---|---|
| 新建订单 | 后端 Hook（兜底） | `createdAt` | `new Date().toISOString()` |
| 追加菜品 | 前端 `mergeOrderItems` + 后端 Hook（兜底） | `createdAt` | `new Date().toISOString()` |
| 点击"开始制作" | 前端 `updateOrderItemStatus` | `startedAt` | `new Date().toISOString()` |
| 编辑订单后提交 | 前端 `submit()` | 保留原有值 | 不覆盖 |

### 3.3 KDS 显示规则

**Pending 区**：
- 下单时间显示 → `item.createdAt ?? order.created`
- 等待时长（可新增）→ `now - (item.createdAt ?? order.created)`

**Cooking 区**：
- "已制作"时间 → `now - (item.startedAt ?? item.createdAt ?? order.created)`
- 超时判断（>15 分钟）→ 同上

---

## 四、变更清单（文件级）

### 4.1 数据层

| 文件 | 改动 | 说明 |
|---|---|---|
| `src/api/pocketbase.ts` — `OrderItem` | 增加 `createdAt?: string`, `startedAt?: string` | 类型定义 |
| `src/schemas/order.schema.ts` — `orderItemSchema` | 增加 `.optional()` 字段 | Zod 校验兼容 |

### 4.2 业务逻辑层

| 文件 | 改动 | 说明 |
|---|---|---|
| `src/api/pocketbase.ts` — `mergeOrderItems` | 新 item 设置 `createdAt: new Date().toISOString()` | 追加时自动打时间戳 |
| `src/api/pocketbase.ts` — `updateOrderItemStatus` | `status === 'cooking'` 时设置 `startedAt` | 开始制作时自动打时间戳 |
| `src/api/pocketbase.ts` — `updateOrderItemStatus` | `status === 'pending'` 时清除 `startedAt`（如需支持"回退"场景） | 可选，视需求定 |

### 4.3 视图层

| 文件 | 改动 | 说明 |
|---|---|---|
| `src/views/KitchenDisplayView.vue` — Pending 时间 | `formatTime(order.created)` → `formatTime(item.createdAt ?? order.created)` | 显示 item 级时间 |
| `src/views/KitchenDisplayView.vue` — Cooking 时间 | `cookingOrderMeta` 从按 `order.id` 计算改为按 item 计算 | 需要重构数据结构 |
| `src/views/OrderFormView.vue` — `cart` 类型 | 增加 `createdAt?: string`, `startedAt?: string` | 编辑模式保留字段 |
| `src/views/OrderFormView.vue` — `loadData()` | 编辑模式加载时透传 `createdAt` / `startedAt` | **防数据丢失关键** |
| `src/views/OrderFormView.vue` — `submit()` | 构造 items 时透传 `createdAt` / `startedAt` | **防数据丢失关键** |
| `src/views/CustomerOrderView.vue` — `existingItems` | 透传额外字段（可选，纯显示用） | 减少信息丢失 |

### 4.4 后端 Hook

| 文件 | 改动 | 说明 |
|---|---|---|
| `pb_hooks/orders.pb.js` — `onRecordBeforeCreateRequest` | 遍历 items，无 `createdAt` 的 item 设置 `createdAt = new Date().toISOString()`，并 `record.set('items', JSON.stringify(items))` | 统一兜底 |
| `pb_hooks/orders.pb.js` — `onRecordBeforeUpdateRequest` | 当 `itemsAppended` 时，给新增 item 设置 `createdAt` | 追加场景兜底 |

### 4.5 测试层

| 文件 | 改动 | 说明 |
|---|---|---|
| `src/api/__tests__/pocketbase.spec.ts` | `mergeOrderItems` 断言新增 `createdAt` 存在；`updateOrderItemStatus` 断言 `startedAt` 在 cooking 时设置 | 单元测试 |
| `src/views/__tests__/KitchenDisplayView.spec.ts` | 更新 mock 数据包含 `createdAt` / `startedAt`，验证时间显示 | 组件测试 |
| `src/views/__tests__/OrderFormView.spec.ts` | 验证编辑模式加载和提交保留时间戳字段 | 组件测试 |

---

## 五、关键风险与应对措施

### 5.1 🔴 高风险：编辑订单丢失时间戳

**问题**：`OrderFormView.vue` 的 `loadData()` 在编辑模式下只提取 `dishId/name/price/quantity/remark/status`，`cart` 类型也不包含时间戳字段。编辑后提交会重新构造 items，导致 `createdAt` / `startedAt` 全部丢失。

**应对**：
- 必须修改 `cart` 类型和 `loadData()` / `submit()` 逻辑来保留这些字段
- 后端 Hook 兜底只能在创建/追加时设置，无法恢复已丢失的时间戳

### 5.2 🟡 中风险：Cooking 时间从"订单维度"改为"菜品维度"

**问题**：当前 `cookingOrderMeta` 是按 `order.id` 维度的 `Map`。改为按 item 计算后，同一订单的不同菜品会显示不同的"已制作"时间。厨房工作人员可能困惑："这个订单到底做了多久？"

**举例**：
- 订单 12:00 创建，菜品 A 12:05 开始制作 → 显示"已制作 5 分钟"
- 12:30 追加菜品 B，12:35 开始制作 → 显示"已制作 0 分钟"
- 同一订单卡片上两个菜品显示不同时间

**应对选项**：
- **选项 A**：保持 cooking 时间按订单维度（只改 pending 时间）— 改动最小，厨房认知统一
- **选项 B**：cooking 时间按菜品维度 — 时间最准确，但需评估厨房接受度

### 5.3 🟡 中风险：后端 Hook 修改 `items` JSON 字段

**问题**：`onRecordBeforeCreateRequest` 和 `onRecordBeforeUpdateRequest` 目前只读取 `items` 做校验，不修改。修改后需要 `record.set('items', JSON.stringify(items))`。

**潜在问题**：
- 如果 Hook 中其他逻辑也修改了 `items`，需要确保顺序正确
- `JSON.stringify` 可能改变字段顺序（不影响功能，但影响可读性）

**应对**：
- 在金额计算完成后、校验通过后再设置 `items`
- 需要仔细测试 Hook 的各条分支

### 5.4 🟢 低风险：现有数据兼容性

**问题**：现有订单的 items 没有 `createdAt` / `startedAt`。

**应对**：KDS 中所有时间戳读取都带 `?? fallback`：
- `item.createdAt ?? order.created`
- `item.startedAt ?? item.createdAt ?? order.created`

现有数据自动降级到订单级时间，无感知过渡。

### 5.5 🟢 低风险：数据库迁移

**问题**：需要改表结构吗？

**应对**：不需要。`items` 是 PocketBase JSON 字段，前端/Hook 添加的新字段自动透传持久化。

---

## 六、设计决策点（需用户确认）

### 决策 1：Cooking "已制作"时间按订单维度还是菜品维度？

| 维度 | 优点 | 缺点 |
|---|---|---|
| **订单维度**（只改 pending） | 改动小；厨房按订单统一管理，认知一致 | 追加菜品的 cooking 时间仍然偏长 |
| **菜品维度**（pending + cooking 都改） | 时间完全准确；能识别"哪些菜品制作超时" | 同一订单卡片显示多个时间，可能混乱；`cookingOrderMeta` 需重构 |

**建议**：先选**订单维度**（只解决 pending 时间显示问题）。cooking 时间是否改，取决于厨房实际工作模式 — 追加的菜品通常和原订单一起制作，按订单维度算也有一定合理性。

### 决策 2：是否在后端 Hook 中兜底设置 `createdAt`？

| 方案 | 优点 | 缺点 |
|---|---|---|
| **仅前端设置** | 后端 Hook 零改动；减少风险 | 如果存在非前端渠道（如直接 API、导入脚本），时间戳缺失 |
| **前端 + 后端兜底** | 所有途径统一；数据完整性最高 | 后端 Hook 需修改，增加测试负担 |

**建议**：选**前端 + 后端兜底**。后端 Hook 修改量很小（约 6 行），但能确保数据完整性。

### 决策 3：是否需要 `startedAt` 回退清除？

场景：厨师误点击"开始制作"，需要回退到 pending。

- **不清除**：`startedAt` 保留，再次进入 cooking 时不再更新（显示第一次点击时间）
- **清除**：pending 时清除 `startedAt`，每次进入 cooking 都重新计时

**建议**：不清除。"误点击后回退"是低频操作，保留第一次开始时间更符合实际制作流程。

---

## 七、工作量估算

### 方案 B-1：只改 Pending 时间（订单维度 cooking）

| 阶段 | 内容 | 预估时间 |
|---|---|---|
| 前端开发 | 类型定义 + mergeOrderItems + updateOrderItemStatus + OrderFormView 编辑保留 + KDS pending 时间 | 1.5 h |
| 后端开发 | Hook 中 items createdAt 兜底设置 | 0.5 h |
| 测试修改 | pocketbase.spec + KitchenDisplayView.spec + OrderFormView.spec | 1 h |
| 构建部署 | npm run build → deploy.sh | 0.5 h |
| **合计** | | **~3.5 h** |

### 方案 B-2：Pending + Cooking 时间都改（菜品维度）

在 B-1 基础上增加：

| 阶段 | 内容 | 预估时间 |
|---|---|---|
| KDS cooking 重构 | `cookingOrderMeta` 从 Map<orderId> 改为按 item 计算；模板中多处引用调整 | 1.5 h |
| 测试修改 | KitchenDisplayView.spec 覆盖 cooking 时间计算 | 0.5 h |
| **合计** | | **~5.5 h** |

---

## 八、回滚策略

若部署后出现问题：

1. **前端回滚**：`sudo rm -rf /var/www/restaurant-pos && sudo cp -r /var/www/restaurant-pos-backups/<timestamp> /var/www/restaurant-pos && sudo systemctl restart nginx`
2. **Hook 回滚**：`pb_hooks/orders.pb.js` 备份在 `/opt/pocketbase/pb_hooks/` 部署时自动备份（如有需要可手动恢复）
3. **数据安全**：新增字段为可选，回滚后旧代码忽略 `createdAt` / `startedAt`，现有数据不受影响

---

## 九、结论与建议

### 确认的问题

✅ **问题确实存在**：追加菜品的 KDS pending "下单时间"和 cooking "已制作"时间都基于 `order.created`，对追加菜品严重失准。

### 推荐实施路径

**第一阶段（推荐立即做）**：方案 B-1
- 增加 `createdAt` 字段
- 只改 KDS pending 区的"下单时间"
- cooking "已制作"保持订单维度
- 风险低，收益明确

**第二阶段（评估后做）**：方案 B-2
- 增加 `startedAt` 字段
- cooking "已制作"改为按菜品维度
- 需要与厨房确认工作习惯后再实施

### 需要用户拍板的决策

1. **Cooking 时间维度** → 订单维度（保守）还是 菜品维度（激进）？
2. **后端兜底** → 仅前端 还是 前端+后端 Hook？
3. **是否分阶段实施** → 先做 B-1 验证，再做 B-2？

---

*报告完。请确认后实施。*
