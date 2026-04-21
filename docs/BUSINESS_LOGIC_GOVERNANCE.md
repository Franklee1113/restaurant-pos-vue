# 智能点菜系统 - 业务逻辑治理方案

> **文档用途**: 诊断当前业务逻辑混乱点，制定系统性治理方案，建立长期防退化机制  
> **目标读者**: 架构师、技术负责人、全栈开发工程师  
> **更新日期**: 2026-04-21  
> **版本**: v1.0

---

## 执行摘要

经过对订单状态机、后端 Hook、前端视图、顾客端、KDS、清台逻辑、沽清功能等全链路代码的深度分析，共识别出 **8 项业务逻辑混乱点**，按严重程度分为：

| 等级 | 数量 | 说明 |
|------|------|------|
| 🔴 **P0 — 数据一致性风险** | 2 项 | 可能导致订单金额/状态与实际情况不符 |
| 🟡 **P1 — 体验缺陷/操作漏洞** | 4 项 | 可能导致用户误操作或业务流程断裂 |
| 🟢 **P2 — 设计债务** | 2 项 | 短期影响小，但长期增加维护成本 |

---

## 一、混乱点全景图

```
业务逻辑混乱点
├── 🔴 P0 数据一致性风险
│   ├── BUG-GOV-001: 退菜/删菜无后端校验
│   └── BUG-GOV-002: 手动清台兜底过于宽松
├── 🟡 P1 体验缺陷/操作漏洞
│   ├── BUG-GOV-003: 顾客端与员工端沽清拦截策略不一致
│   ├── BUG-GOV-004: 顾客端无 SSE 实时感知沽清
│   ├── BUG-GOV-005: 铁锅鱼自动加锅底前后端检查不一致
│   └── BUG-GOV-006: 追加菜品状态重置缺乏界面提示
└── 🟢 P2 设计债务
    ├── BUG-GOV-007: 金额计算前后端实现存在差异
    └── BUG-GOV-008: completed 订单清台路径不直观
```

---

## 二、🔴 P0 级治理项（数据一致性风险）

### BUG-GOV-001: 退菜/删菜无后端校验

#### 问题描述

系统**无独立的"退菜"业务接口**。退菜通过**编辑订单**实现：在 `OrderFormView` 购物车中将菜品数量减至 0 或点击删除，提交后 `updateOrder` 发送新的 `items` 列表。

**关键风险**：后端 Hook 对 `newItems.length < oldItems.length`（删除菜品）的场景**无任何业务校验**：
- 已制作中的菜品（`cooking`）可以被删除
- 已做好的菜品（`cooked`）可以被删除
- 已上菜的菜品（`served`）可以被删除

**业务后果**：
1. 厨房已出餐，系统记录被删除，造成**账实不符**
2. 已打印的账单与系统数据不一致
3. 营业额统计缺失已出餐但未结账的菜品

#### 根因分析

```
前端: 提供删除按钮 → 用户可删除任意菜品
      ↓
API: updateOrder(orderId, { items: newItems })
      ↓
后端 Hook: 检测到 items 长度减少
           → 不触发 itemsAppended 逻辑
           → 直接按 newItems 重算金额
           → ❌ 不检查被删除菜品的原状态
```

#### 治理方案

**方案 A：后端增加删除校验（推荐）**

在 `pb_hooks/orders.pb.js` 的 `onRecordBeforeUpdateRequest` 中增加 `itemsRemoved` 检测：

```javascript
// 新增：检测是否有菜品被删除
const itemsRemoved = oldItems.length > newItems.length || 
  oldItems.some(oldItem => !newItems.find(ni => ni.dishId === oldItem.dishId))

if (itemsRemoved) {
  // 检查被删除的菜品原状态
  const removedItems = oldItems.filter(oi => !newItems.find(ni => ni.dishId === oi.dishId))
  const hasCookingOrServed = removedItems.some(item => 
    item.status === 'cooking' || item.status === 'cooked' || item.status === 'served'
  )
  
  if (hasCookingOrServed) {
    throw $app.newBadRequestError('已制作/已上菜的菜品不可直接删除，如需退菜请联系管理员')
  }
}
```

**方案 B：前端增加删除确认（辅助）**

在 `CartPanel` 中删除已制作/已上菜菜品时增加二次确认：

```typescript
// 如果该菜品原 status 非 pending，删除前确认
if (item.status && item.status !== 'pending') {
  const confirmed = await confirm(
    `该菜品已${statusLabel}，确定删除吗？删除后将无法恢复。`
  )
  if (!confirmed) return
}
```

**实施优先级**：🔴 **立即实施方案 A**，方案 B 作为体验增强可后续补充。

---

### BUG-GOV-002: 手动清台兜底过于宽松

#### 问题描述

`useClearTable.ts` 中的 `executeClearTable` 函数存在**过度兜底**：

| 异常场景 | 当前处理 | 风险 |
|---------|---------|------|
| 查询绑定订单失败 | `catch` 静默忽略，继续清台 | 可能清掉有未完成订单的桌台 |
| `completed→settled` 更新失败 | `catch` 静默忽略，继续清台 | completed 订单未归档为 settled |
| `tableStatus.id` 不存在 | 直接 `return` | 无提示，用户不知道清台未执行 |

**业务后果**：
1. 订单状态为 `completed` 但桌台已 `idle`，数据不一致
2. 未完成订单的桌台被错误清台，导致新订单可以占用该桌

#### 根因分析

```
executeClearTable(tableStatus)
  ├── if (currentOrderId) {
  │     try {
  │       const order = await OrderAPI.getOrder(currentOrderId)
  │       if (order.status === COMPLETED) {
  │         await OrderAPI.updateOrderStatus(order.id, SETTLED)
  │         // ❌ 失败不阻塞
  │       }
  │     } catch {
  │       // ❌ 查询失败也继续
  │     }
  │   }
  └── await TableStatusAPI.updateTableStatus(...)  // 无论如何都执行
```

#### 治理方案

**重构 `executeClearTable`，区分"可恢复异常"与"不可恢复异常"**：

```typescript
async function executeClearTable(tableStatus: TableStatus): Promise<void> {
  if (!tableStatus?.id) {
    throw new Error('桌台数据异常，请刷新页面后重试')
  }

  // 如果有绑定订单，必须先处理
  if (tableStatus.currentOrderId) {
    let order: Order | null = null
    
    try {
      order = await OrderAPI.getOrder(tableStatus.currentOrderId)
    } catch (e) {
      // 查询失败: 不确定订单状态，保守阻断
      throw new Error('无法确认当前桌台订单状态，请检查网络后重试')
    }
    
    if (order.status === OrderStatus.COMPLETED) {
      try {
        await OrderAPI.updateOrderStatus(order.id, OrderStatus.SETTLED)
      } catch (e) {
        // completed→settled 失败: 阻断清台，避免数据不一致
        throw new Error('订单状态更新失败，请稍后重试')
      }
    }
    
    // 如果订单是 pending/cooking/serving/dining，理论上不会走到这里
    // 因为 checkCanClearTable 已阻断，但作为兜底
    if (isActiveStatus(order.status)) {
      throw new Error('该桌还有未完成订单，无法清台')
    }
  }
  
  // 所有前置条件通过，执行清台
  await TableStatusAPI.updateTableStatus(tableStatus.id, {
    status: 'idle',
    currentOrderId: '',
  })
}
```

**上层调用处增加错误提示**：

```typescript
try {
  await executeClearTable(result.tableStatus)
  toast.success('清台成功')
} catch (e: any) {
  toast.error(e.message || '清台失败，请稍后重试')
}
```

**实施优先级**：🔴 **立即实施**。

---

## 三、🟡 P1 级治理项（体验缺陷/操作漏洞）

### BUG-GOV-003: 顾客端与员工端沽清拦截策略不一致

#### 问题描述

| 场景 | 员工端 | 顾客端 | 差异 |
|------|--------|--------|------|
| UI 展示 | 变灰、禁用按钮 | 变灰、**仍可点击** | 顾客端未禁用 |
| 加入购物车 | **硬拦截**，toast.warning | **允许加入** | 策略相反 |
| 提交时 | 阻断，要求手动移除 | **自动移除**，toast 提示 | 处理方式不同 |
| 实时同步 | SSE 秒级推送 | **无 SSE**，15s 轮询 | 感知延迟大 |

**业务后果**：
1. 顾客可能将已沽清菜品加入购物车，提交时突然被移除，体验差
2. 顾客端页面不刷新时，完全看不到沽清状态变化
3. 同一系统的两个入口对同一业务规则的处理方式截然相反，增加认知成本

#### 治理方案

**推荐方案：统一为"软拦截"策略，但提升顾客端体验**

理由：小型餐厅顾客直接下单的场景，不应因菜品临时沽清而阻断流程（可能顾客已选好一堆菜），自动移除+提示是更友好的方式。

**具体措施**：

1. **员工端保持硬拦截**（业务需要，防止员工误售）
2. **顾客端优化软拦截体验**：
   - 已沽清菜品的 Stepper 按钮置灰禁用（与员工端UI一致）
   - 在菜品卡片上明确显示"已沽清"标签，点击时 toast 提示
   - 购物车面板中已沽清菜品显示红色警告，数量设为 0 不可恢复
   - 允许提交时自动移除，但弹窗提示"以下菜品已沽清，已从订单中移除"

3. **顾客端接入 SSE（技术债清理）**：
   - 复用 `subscribeToDishes` 共享 SSE 连接
   - 菜品沽清变更时，购物车中的对应菜品自动标红

**实施优先级**：🟡 **本周内实施 UI 优化**，SSE 接入排期 2 周内。

---

### BUG-GOV-004: 顾客端无 SSE 实时感知沽清

#### 问题描述

顾客端 `CustomerOrderView.vue` **未接入** `subscribeToDishes` 的 SSE 实时推送，仅通过订单轮询（15s）获取数据。

**业务后果**：
- 员工标记沽清后，顾客端最长 15 秒内看不到变化
- 高峰期菜品沽清频繁，顾客可能反复尝试添加已沽清菜品

#### 治理方案

**方案：复用现有 SSE 基础设施**

顾客端在 `onMounted` 中建立 SSE 连接：

```typescript
// CustomerOrderView.vue
import { subscribeToDishes } from '@/api/pocketbase'

onMounted(() => {
  loadData()
  
  // 新增：接入 SSE
  const unsubscribe = subscribeToDishes((dish) => {
    // 更新菜品列表中的 soldOut 状态
    const idx = dishes.value.findIndex(d => d.id === dish.id)
    if (idx >= 0) {
      dishes.value[idx] = { ...dishes.value[idx], ...dish }
    }
    
    // 如果购物车中有该菜品且变为 soldOut，立即提示
    const cartItem = cart.value.find(c => c.dishId === dish.id)
    if (cartItem && dish.soldOut) {
      toast.warning(`"${dish.name}" 刚刚沽清，请从购物车中移除`)
    }
  })
  
  onUnmounted(() => unsubscribe())
})
```

**注意**：顾客端无认证，需确保 PocketBase 的 `dishes` 集合对匿名用户有读取权限（当前公共 API 已通过 `/public/dishes` 提供，SSE 可能需要额外的公开订阅配置）。

**实施优先级**：🟡 **与 BUG-GOV-003 一并实施**。

---

### BUG-GOV-005: 铁锅鱼自动加锅底前后端检查不一致

#### 问题描述

| 端 | 铁锅鱼自动加锅底 | 锅底沽清检查 | 风险 |
|----|-----------------|-------------|------|
| 员工端 `OrderFormView` | ✅ 触发 | ✅ 检查 | 若沽清则不加，提示用户 |
| 顾客端 `useCart.ts` | ✅ 触发 | ❌ **不检查** | 可能加入已沽清锅底 |
| 后端 Hook | — | ✅ 校验 | 创建/追加时拦截 soldOut |

**业务后果**：
- 顾客端铁锅鱼加入购物车时，锅底已沽清但仍被加入
- 顾客提交时锅底被后端拦截，整个订单可能需要重新确认
- 体验差，且与员工端行为不一致

#### 治理方案

**统一在 `useCart.ts` 的 `addToCart` 中增加锅底沽清检查**：

```typescript
// useCart.ts
function addToCart(dish: Dish) {
  // 现有逻辑...
  
  // 铁锅鱼自动加锅底
  const rule = DISH_RULES[dish.name]
  if (rule) {
    const addOnDish = allDishes.value.find(d => d.name === rule.add)
    if (addOnDish) {
      // 新增：检查锅底沽清
      if (addOnDish.soldOut) {
        toast.warning(`配菜 "${rule.add}" 已沽清，无法自动添加`)
        // 不自动添加锅底，但铁锅鱼仍加入购物车
      } else {
        // 原有逻辑：加入锅底
      }
    }
  }
}
```

**实施优先级**：🟡 **本周内实施**，改动面小，风险低。

---

### BUG-GOV-006: 追加菜品状态重置缺乏界面提示

#### 问题描述

当订单处于 `dining` 或 `serving` 状态追加菜品时，后端 Hook 会：
1. 重置订单状态为 `pending`
2. 重新开台（`table_status → dining`）

**当前问题**：员工在 `OrderFormView` 编辑页提交后，订单状态从 `dining` 跳回 `pending`，但**界面没有任何提示说明发生了什么**。

**业务后果**：
- 服务员可能困惑：明明客人已经在上菜了，为什么订单又变成"待确认"？
- 厨房可能重复制作已上过的菜品（如果员工误以为整单重新来过）

#### 治理方案

**方案 A：编辑页提交前增加确认弹窗（推荐）**

```typescript
// OrderFormView.vue submit() 中
if (isEdit.value && originalStatus.value === OrderStatus.DINING || originalStatus.value === OrderStatus.SERVING) {
  const confirmed = await confirm(
    '该订单已上菜完成（或正在上菜），追加新菜品后订单将回到"待确认"状态，厨房将重新制作。是否继续？'
  )
  if (!confirmed) return
}
```

**方案 B：追加成功后 toast 详细提示**

```typescript
toast.success('追加成功，订单已回到"待确认"状态，新菜品将送入厨房制作')
```

**方案 C：订单列表中增加"有追加"标识**

在 `OrderListView` 中，若订单有追加记录（可通过 `updated > created + 5min` 或新增字段 `hasAppend` 判断），显示"有追加"标签，提醒服务员和厨房注意。

**实施优先级**：🟡 **方案 A+B 本周实施**，方案 C 可后续排期。

---

## 四、🟢 P2 级治理项（设计债务）

### BUG-GOV-007: 金额计算前后端实现存在差异

#### 问题描述

前端 `MoneyCalculator` 与后端 Hook 的金额计算**代码路径不同**：

| 计算步骤 | 前端实现 | 后端实现 | 差异 |
|---------|---------|---------|------|
| 菜品小计 | `Math.round(price*100)*quantity/10` | `Math.round(price*100*quantity)` | 数量小数处理路径不同 |
| 餐具费 | `Math.round(qty*unitPrice*100)/100` | 同 | 一致 |
| 折扣(百分比) | `total - total*discount/10` | 同 | 一致 |
| 边界处理 | `min(discount,total)` `max(0,final)` | 同 | 一致 |

**风险**：虽然当前测试未发现问题，但前后端代码不同步意味着**任何一方的修改都可能导致不一致**。

#### 治理方案

**方案：提取共享计算逻辑到独立模块**

由于前端是 TypeScript、后端是 JavaScript (PocketBase VM)，无法直接共享代码，但可以：

1. **统一算法描述文档**：在 `docs/BUSINESS_PROCESS_FLOW.md` 的"金额计算双保险时序图"中明确算法步骤
2. **增加前后端一致性测试**：在 `security.spec.ts` 中增加大量边界案例，确保前后端输出一致
3. **注释同步**：在后端 Hook 和前端的对应位置添加交叉引用注释，如 `// 注意：此逻辑与 pb_hooks/orders.pb.js 第 XXX 行保持一致`

**长期方案**：考虑将金额计算抽取为 `MoneyCalculator` 的纯 JavaScript 版本，通过构建脚本同步到 `pb_hooks/` 目录。

**实施优先级**：🟢 **本月内增加一致性测试用例**。

---

### BUG-GOV-008: completed 订单清台路径不直观

#### 问题描述

当前 completed 订单的清台路径：

```
订单详情页:
  completed 状态 → 显示"清台"按钮 → 点击 → 弹窗确认 → 先调 API 改 settled → 再调 API 清台

订单列表页:
  completed 状态 → 显示"清台"小按钮 → 点击 → 同上
```

**问题**：
1. 服务员需要理解 `completed` 和 `settled` 的区别才能正确操作
2. 在小型餐厅一人多岗的场景下，操作者可能忘记清台，导致桌位一直占用
3. 订单列表中 completed 订单和 dining 订单的桌台都显示"占用中"，无法快速识别哪些待清台

#### 治理方案

**方案 A：订单列表增加"待清台"筛选标签（推荐）**

在 `OrderListView` 的状态筛选器中增加"待清台"选项，过滤 `status === completed` 的订单：

```typescript
const statusFilters = [
  { label: '全部', value: 'all' },
  { label: '待确认', value: 'pending' },
  { label: '制作中', value: 'cooking' },
  { label: '上菜中', value: 'serving' },
  { label: '用餐中', value: 'dining' },
  { label: '待清台', value: 'completed' }, // 新增
  { label: '已结束', value: 'settled,cancelled' },
]
```

**方案 B：桌台可视化时显示待清台状态**

未来桌台可视化功能中，`completed` 的桌台用特殊颜色（如黄色）标识，区别于 `dining`（红色）和 `idle`（绿色）。

**方案 C：completed 订单增加"一键结账+清台"按钮**

在 `OrderDetailView` 中，如果订单是 `dining` 状态，按钮显示"结账并清台"，点击后同时完成 `dining→completed→settled` 和清台，减少一步操作。

**方案 D（追加）：清台按钮条件渲染 ✅ 已实施**

在 `OrderDetailView` 和 `OrderListView` 中，清台按钮添加 `v-if="order.status === OrderStatus.COMPLETED"`：
- `COMPLETED` 状态 → 显示「清台」按钮
- `pending`/`cooking`/`serving`/`dining`/`settled`/`cancelled` → 不显示清台按钮

同时移除 `OrderListView` 中 `pendingTableNumbers` 快捷标签旁的「清台」小按钮（该区域本身只展示 pending/cooking 状态的桌号，永远不应清台）。

**实施优先级**：🟢 **方案 A + D 已实施**，方案 B/C 排期到桌台可视化迭代。

---

## 五、治理实施路线图

### 第一阶段：止血（本周内）

| 编号 | 事项 | 负责人 | 验收标准 |
|------|------|--------|---------|
| 🔴-1 | 后端 Hook 增加删除菜品校验 | 后端 | `cooking/cooked/served` 菜品删除时返回 400 |
| 🔴-2 | 重构 `executeClearTable` 异常处理 | 前端 | 查询失败/状态更新失败时阻断清台，有明确错误提示 |
| 🟡-1 | 顾客端菜品 Stepper 置灰 + 购物车 soldOut 标红 | 前端 | 已沽清菜品不可加入购物车 |
| 🟡-2 | `useCart.ts` 铁锅鱼加锅底前检查 soldOut | 前端 | 锅底沽清时不自动添加，toast 提示 |

### 第二阶段：体验修复（2 周内）

| 编号 | 事项 | 负责人 | 验收标准 |
|------|------|--------|---------|
| 🟡-3 | 追加菜品确认弹窗 + 成功提示 | 前端 | dining/serving 追加时弹窗确认 |
| 🟡-4 | 顾客端接入 SSE 实时沽清 | 前端 | 菜品沽清变更秒级同步到顾客端 |
| 🟢-1 | 订单列表增加"待清台"筛选 + 清台按钮条件渲染 | 前端 | 可筛选 completed 订单；非 completed 状态不显示清台按钮 |

### 第三阶段：建立防退化机制（本月内）

| 编号 | 事项 | 负责人 | 验收标准 |
|------|------|--------|---------|
| 🟢-2 | 前后端金额计算一致性测试 | 测试 | 覆盖 20+ 边界案例，前后端输出一致 |
| 🟢-3 | E2E 覆盖清台+取消+追加核心流程 | 测试 | Playwright 用例通过 |
| 🟢-4 | 更新 `CODE_CHECKLIST.md` | 文档 | 新增 BUG-GOV-001~008 根因分析 |

---

## 六、长期防退化机制

### 6.1 业务逻辑变更门禁

任何涉及以下领域的代码变更，必须通过**双人 Review + 业务场景走查**：

- [ ] 订单状态机增删状态或修改流转规则
- [ ] 后端 Hook 的金额计算逻辑
- [ ] 清台/开台的校验规则
- [ ] 前后端对同一业务规则的处理方式

### 6.2 文档即代码（Docs as Code）

- `BUSINESS_PROCESS_FLOW.md` 与代码变更同步更新
- PR 模板增加勾选：「如修改业务逻辑，同步更新业务流程图」

### 6.3 测试即契约（Tests as Contract）

- 新增业务规则时，**先写测试用例，再写实现**
- 关键业务路径（金额、状态、清台）必须同时覆盖前后端

---

## 附录：混乱点与业务场景对照表

| 混乱点 | 影响的核心业务场景 | 涉及文件 |
|--------|-------------------|---------|
| BUG-GOV-001 | 退菜、编辑订单减菜 | `pb_hooks/orders.pb.js`, `OrderFormView.vue` |
| BUG-GOV-002 | 手动清台、日结交班 | `useClearTable.ts`, `OrderListView.vue`, `OrderDetailView.vue` |
| BUG-GOV-003 | 顾客点餐、高峰期沽清 | `CustomerOrderView.vue`, `useCart.ts`, `OrderFormView.vue` |
| BUG-GOV-004 | 顾客实时感知菜品状态 | `CustomerOrderView.vue`, `pocketbase.ts` |
| BUG-GOV-005 | 顾客点铁锅鱼 | `useCart.ts`, `CustomerOrderView.vue` |
| BUG-GOV-006 | 已上菜订单追加菜品 | `OrderFormView.vue`, `pb_hooks/orders.pb.js` |
| BUG-GOV-007 | 折扣订单金额一致性 | `security.ts`, `pb_hooks/orders.pb.js` |
| BUG-GOV-008 | 日终清台、桌位释放 | `OrderListView.vue`, `OrderDetailView.vue` |
