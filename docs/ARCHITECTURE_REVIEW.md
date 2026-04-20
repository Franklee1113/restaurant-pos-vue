# 智能点菜系统 - 模块深度架构洞察报告

> **版本**: v3.0-vue-migration  
> **日期**: 2026-04-19  
> **范围**: 全模块逐层剖析，涵盖设计亮点、风险识别与改进建议  

---

## 模块深度架构洞察报告 (2026-04-19)

> 本章为架构评审产出物，对系统各模块进行逐层剖析，涵盖设计亮点、风险识别与改进建议。

---

### 1 系统入口与全局架构

#### 1.1 应用启动层 (`main.ts` + `App.vue`)

| 维度 | 洞察 |
|------|------|
| **架构定位** | 极简启动器，遵循 Vue 3 官方推荐模式 |
| **全局错误处理** | `app.config.errorHandler` 捕获未处理异常，避免白屏 |
| **页面转场** | `page-enter/page-leave` 过渡动画（150ms），提升感知流畅度 |
| **可访问性** | `prefers-reduced-motion` 媒体查询尊重用户动画偏好 |

**设计亮点**：`ErrorBoundary` + `ToastContainer` 放在 `App.vue` 根层级，形成"全局异常捕获 → 友好提示"的闭环，避免错误信息直接暴露给用户。

**风险点**：全局错误处理器仅做 `console.error`，未接入任何日志上报机制。生产环境排障依赖用户反馈。

#### 1.2 主布局 (`MainLayout.vue`)

| 维度 | 洞察 |
|------|------|
| **职责** | 导航框架 + 全局状态挂载点（loading / confirm） |
| **响应式** | Desktop / Mobile 双布局，汉堡菜单 + 底部导航自适应 |
| **全局挂载** | `AppLoading` 和 `DialogModal` 作为 layout 级组件，任何子页面均可通过 composables 触发 |

**架构决策评估**：
- ✅ 将 `globalConfirm` 和 `useGlobalLoading` 挂在 layout 层是正确选择，避免了每个页面重复引入弹窗/loading
- ⚠️ `mobileMenuOpen` 是局部响应式状态，未使用 Pinia。对于单页面菜单状态这合理，但如果未来需要跨页面控制菜单（如某些操作后自动收起），需提升到 store

---

### 2 路由与权限体系 (`router/index.ts`)

```
┌─────────────────────────────────────────────────────────────┐
│  公开路由（无需认证）                                          │
│  ├── /login        → 员工登录                                 │
│  ├── /kitchen      → 厨房显示大屏（KDS）                      │
│  └── /customer-order?table=X  → 顾客扫码点餐                  │
├─────────────────────────────────────────────────────────────┤
│  受保护路由（MainLayout 包裹）                                 │
│  ├── /             → 订单列表                                 │
│  ├── /create-order → 新建订单（OrderFormView）               │
│  ├── /edit-order/:id → 编辑订单（复用 OrderFormView）         │
│  ├── /order-detail/:id → 订单详情                             │
│  ├── /statistics   → 营业统计                                 │
│  └── /settings     → 系统设置（含菜品维护）                    │
└─────────────────────────────────────────────────────────────┘
```

**关键洞察**：

1. **编辑/创建复用**：`createOrder` 和 `editOrder` 共用一个 `OrderFormView`，通过 `route.name` 区分模式。这减少了约 70% 的重复代码，但增加了组件内部的条件复杂度。

2. **权限模型过于简单**：当前只有"登录/未登录"两种状态，没有角色区分（如管理员 vs 服务员 vs 厨房人员）。`kitchen` 和 `customer-order` 设为公开路由是业务需求，但缺乏更细粒度的权限控制。

3. **路由守卫的硬跳转**：`window.location.href = '/login'` 是全页刷新，会丢失当前状态。建议使用 `router.replace()` 实现 SPA 内跳转。

---

### 3 状态管理 (Pinia Stores)

#### 3.1 认证状态 (`auth.store.ts`)

| 亮点 | 说明 |
|------|------|
| **原型链污染防护** | `delete parsed.__proto__` / `delete parsed.constructor` — 防御 JSON 解析的原型链攻击 |
| **防重复提交** | `isLoggingIn` 标志避免快速双击导致的重复请求 |
| **统一退出** | `logout()` 清除内存 + localStorage + 强制跳转 |

**风险**：
- `login()` 方法内直接调用原生 `fetch`，未复用 `pocketbase.ts` 中的 `fetchWithTimeout` 和错误处理逻辑，存在请求超时无处理和错误格式不一致的问题
- Token 永不过期检查（除 401 响应外），长期登录安全性依赖 PocketBase 后端配置

#### 3.2 设置状态 (`settings.store.ts`)

**架构模式**：**单例缓存 + 乐观更新**

```ts
async function fetchSettings(force = false) {
  if (settings.value && !force) return // 已缓存，直接返回
  // ...
}
```

- ✅ 避免了每个页面重复请求 settings（餐厅名称、桌号列表、分类等）
- ✅ `addCategory` / `removeCategory` 等操作直接调用 API 并更新本地状态，无需页面手动刷新
- ⚠️ `categories` 和 `tableNumbers` 的 computed 返回的是数组引用，理论上外部组件可以直接 `push` 修改（虽然实际通过 store 方法操作）

---

### 4 API 层 (`pocketbase.ts`) — 系统的"血管"

#### 4.1 架构分层

```
┌────────────────────────────────────────────────────────────┐
│  应用层视图                                                  │
├────────────────────────────────────────────────────────────┤
│  OrderAPI        │  DishAPI        │  SettingsAPI           │
│  (订单 CRUD)      │  (菜品 CRUD)     │  (设置管理)             │
├────────────────────────────────────────────────────────────┤
│  PublicOrderAPI  │  TableStatusAPI  │                        │
│  (公开无认证)     │  (桌位状态同步)   │                        │
├────────────────────────────────────────────────────────────┤
│  基础设施层                                                  │
│  fetchWithTimeout → handleResponse → getAdminToken          │
│  (超时控制)       │  (统一错误处理)   │  (本地 Token 读取)      │
└────────────────────────────────────────────────────────────┘
```

#### 4.2 关键设计洞察

| 设计 | 评价 |
|------|------|
| **`APIError` 自定义异常** | ✅ 统一错误类型，便于 UI 层识别和展示 |
| **`fetchWithTimeout` (AbortController)** | ✅ 30秒超时避免请求挂死 |
| **`sessionExpired` 全局标志** | ✅ 防止 401 时重复弹窗和跳转 |
| **`escapePbString` 转义** | ✅ 防御 PocketBase filter 注入攻击 |
| **`validateTableNo` 正则校验** | ✅ 只允许字母、数字、中文、连字符 |
| **PublicOrderAPI 独立暴露** | ✅ 顾客端点餐无需认证，与管理员 API 分离，最小权限原则 |

#### 4.3 潜在风险

1. **认证耦合过深**：几乎每个 API 方法都内联了 `getAdminToken()` 和 401 检查，可以通过请求拦截器统一处理

2. **`PublicOrderAPI.appendOrderItems` 完全在前端做合并**：虽然前端做了状态检查和合并逻辑，但并发场景下两个顾客同时加菜可能产生竞态条件（Racing）。这需要后端做原子性保证，当前仅靠 PocketBase 的单行 PATCH 有一定保护，但非完全安全。

3. **`OrderAPI.updateOrderItemStatus` 的"读-改-写"模式**：
   ```ts
   const order = await this.getOrder(id)
   const items = order.items.map(...)
   return this.updateOrder(id, { items })
   ```
   这不是原子操作，高并发下会丢失更新。需要依赖后端钩子的重算来弥补，但前端应给出更明确的冲突提示。

---

### 5 订单核心模块

#### 5.1 订单列表 (`OrderListView.vue`)

**架构特征**：**重逻辑视图组件**，承担了数据获取、筛选、统计、导出、清台、状态流转等大量职责。

**设计亮点**：

| 特性 | 实现 | 评价 |
|------|------|------|
| **智能静默刷新** | `useAutoRefresh` 30秒轮询 + `lastOrderIds` 指纹对比 | ✅ 只在新订单/新结账时播放提示音，避免无谓刷新闪烁 |
| **双端适配** | Desktop 表格 + Mobile 卡片 | ✅ 真正的响应式，非简单缩放 |
| **骨架屏** | `SkeletonBox` 组件 | ✅ 感知加载速度提升 |
| **Web Audio API 提示音** | 880Hz→440Hz 滑音 | ✅ 不依赖外部音频文件，零资源加载 |
| **Excel 导出** | `xlsx` 库前端生成 | ✅ 纯前端实现，不经过服务器 |

**架构债务**：

1. **"上帝组件"倾向**：665 行代码混合了数据层、业务逻辑层、视图层。建议将筛选逻辑、清台逻辑、统计计算抽取到 composables。

2. **`buildFilterString` 直接拼接 PocketBase 语法**：
   ```ts
   filters.push(`status='${filter.value.status}'`)
   ```
   虽然有 `sanitizePbLike` 做字符白名单过滤，但 filter 拼接逻辑分散在视图层，维护成本高。

3. **清台逻辑在列表页和详情页重复**：`clearTable` 函数在 `OrderListView` 和 `OrderDetailView` 中几乎完全一致，应提取到共享的 composable 或 API 层。

#### 5.2 订单表单 (`OrderFormView.vue`)

**核心模式**：**创建/编辑复用 + 购物车驱动**

**数据流**：
```
菜品列表 (DishAPI) → 分类筛选 → 点击加菜 → cart 响应式数组
                                    ↓
                            CartPanel 组件 (折扣/餐具/合计)
                                    ↓
                            Zod Schema 校验 → 提交
```

**设计亮点**：

1. **配菜规则引擎 (`DISH_RULES`)**：
   ```ts
   '铁锅鱼': { add: '锅底', qty: 1 }
   ```
   自动关联加菜，减少服务员操作步骤。这是餐饮业务的**领域知识**在代码中的直接体现。

2. **金额计算双保险**：
   - 前端：`MoneyCalculator.calculateWithDiscount`（分转元，防浮点）
   - 后端：钩子强制重算（不信任前端金额）

3. **编辑模式状态隔离**：编辑时不允许直接修改订单状态（提示"请在详情页修改"），防止状态机混乱。

**风险**：

- `hotDishes` 硬编码了招牌菜排序优先级，这是业务规则侵入代码。未来应移到 settings 或数据库配置
- `discountType` 切换时（金额 → 百分比）的自动修正逻辑 `if (discountValue > 10) discountValue = 8` 是"魔法数字"

#### 5.3 订单详情 (`OrderDetailView.vue`)

**架构定位**：**只读展示 + 状态操作中心**

**关键洞察**：

1. **状态流转可视化**：右侧"状态操作"面板只显示 `StatusFlow` 允许的下一个状态，形成**强制状态机**，防止非法跳转。

2. **收款码模态框**：集成微信/支付宝二维码展示，支持"听到到账语音后确认"的线下收银流程，贴合小餐馆实际场景。

3. **打印功能**：
   - `printBill`：80mm 热敏小票格式（`@page { size: 80mm auto }`）
   - `printKitchenTicket`：后厨单，字体更大、备注更醒目

**风险**：打印功能依赖 `window.open()` + `document.write()`，现代浏览器的弹窗拦截可能导致打印失败，且无法在无头环境（如小程序）中使用。

---

### 6 顾客点餐端 (`CustomerOrderView.vue`)

**架构定位**：**独立的顾客自助界面**，与后台管理完全不同的视觉风格和交互模型。

#### 6.1 设计特征

| 维度 | 实现 |
|------|------|
| **视觉风格** | 橙色渐变主题，与后台的蓝色商务风形成鲜明对比 |
| **交互模式** | 左分类导航 + 右菜品列表（美团/饿了么式布局） |
| **购物车** | 底部悬浮球 + 上滑抽屉（Bottom Sheet） |
| **人数设置** | 首屏弹窗强制选择，关联餐具费计算 |

#### 6.2 业务逻辑洞察

1. **桌号绑定与追加模式**：
   ```
   桌号 → 查 table_status → 有未完成订单 → 进入"加菜模式"
                                      ↓
                              新菜品追加到已有订单
   ```
   这是扫码点餐的核心业务流程，实现了"一桌一单、持续加菜"。

2. **菜品规则复用**：与后台共用 `DISH_RULES`（铁锅鱼自动加锅底），保证前后台行为一致。

3. **`useCart` 组合式函数**：顾客端和后台的购物车逻辑被抽象为可复用的 `useCart`，但两者使用了**不同的实例**和**不同的 UI 绑定方式**。

#### 6.3 潜在问题

- **794 行单文件**：这是系统中最庞大的单文件组件，混合了布局、动画、业务逻辑、数据获取。强烈建议拆分：
  - `CustomerHeader.vue`
  - `CategorySidebar.vue`
  - `DishList.vue`
  - `CartDrawer.vue`
  - `GuestSetupModal.vue`

- **分类顺序硬编码**：`categoryOrder` 数组写死了 7 个分类的排序，新增分类会排在最后

- **安全边界**：顾客端通过 `PublicOrderAPI` 操作，但 `tableNo` 来自 URL Query。虽然做了格式校验，但恶意构造 `table=` 参数可能产生脏数据

---

### 7 厨房显示系统 (`KitchenDisplayView.vue`)

**架构定位**：**专用大屏终端**，10秒自动刷新，纯展示 + 状态操作。

#### 7.1 核心设计

```
┌─────────────────────────────────────────────────────────────┐
│  新订单区（红色卡片）                                          │
│  ├── 按桌号大字展示                                           │
│  ├── 只显示 status=pending 的菜品                              │
│  └── 操作：「开始制作」→ 菜品状态变为 cooking                   │
├─────────────────────────────────────────────────────────────┤
│  制作中区（黄色/橙色卡片）                                      │
│  ├── 显示已制作时长（分钟）                                    │
│  ├── 超时 15 分钟 → 边框闪烁警告                               │
│  └── 操作：「已完成」→ 菜品状态变为 cooked                      │
└─────────────────────────────────────────────────────────────┘
```

#### 7.2 架构亮点

1. **AudioContext 提示音**：三声"叮咚叮"（880Hz→1100Hz→880Hz）提示新订单，且主动 `ctx.close()` 释放资源

2. **超时预警**：`cookingOrderMeta` computed 实时计算制作时长，>15分钟触发 `.flash-border` 动画

3. **精准增量检测**：
   ```ts
   const hadNewPending = res.items.some((o) => {
     const newPendingCount = ...
     const oldPendingCount = ...
     return newPendingCount > oldPendingCount
   })
   ```
   只在真正有新菜品进入 pending 时才响铃，避免编辑订单等非新单操作打扰厨房

#### 7.3 改进空间

- 当前厨房端操作（开始制作/已完成）只改**菜品状态**，不改**订单状态**。订单整体状态由后端钩子推断。这个设计合理，但厨房人员无法直观看到订单整体进度
- 没有"已做好 → 已上菜"的流转，缺少传菜员（服务员）端的界面

---

### 8 营业统计 (`StatisticsView.vue`)

**数据策略**：**全量拉取 + 前端聚合**（最多 500 条订单）

#### 8.1 统计维度

| 图表 | 类型 | 数据源 |
|------|------|--------|
| 销售趋势 | 折线+柱状混合 | 按日聚合营业额/订单数 |
| 24小时时段 | 柱状图 | 按小时分布 |
| 热门菜品 TOP10 | 横向条形图 | 已结账订单的菜品销量 |
| 订单状态分布 | 环形图 | 全部订单状态占比 |
| 桌位排行 | 进度条列表 | 桌位营业额/单量 |

#### 8.2 架构洞察

1. **营业额口径严格**：只有 `status === 'settled'` 的订单计入营业额，避免 pending/cooking/serving 的未完成订单干扰经营指标

2. **ECharts 实例管理**：`onUnmounted` 中显式 `dispose()`，防止内存泄漏。`resize` 事件监听支持窗口缩放自适应

3. **日期范围默认值**：最近 7 天，支持周/月/年/自定义切换

**风险**：
- 500 条订单上限在日均 100 单以上的餐厅会不够用，需要分页聚合或后端预计算
- 所有统计在前端实时计算，大数据量时会阻塞主线程

---

### 9 系统设置 (`SettingsView.vue`)

**职责混合**：餐厅信息 + 分类管理 + 桌号管理 + 收款码上传 + 菜品维护 + 二维码生成

#### 9.1 设计亮点

1. **二维码批量生成**：使用 `qrcode` 库为每个桌号生成 DataURL，输出可打印的 A4 排版页面

2. **文件上传分离**：`saveSettingsFiles` 单独处理 FormData（图片上传），与 JSON 设置的 `saveSettings` 分离，因为 PocketBase 的文件字段必须用 multipart/form-data

3. **Zod 表单校验**：`settingsFormSchema` 和 `dishFormSchema` 在提交前做运行时校验

#### 9.2 架构债务

- **763 行超大型组件**：设置页承担了太多职责，应至少拆分为：
  - `RestaurantInfoSection`
  - `CategoryManager`
  - `TableNumberManager`
  - `QrCodeManager`
  - `DishManager`（独立页面更合理）

- `watch(() => settingsStore.settings, ...)` 的 `immediate: true` 在 settings 未加载时可能触发空值处理

---

### 10 工具函数层

#### 10.1 安全工具 (`security.ts`)

| 工具 | 用途 | 评价 |
|------|------|------|
| `escapeHtml` | DOM textContent 转义 | ✅ 使用浏览器原生 `div.textContent` 转义，比正则更可靠 |
| `setSafeHtml` | 受限的 innerHTML | ⚠️ 白名单正则维护成本高，实际项目中建议完全禁用 innerHTML |
| `setSafeAttribute` | 属性安全设置 | ✅ 拦截 `on*` 事件和 `javascript:` 协议 |
| `MoneyCalculator` | 分转元计算 | ✅ **核心资产**，前后端共用计算逻辑 |
| `Validators` | 输入校验 | ✅ 金额/数量/字符串白名单校验 |

**MoneyCalculator 的算法细节**：
```ts
const quantity = Math.round(item.quantity * 10)
totalCents += Math.round((priceCents * quantity) / 10)
```
支持小数数量（如 1.5 斤鱼），以"十分之一"为单位进行整数计算，巧妙避免了浮点误差。

#### 10.2 订单状态机 (`orderStatus.ts`)

```
pending ──→ cooking ──→ serving ──→ dining ──→ completed ──→ settled
   │           │           │           │           │
   └───────────┴───────────┴───────────┴───────────┘
                    ↓ cancelled（任意活跃状态可取消）
```

**状态语义与生命周期**：

| 阶段 | 状态 | 标签 | 谁在操作 | 下一步动作 |
|------|------|------|---------|-----------|
| 下单 | `pending` | 待确认 | 服务员/顾客 | 确认订单 → cooking |
| 制作 | `cooking` | 制作中 | 厨房 | 制作完成 → serving |
| 上菜 | `serving` | 上菜中 | 服务员 | 上菜完成 → dining（自动推断）|
| 用餐 | `dining` | 用餐中 | 客人 | 叫服务员结账 → completed |
| 结账 | `completed` | 已结账 | 收银员 | 确认客人离店 → settled（手动清台）|
| 离店 | `settled` | 已清台 | 系统 | 自动清台，桌位释放 |
| 取消 | `cancelled` | 已取消 | 服务员 | 自动清台，桌位释放 |

- ✅ 状态流转用 `StatusFlow` 明确定义，形成**有限状态机**
- ✅ `transitionStatus` 异步函数强制校验流转合法性
- ✅ `generateOrderNo()` 使用 `crypto.getRandomValues` 生成高熵订单号

#### 10.3 打印工具 (`printBill.ts`)

- 账单模板：80mm 热敏纸宽度，适配小票打印机
- 厨单模板：更大字号，红色强调备注和数量
- 两者都使用 `window.open` 新开标签页打印

---

### 11 组合式函数 (Composables)

#### 11.1 `useCart` — 购物车核心引擎

**设计模式**：**响应式购物车 + 规则引擎**

```ts
const { cart, cartMap, cartTotalQty, cartTotalAmount, addToCart, ... } = useCart(dishes, DISH_RULES)
```

- `cartMap` 使用 `computed(() => new Map())` 提供 O(1) 的菜品查找
- 数量精度统一用 `Math.round(val * 10) / 10`（支持 0.5 等小数数量）
- **配菜规则自动触发**：`addToCart('铁锅鱼')` → 自动 `addToCart('锅底', 1)`

**测试覆盖**：16 个测试用例覆盖添加、累积、规则触发、数量修改、清空等场景，是项目中**测试最充分的模块**。

#### 11.2 `useToast` — 全局通知

- 使用模块级单例 `toasts` 数组，所有组件共享同一通知队列
- 支持 success/error/info/warning 四种类型
- 自动 3 秒后移除

#### 11.3 `useConfirm` — 全局确认框

```ts
const ok = await globalConfirm.confirm({
  title: '确认删除',
  description: '此操作不可恢复',
  type: 'danger'
})
```

- ✅ Promise 化 API，支持 `async/await` 模式
- ✅ 自动处理并发（新 confirm 会关闭旧的并 resolve(false)）

---

### 12 后端钩子 (`pb_hooks/orders.pb.js`) — 业务守护神

这是整个系统中**架构价值最高**的文件之一。它将关键业务逻辑从客户端收归服务端，防止前端篡改。

#### 12.1 钩子职责矩阵

| 钩子 | 触发时机 | 职责 |
|------|---------|------|
| `onRecordBeforeCreateRequest` | 创建订单前 | 强制重算金额（不信任前端） |
| `onRecordBeforeUpdateRequest` | 更新订单前 | 检测追加/状态变更 + 重算金额 + 推断整体状态 + table_status 同步 |
| `onRecordAfterCreateRequest` | 创建订单后 | 自动开台（table_status → dining） |
| `onRecordAfterUpdateRequest` | 更新订单后 | `settled`/`cancelled` 时自动清台 |

#### 12.2 关键安全设计

1. **防篡改金额**：无论前端传什么 `totalAmount`，后端都根据 `items` 和 `cutlery` 重新计算
2. **防非法追加**：已取消订单不允许追加菜品；已完成订单追加会重置为 pending 并重新开台
3. **状态机守卫**：后端也维护了一套 `flow` 对象，防止绕过前端直接 API 调用造成的非法状态流转
4. **并发安全**：清台时检查 `currentOrderId === record.id`，防止新订单被旧订单的清台操作覆盖

#### 12.3 技术债务

- JSON 解析代码在钩子中重复了 4 次，应提取为 `parseJsonField(record, fieldName)` 工具函数
- 所有 `console.log` 都使用字符串拼接，PocketBase 的 JS VM 可能不支持模板字符串的某些特性

---

### 13 测试覆盖分析

| 模块 | 测试文件 | 用例数 | 覆盖度 |
|------|---------|--------|--------|
| `useCart` | `useCart.spec.ts` | 14 | ⭐⭐⭐⭐⭐ 高 |
| `orderStatus` | `orderStatus.spec.ts` | ? | 中等 |
| `security` | `security.spec.ts` | ? | 中等 |

**整体评估**：
- ✅ `useCart` 测试充分，覆盖核心业务规则
- ⚠️ 视图组件（Vue SFC）完全没有单元测试
- ⚠️ API 层（`pocketbase.ts`）没有 mock 测试
- ✅ Playwright E2E 已配置，覆盖登录、订单流、菜品维护、设置页

---

### 14 综合架构评估

#### 14.1 架构健康度雷达图

```
        安全性    ████████████████████ 90% (XSS防护、金额防篡改、输入校验)
          ↑
  可维护性 ←    → 性能
  ████████████  ████████████████ 70% (前端全量统计、大数据量风险)
       60%        ↓
        可扩展性  ████████████████ 65% (硬编码业务规则、上帝组件)
          ↑
        响应式    ████████████████████ 85% (双端适配、骨架屏、动画)
```

#### 14.2 核心优势

1. **前后端双保险金额计算**：`MoneyCalculator` 前端展示 + 后端钩子强制重算，彻底解决餐饮系统最怕的金额不一致问题
2. **真实场景的扫码点餐流程**：桌号绑定、追加加菜、餐具费自动计算、二维码批量生成，贴合中小餐馆实际
3. **厨房大屏的实时感知**：10秒轮询 + 增量检测 + Web Audio 提示音，形成完整的"下单 → 制作 → 出餐"闭环

#### 14.3 优先改进建议（按架构影响排序）

| 优先级 | 改进项 | 影响 |
|--------|--------|------|
| P0 | 拆分 `CustomerOrderView` 和 `SettingsView` 为子组件 | 可维护性 |
| P0 | 提取 `clearTable` 等重复逻辑到共享 composable | DRY 原则 |
| P1 | API 层增加请求/响应拦截器，统一认证和错误处理 | 代码整洁 |
| P1 | `OrderListView` 的筛选逻辑抽取到 `useOrderFilter` | 单一职责 |
| P2 | 分类/招牌菜排序等业务规则从代码迁移到数据库配置 | 可扩展性 |
| P2 | 增加角色权限（管理员/服务员/厨房） | 安全性 |
| P3-1 | PWA 离线化 | 顾客端体验 |
| P3-4 | 蓝牙打印机支持 | 硬件适配 |
| P3 | 统计模块增加后端预计算或分页聚合 | 性能 |
| P3 | 打印功能增加 WebSocket 打印机支持 | 硬件适配 |

---

**文档结束**
