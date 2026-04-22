# 全景餐桌管理页面 — UI/UX 设计方案

> 版本：v1.0 | 日期：2026-04-22 | 状态：待评审

---

## 一、页面定位

**页面名称**：桌台全景视图 (`TableVisualizationView`)  
**路由**：`/tables`（导航栏新增"桌台全景"）  
**核心目标**：一屏掌握全店所有桌台的实时占用、订单状态、菜品制作进度、金额、人数，替代传统的列表式翻查。

**与现有页面的关系**：
- `OrderListView` → 以订单为维度，适合搜索/筛选/导出
- `KitchenDisplayView` → 以菜品为维度，适合厨师按菜制作
- `TableVisualizationView` → **以桌台为维度**，适合店长/服务员快速定位桌台状态、催菜、清台

---

## 二、信息架构

### 2.1 单桌信息模型

```
TableCard
├── 桌号 (大字号，视觉锚点)
├── 桌台状态 (idle/dining/pending_clear) → 决定卡片底色/边框
├── 当前订单
│   ├── 订单状态 (pending/cooking/serving/dining/completed)
│   ├── 用餐人数
│   ├── 订单金额 (finalAmount)
│   ├── 订单号
│   └── 菜品列表 (每个 item 独立显示)
│       ├── 菜品名 × 数量
│       ├── 制作状态 (pending/cooking/cooked/served)
│       └── 备注 (如有)
└── 快捷操作
    ├── 查看订单 → 跳转 OrderDetailView
    ├── 编辑订单 → 跳转 OrderFormView (edit)
    ├── 打印账单
    └── 清台 (completed 状态才显示)
```

### 2.2 状态映射

**桌台状态**（决定卡片视觉层级）：

| 桌台状态 | 语义 | 卡片样式 | 颜色 |
|---|---|---|---|
| `idle` | 空闲 | 白色底 + 绿色左边框 | 🟢 |
| `dining` | 占用中 | 白色底 + 橙色左边框 | 🟠 |
| `pending_clear` | 待清台 | 白色底 + 黄色左边框 | 🟡 |

**订单状态**（决定顶部标签）：

| 订单状态 | 标签文案 | 标签颜色 |
|---|---|---|
| `pending` | 待确认 | 琥珀色 |
| `cooking` | 制作中 | 蓝色 |
| `serving` | 上菜中 | 紫色 |
| `dining` | 用餐中 | 橙色 |
| `completed` | 已结账 | 绿色 |
| `cancelled` | 已取消 | 红色（理论上桌台应 idle） |

**菜品制作状态**（决定每行菜品的小圆点/标签）：

| 菜品状态 | 标识 | 颜色 |
|---|---|---|
| `pending` / `undefined` | ● 待制作 | 灰色/琥珀色 |
| `cooking` | ● 制作中 | 蓝色 + 脉冲动画 |
| `cooked` | ● 已做好 | 绿色 |
| `served` | ● 已上菜 | 灰色（可折叠或淡化） |

---

## 三、UI 设计

### 3.1 整体布局

```
┌─────────────────────────────────────────────────────────────┐
│  智能点菜系统  订单管理  新建订单  [桌台全景]  数据统计  设置    │ ← Nav
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌────────┬────────┬────────┬────────┬────────┐            │
│  │ 总桌数 │ 空闲   │ 占用中 │ 待清台 │ 今日营收│            │ ← 统计栏
│  │   20   │   8    │   9    │   3    │ ¥3,240 │            │
│  └────────┴────────┴────────┴────────┴────────┘            │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 全部 ▼ | 仅看占用 ▼ | 大厅 ▼ | 🔍 搜索桌号...        │   │ ← 筛选栏
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐      │
│  │ 🟢 A1        │ │ 🟠 A2        │ │ 🟠 A3        │      │
│  │   空闲       │ │   制作中     │ │   用餐中     │      │
│  │              │ │   4人 ¥268   │ │   6人 ¥420   │      │ ← 桌台卡片网格
│  │  [开台]      │ │   铁锅鱼×1   │ │   铁锅鱼×1   │      │
│  │              │ │   ● 制作中   │ │   ● 已上菜   │      │
│  │              │ │   锅底×1     │ │   锅底×1     │      │
│  │              │ │   ● 待制作   │ │   ● 已做好   │      │
│  │              │ │              │ │   凉拌黄瓜×2 │      │
│  │              │ │  [查看][清台]│ │   ● 待制作×2 │      │
│  │              │ │              │ │              │      │
│  │              │ │              │ │  [查看][编辑]│      │
│  └──────────────┘ └──────────────┘ └──────────────┘      │
│                                                             │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐      │
│  │ 🟡 A4        │ │ 🟢 A5        │ │ ...          │      │
│  │   待清台     │ │   空闲       │ │              │      │
│  │   已结账     │ │              │ │              │      │
│  │   2人 ¥156   │ │              │ │              │      │
│  │              │ │              │ │              │      │
│  │  [查看][清台]│ │  [开台]      │ │              │      │
│  └──────────────┘ └──────────────┘ └──────────────┘      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 统计栏

顶部固定一排统计卡片，实时反映全店状态：

```
┌────────────┬────────────┬────────────┬────────────┬────────────┐
│   🏪 20    │   🟢 8     │   🟠 9     │   🟡 3     │   ¥3,240  │
│   总桌数   │   空闲     │  占用中    │  待清台    │  今日营收  │
└────────────┴────────────┴────────────┴────────────┴────────────┘
```

- 空闲/占用中/待清台数字点击可快速筛选对应状态的桌台
- 今日营收通过活跃订单 `finalAmount` 累加计算

### 3.3 筛选栏

```
[全部状态 ▼] [🔍 搜索桌号...] [⟳ 刷新]
```

- **状态筛选**：全部 / 空闲 / 占用中 / 待清台
- **搜索桌号**：实时过滤（按桌号关键词）

### 3.4 桌台卡片（核心组件）

#### 3.4.1 卡片规格

- 桌面端：`grid-cols-5`（约 220px~240px 宽）
- 笔记本：`grid-cols-4`
- 平板：`grid-cols-3`
- 手机：`grid-cols-2`
- 卡片高度：固定 `h-64` 或 `min-h-[16rem]`，内容过多时内部滚动

#### 3.4.2 卡片内部结构

```
┌─────────────────────────────┐
│  │ A1                       │  ← 左边框 4px 颜色指示
│  │                          │
│  │  🟢 空闲                 │  ← 桌台状态（大标签）
│  │                          │
│  │  ─────────────────────   │  ← 分隔线（空闲状态无下方内容）
│  │  [+ 开台]                │  ← 快捷操作按钮
│  └─────────────────────────────┘

┌─────────────────────────────┐
│  │ A2                       │
│  │                          │
│  │  🔵 制作中               │  ← 订单状态标签
│  │  👤 4人    💰 ¥268       │  ← 人数 + 金额
│  │  #O202604220012          │  ← 订单号（小号灰色）
│  │  ─────────────────────   │
│  │  🍽️ 菜品（3道）          │  ← 菜品列表标题
│  │  ├ 铁锅鱼 ×1             │
│  │  │  🔵 制作中            │  ← 脉冲动画指示
│  │  ├ 锅底 ×1               │
│  │  │  ⚪ 待制作            │
│  │  ├ 米饭 ×2               │
│  │  │  ⚪ 待制作            │
│  │  ─────────────────────   │
│  │  [查看] [编辑] [打印]    │  ← 快捷操作
│  └─────────────────────────────┘
```

#### 3.4.3 菜品状态标识设计

```css
/* 待制作 */
.status-pending { @apply w-2 h-2 rounded-full bg-gray-300; }

/* 制作中 — 脉冲动画 */
.status-cooking { 
  @apply w-2 h-2 rounded-full bg-blue-500;
  animation: pulse-dot 1.5s infinite;
}
@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

/* 已做好 */
.status-cooked { @apply w-2 h-2 rounded-full bg-green-500; }

/* 已上菜 */
.status-served { @apply w-2 h-2 rounded-full bg-gray-200; }
```

#### 3.4.4 追加菜品显示

由于已实施追加不合并方案（Solution A），同一 dishId 可能出现多次：

```
├ 铁锅鱼 ×1
│  🔵 制作中        ← 第一道，12:00 下单，已在做
├ 铁锅鱼 ×1
│  ⚪ 待制作        ← 追加的，12:30 下单，待制作
```

每条独立显示，不合并。名称相同但状态不同，一目了然。

### 3.5 空闲桌台卡片

```
┌─────────────────────────────┐
│  │ B5                       │
│  │                          │
│  │  🟢 空闲                 │
│  │                          │
│  │  ─────────────────────   │
│  │                          │
│  │  （空白，无操作按钮）      │
│  └─────────────────────────────┘
```

### 3.6 待清台卡片

```
┌─────────────────────────────┐
│  │ C3                       │
│  │                          │
│  │  🟡 待清台               │
│  │  🟢 已结账               │
│  │  👤 2人    💰 ¥156       │
│  │  ─────────────────────   │
│  │  [查看] [清台]           │  ← 清台按钮高亮
│  └─────────────────────────────┘
```

---

## 四、交互设计

### 4.1 点击行为

| 元素 | 行为 |
|---|---|
| 卡片整体（非按钮区域） | 跳转该桌当前订单的 `OrderDetailView` |
| 「查看」按钮 | 同上 |
| 「编辑」按钮 | 跳转 `OrderFormView` (edit mode) |
| 「打印」按钮 | 调用 `printBill(order, settings)` |
| 「清台」按钮 | 调用 `useClearTable` 流程，成功后卡片刷新为空闲 |
| 空闲桌台卡片点击 | 跳转 `OrderFormView` (create mode)，`tableNo` 预填 |

### 4.2 实时更新

- **SSE 订阅**：`subscribeToOrders("status!='settled' && status!='cancelled'")`
- **自动刷新**：`useAutoRefresh` 10 秒兜底（SSE 失败时）
- **数据变化动画**：卡片状态变化时添加 300ms 过渡动画

### 4.3 空状态

- 全部桌台空闲时：中央显示 "🎉 所有桌台空闲，点击任意桌台开台"
- 筛选结果为空："没有找到符合条件的桌台"

---

## 五、数据聚合逻辑

### 5.1 加载策略

```ts
async function loadData() {
  loading.value = true
  try {
    // 1. 并行加载桌台状态 + 活跃订单
    const [tableRes, orderRes] = await Promise.all([
      TableStatusAPI.getAllTableStatuses(),
      OrderAPI.getOrders(1, 200, "status!='settled' && status!='cancelled'"),
    ])

    tableStatuses.value = tableRes
    activeOrders.value = orderRes.items

    // 2. 按 tableNo 索引订单（一桌理论上只有一个活跃订单）
    orderMap.value = new Map()
    for (const order of activeOrders.value) {
      orderMap.value.set(order.tableNo, order)
    }

    // 3. 构建完整的桌台卡片数据
    buildTableCards()
  } finally {
    loading.value = false
  }
}
```

### 5.2 桌台卡片构建逻辑

```ts
interface TableCardData {
  tableNo: string
  tableStatus: 'idle' | 'dining' | 'pending_clear'
  currentOrderId?: string
  order?: Order        // 可能为 null（空闲桌）
}

const tableCards = computed(() => {
  const settings = settingsStore.settings
  const allTableNos = settings?.tableNumbers || []

  return allTableNos.map((tableNo) => {
    const ts = tableStatusMap.value.get(tableNo)
    const order = orderMap.value.get(tableNo)

    return {
      tableNo,
      tableStatus: ts?.status || 'idle',
      currentOrderId: ts?.currentOrderId,
      order: order || null,
    }
  })
})
```

### 5.3 统计计算

```ts
const stats = computed(() => {
  const total = tableCards.value.length
  const idle = tableCards.value.filter((t) => t.tableStatus === 'idle').length
  const dining = tableCards.value.filter((t) => t.tableStatus === 'dining').length
  const pendingClear = tableCards.value.filter((t) => t.tableStatus === 'pending_clear').length
  const revenue = activeOrders.value.reduce((sum, o) => sum + (o.finalAmount || 0), 0)
  return { total, idle, dining, pendingClear, revenue }
})
```

---

## 六、技术实现方案

### 6.1 文件清单

| # | 文件 | 类型 | 说明 |
|---|---|---|---|
| 1 | `src/views/TableVisualizationView.vue` | 新文件 | 主页面 |
| 2 | `src/router/index.ts` | 修改 | 新增 `/tables` 路由 |
| 3 | `src/layouts/MainLayout.vue` | 修改 | 导航栏新增"桌台全景" |
| 4 | `src/api/pocketbase.ts` | 修改（如有） | 如需要新增批量查询接口 |
| 5 | `src/views/__tests__/TableVisualizationView.spec.ts` | 新文件 | 组件测试 |

### 6.2 路由配置

```ts
// src/router/index.ts
{
  path: 'tables',
  name: 'tableVisualization',
  component: () => import('@/views/TableVisualizationView.vue'),
}
```

### 6.3 导航配置

```ts
// src/layouts/MainLayout.vue
const navItems = [
  { path: '/', label: '订单管理', name: 'orderList' },
  { path: '/create-order', label: '新建订单', name: 'createOrder' },
  { path: '/tables', label: '桌台全景', name: 'tableVisualization' },  // ← 新增
  { path: '/statistics', label: '数据统计', name: 'statistics' },
  { path: '/settings', label: '系统设置', name: 'settings' },
]
```

### 6.4 响应式断点

```css
/* 桌面端 */
@media (min-width: 1280px) { grid-cols-5 }
/* 笔记本 */
@media (min-width: 1024px) { grid-cols-4 }
/* 平板 */
@media (min-width: 768px)  { grid-cols-3 }
/* 手机 */
@media (max-width: 767px)  { grid-cols-2 }
```

---

## 七、边缘情况处理

| 场景 | 处理方案 |
|---|---|
| 桌台状态 `idle` 但 `currentOrderId` 非空 | 以 `tableStatus.status` 为准显示空闲，但可灰色小字提示"绑定订单 #xxx" |
| 订单 `status=cancelled` 但桌台仍为 `dining` | 卡片显示订单状态为"已取消"+桌台状态"占用中"，提示异常 |
| 一个桌台有多个活跃订单 | 按 `currentOrderId` 显示主订单，其余订单数用小徽章提示"+1" |
| 菜品列表超过 5 道 | 卡片内菜品区加 `max-h-24 overflow-y-auto`，显示滚动条 |
| 无桌号配置 | 显示空状态"请在系统设置中配置桌号" |

---

## 八、工作量估算

| 阶段 | 内容 | 时间 |
|---|---|---|
| 页面开发 | `TableVisualizationView.vue` 完整实现（数据加载、卡片渲染、筛选、交互） | 4~5 h |
| 路由/导航 | 新增路由 + 导航栏 + 路由守卫兼容 | 0.5 h |
| 组件测试 | mock 数据 + 加载/筛选/交互/空状态覆盖 | 2~3 h |
| 联调测试 | SSE 实时更新 + 清台流程 + 打印流程 | 1 h |
| **合计** | | **~8 h** |

---

## 九、未来扩展（非本期）

1. **拖拽布局**：管理员可拖拽调整桌台在网格中的位置，保存布局配置
3. **菜品超时预警**：制作中的菜品超过 15 分钟，卡片边框闪烁红色
4. **营业额实时刷新**：SSE 订阅订单变化，自动更新营收数字
5. **深色模式适配**：卡片在深色模式下的对比度优化

---

*设计方案完。请确认后实施。*
