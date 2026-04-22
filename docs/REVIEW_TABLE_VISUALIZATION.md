# 全景餐桌管理页面 — 设计方案评审报告

> 评审日期：2026-04-22 | 评审人：AI Assistant | 状态：待确认

---

## 一、评审结论

**总体评价**：设计方案方向正确，信息架构合理，但存在 3 个必须修正的数据模型问题、2 个性能隐患、以及若干 UI/UX 细节建议。

**结论**：建议采纳修正后的方案实施。

---

## 二、🔴 关键问题（必须修正）

### 问题 1：`pending_clear` 桌台状态实际不存在

**现状**：`TableStatus` 接口定义了 `status: 'idle' | 'dining' | 'pending_clear'`，但深入检查后端 Hook 后发现：

```js
// pb_hooks/orders.pb.js — onRecordAfterUpdateRequest
if (!tableNo || (status !== 'settled' && status !== 'cancelled')) return
ts.set('status', 'idle')   // ← 只有 settled/cancelled → idle
```

- `completed` 状态**不会**自动清台
- `pending_clear` 状态**从未**在任何 Hook 中被设置
- 实际存在的 `table_status` 状态只有 `idle` 和 `dining`

**影响**：设计方案中按 `table_status.status === 'pending_clear'` 判断"待清台"永远为假。

**修正方案**：

桌台卡片的"待清台"判断逻辑应改为**复合判断**：

```ts
function getTableDisplayStatus(ts: TableStatus | undefined, order: Order | null) {
  if (!ts || ts.status === 'idle') return 'idle'
  if (order?.status === 'completed') return 'pending_clear'  // ← 视觉上区分
  return 'dining'
}
```

即：**table_status 只有 2 种真实状态，但前端渲染需结合订单状态产生 3 种视觉状态。**

---

### 问题 2：空闲桌台可能没有 `table_status` 记录

**现状**：`table_status` 记录是**按需创建**的（首次在该桌开台时创建），不是所有配置好的桌号都有记录。

```js
// pb_hooks/orders.pb.js — onRecordAfterCreateRequest
const records = $app.dao().findRecordsByFilter('table_status', 'tableNo = {:tableNo}', ...)
if (records.length > 0) {
  // 更新现有记录
} else {
  // 创建新记录
}
```

**影响**：`TableStatusAPI.getAllTableStatuses()` 返回的结果可能**不包含所有空闲桌台**。如果 A5 桌从未被使用过，`getAllTableStatuses()` 不会返回 A5。

**修正方案**：

桌台卡片构建逻辑应以 `settingsStore.tableNumbers` 为**全集**，`table_status` 为**增量数据**：

```ts
const tableCards = computed(() => {
  const allTableNos = settingsStore.settings?.tableNumbers || []
  return allTableNos.map((tableNo) => {
    const ts = tableStatusMap.value.get(tableNo)
    const order = orderMap.value.get(tableNo)
    return {
      tableNo,
      // 没有 ts 记录 → 一定是空闲
      tableStatus: ts?.status || 'idle',
      currentOrderId: ts?.currentOrderId,
      order: order || null,
    }
  })
})
```

---

### 问题 3：一个桌台理论上只有一个活跃订单，但防御性设计不足

**现状**：
- 后端 Hook `onRecordAfterCreateRequest` 在创建新订单时检查桌台是否已被占用
- 前端 `OrderFormView` 在新建订单前也检查桌台占用
- 因此**正常情况下**不会出现一个桌台多个活跃订单

**但**：历史数据迁移、异常删除、Hook 执行失败等边缘情况可能导致一桌多单。

**影响**：当前设计假设 `orderMap.get(tableNo)` 返回唯一订单，如果出现多个订单，后面的会覆盖前面的。

**修正方案**：

```ts
// 使用 Map<tableNo, Order[]> 而非 Map<tableNo, Order>
const ordersByTable = computed(() => {
  const map = new Map<string, Order[]>()
  for (const order of activeOrders.value) {
    const list = map.get(order.tableNo) || []
    list.push(order)
    map.set(order.tableNo, list)
  }
  return map
})

// 桌台卡片取第一个（currentOrderId 匹配优先）
const primaryOrder = computed(() => {
  const list = ordersByTable.value.get(tableNo) || []
  if (list.length === 0) return null
  if (list.length === 1) return list[0]
  // 多个订单时优先匹配 currentOrderId
  const matched = list.find((o) => o.id === ts?.currentOrderId)
  return matched || list[0]
})
```

同时卡片上如果检测到一桌多单，显示小徽章 `"+1"` 提示异常。

---

## 三、🟡 性能隐患

### 隐患 1：订单查询范围过大

**现状**：设计建议加载所有活跃订单：
```ts
OrderAPI.getOrders(1, 200, "status!='settled' && status!='cancelled'")
```

**问题**：
- 如果餐厅营业时间长、订单量大，200 条可能不够
- 没有分页，数据量大会导致响应慢
- 实际上我们只需要**当前占用中的桌台**对应的订单

**优化方案**：

**方案 A（推荐）**：只查询占用中桌台对应的订单

```ts
const tableNos = settingsStore.settings?.tableNumbers || []
const activeTables = tableStatuses.value
  .filter((ts) => ts.status === 'dining')
  .map((ts) => ts.tableNo)

if (activeTables.length === 0) {
  // 全部空闲，无需查询订单
  activeOrders.value = []
} else {
  // 用 IN 查询只拉取占用桌的订单
  const tableFilter = activeTables
    .map((t) => `tableNo='${escapePbString(t)}'`)
    .join(' || ')
  const filter = `(${tableFilter}) && status!='settled' && status!='cancelled'`
  const res = await OrderAPI.getOrders(1, 100, filter)
  activeOrders.value = res.items
}
```

优点：数据量最小，性能最好。  
缺点：如果 table_status 和 orders 数据不一致（如桌台状态为 dining 但订单已 settled），会漏掉数据。

**方案 B（保守）**：保持原设计，但加缓存
- 首次加载全量活跃订单
- SSE 实时推送时增量更新
- `useAutoRefresh` 10 秒轮询兜底

**建议**：先用方案 A，如果数据一致性问题暴露再降级到方案 B。

---

### 隐患 2：SSE 订阅过滤条件与数据需求不匹配

**现状**：设计建议：
```ts
subscribeToOrders("status!='settled' && status!='cancelled'")
```

**问题**：
- 当订单状态从 `completed` → `settled` 时，SSE 推送后该订单被过滤掉
- 桌台卡片上该桌的订单数据消失，但 `table_status` 可能还没更新为 `idle`
- 导致卡片显示"占用中"但无订单数据的异常状态

**优化方案**：

SSE 不过滤 settled/cancelled，前端收到更新后自己判断是否需要移除：

```ts
subscribeToOrders('', (record) => {
  // 收到任何订单更新
  const idx = activeOrders.value.findIndex((o) => o.id === record.id)
  if (record.status === 'settled' || record.status === 'cancelled') {
    // 移除已结束订单
    if (idx !== -1) activeOrders.value.splice(idx, 1)
  } else {
    // 更新或新增
    if (idx !== -1) {
      activeOrders.value[idx] = record
    } else {
      activeOrders.value.push(record)
    }
  }
})
```

这样 settled 订单的清台流程完成后，`table_status` 更新为 `idle`，卡片自然刷新。

---

## 四、🟢 UI/UX 建议（可选优化）

### 建议 1：空闲桌台卡片应极简

用户已确认不要开台按钮。空闲卡片内容过少时，建议：

```
┌─────────────────────────────┐
│  │ B5                       │
│  │                          │
│  │        🟢 空闲            │  ← 垂直居中，大字号
│  │                          │
│  │        ─────────          │
│  │        点击开台            │  ← 小字提示，不是按钮
│  └─────────────────────────────┘
```

空闲卡片整体可点击跳转新建订单（预填桌号），不需要显式按钮。

### 建议 2：卡片菜品区超过 4 道的处理

当前设计建议 `max-h-24 overflow-y-auto`。建议改为**折叠/展开**：

```
├ 铁锅鱼 ×1      🔵 制作中
├ 锅底 ×1        ⚪ 待制作
├ 米饭 ×2        ⚪ 待制作
└ ─── 还有 2 道 ▼ ───         ← 点击展开
```

原因：
- 滚动条在卡片内体验差（移动端尤其）
- 一眼能看到"还有几道菜"比滚来滚去更直观

### 建议 3：金额和人数的可视化优先级

当前设计：
```
👤 4人    💰 ¥268
```

建议改为：
```
💰 ¥268    👤 4人
```

原因：店长/服务员扫视时，金额是比人数更优先关注的信息。

### 建议 4：completed 状态的订单卡片需要"清台"按钮高亮

当前设计清台按钮和查看/编辑按钮并列。建议：

```
[查看] [编辑] [🧹 清台]     ← 清台按钮用橙色/黄色强调
```

原因：待清台桌台是服务流程的瓶颈，需要视觉突出以提示服务员及时处理。

### 建议 5：新增「按订单状态筛选」

当前筛选栏只有「桌台状态筛选」（空闲/占用/待清台）。建议增加「订单状态筛选」：

```
[桌台: 全部 ▼] [订单: 全部 ▼] [🔍 搜索桌号...] [⟳ 刷新]
```

订单状态筛选选项：待确认 / 制作中 / 上菜中 / 用餐中 / 已结账

场景：店长只想看"制作中"的桌台，快速催菜。

---

## 五、📋 修正后的文件清单

| # | 文件 | 类型 | 变更说明 |
|---|---|---|---|
| 1 | `src/views/TableVisualizationView.vue` | 新建 | 主页面（含复合状态判断、一桌多单防御、折叠菜品列表） |
| 2 | `src/router/index.ts` | 修改 | 新增 `/tables` 路由 |
| 3 | `src/layouts/MainLayout.vue` | 修改 | 导航栏新增"桌台全景" |
| 4 | `src/api/pocketbase.ts` | 修改（可选） | 如需批量查询优化，可新增 `getOrdersByTableNos(tableNos[])` |
| 5 | `src/views/__tests__/TableVisualizationView.spec.ts` | 新建 | 组件测试 |

---

## 六、修正后的关键代码片段

### 6.1 桌台显示状态判断（核心修正）

```ts
function getTableDisplayStatus(
  ts: TableStatus | undefined,
  order: Order | null,
): 'idle' | 'dining' | 'pending_clear' {
  if (!ts || ts.status === 'idle') return 'idle'
  // table_status 为 dining，但订单已完成 → 视觉上显示"待清台"
  if (order?.status === 'completed') return 'pending_clear'
  return 'dining'
}
```

### 6.2 一桌多单防御

```ts
const ordersByTable = computed(() => {
  const map = new Map<string, Order[]>()
  for (const order of activeOrders.value) {
    const list = map.get(order.tableNo) || []
    list.push(order)
    map.set(order.tableNo, list)
  }
  return map
})

const tableCards = computed(() => {
  const allTableNos = settingsStore.settings?.tableNumbers || []
  return allTableNos.map((tableNo) => {
    const ts = tableStatusMap.value.get(tableNo)
    const orderList = ordersByTable.value.get(tableNo) || []
    const primaryOrder = orderList.length > 1
      ? (orderList.find((o) => o.id === ts?.currentOrderId) || orderList[0])
      : orderList[0] || null

    return {
      tableNo,
      displayStatus: getTableDisplayStatus(ts, primaryOrder),
      tableStatus: ts?.status || 'idle',
      currentOrderId: ts?.currentOrderId,
      order: primaryOrder,
      extraOrders: orderList.length > 1 ? orderList.length - 1 : 0,
    }
  })
})
```

### 6.3 性能优化的数据加载

```ts
async function loadData() {
  loading.value = true
  try {
    // 1. 先加载桌台状态
    const tableRes = await TableStatusAPI.getAllTableStatuses()
    tableStatuses.value = tableRes

    // 2. 只查询占用中桌台的订单（性能优化）
    const diningTables = tableRes
      .filter((ts) => ts.status === 'dining')
      .map((ts) => ts.tableNo)

    if (diningTables.length > 0) {
      const tableFilter = diningTables
        .map((t) => `tableNo='${escapePbString(t)}'`)
        .join(' || ')
      const filter = `(${tableFilter}) && status!='settled' && status!='cancelled'`
      const orderRes = await OrderAPI.getOrders(1, 100, filter)
      activeOrders.value = orderRes.items
    } else {
      activeOrders.value = []
    }
  } catch (err) {
    toast.error('加载失败')
  } finally {
    loading.value = false
  }
}
```

---

## 七、工作量估算（修正后）

| 阶段 | 内容 | 时间 |
|---|---|---|
| 页面开发 | TableVisualizationView.vue（含复合状态、一桌多单、折叠菜品、双维度筛选） | 5~6 h |
| 路由/导航 | 新增路由 + 导航栏 | 0.5 h |
| 性能优化 | 按需查询 + SSE 过滤修正 | 1 h |
| 组件测试 | mock 数据 + 状态组合覆盖 | 2~3 h |
| 联调测试 | 清台流程 + 实时更新 + 空状态 | 1 h |
| **合计** | | **~10 h** |

---

## 八、评审总结

| 类别 | 数量 | 说明 |
|---|---|---|
| 🔴 关键问题 | 3 | `pending_clear` 不存在、空闲桌台无 ts 记录、一桌多单防御 |
| 🟡 性能隐患 | 2 | 订单查询范围过大、SSE 过滤条件不匹配 |
| 🟢 UI/UX 建议 | 5 | 空闲卡片极简、菜品折叠、金额优先、清台高亮、双维度筛选 |

**建议实施顺序**：
1. 先按修正后的方案开发核心页面（含 3 个关键问题修复）
2. 性能优化（隐患 1、2）可在联调阶段验证后决定是否做
3. UI/UX 建议可分批迭代，不影响核心功能上线

---

*评审完。请确认是否进入实施阶段。*
