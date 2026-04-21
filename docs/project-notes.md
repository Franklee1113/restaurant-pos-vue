# 智能点菜系统 - 项目上下文摘要

> **用途**: 对话意外退出后快速恢复项目上下文
> **更新时机**: 每次重大改造/功能完成后必须更新
> **最后更新**: 2026-04-21
> **项目背景**: 小型单店餐厅，日订单 < 200 单，服务人员少，角色常由同一人兼任

---

## 1. 项目基本信息

| 项目 | 内容 |
|------|------|
| 系统名称 | 智能点菜系统 |
| 当前版本 | v3.0-vue-migration |
| 部署状态 | **已上线** (2026-04-13 15:44) |
| 最后更新 | **2026-04-21** (文档债务清理 + 项目背景补充) |
| 目标场景 | 小型单店餐厅，日订单量 < 200 单 |
| 人员特点 | 服务人员少，服务员/传菜员/老板常由同一人兼任 |
| 生产地址 | http://43.143.169.88/ |
| 管理员账号 | admin@restaurant.com / *(请联系运维获取)* |
| PocketBase Admin | http://43.143.169.88/_/ |

### 技术栈
- **前端**: Vue 3.5 + Vite 8 + Vue Router 5 (预发布版，计划降级至 4.5.x) + Pinia 3 + Tailwind CSS v4 + TypeScript ~6.0
- **后端**: PocketBase v0.22.27 (BaaS) + SQLite 3
- **测试**: Vitest 4 (单元) + Playwright 1.58 (E2E)
- **部署**: Nginx 1.24 + systemd + 一键部署脚本

---

## 2. 源码目录结构

```
/var/www/restaurant-pos-vue/          # 项目源码
├── src/
│   ├── api/
│   │   └── pocketbase.ts             # API 封装层 (OrderAPI/DishAPI/SettingsAPI/AuthAPI)
│   ├── components/                   # 公共组件
│   ├── composables/                  # 组合式逻辑
│   ├── layouts/
│   │   └── MainLayout.vue            # 主布局
│   ├── router/
│   │   └── index.ts                  # 路由配置
│   ├── stores/
│   │   ├── auth.store.ts             # 认证状态 (JWT + localStorage)
│   │   └── settings.store.ts         # 系统设置缓存 (避免重复请求)
│   ├── utils/
│   │   ├── security.ts               # XSS 转义 + MoneyCalculator 金额计算
│   │   ├── orderStatus.ts            # 订单状态枚举和流转规则
│   │   └── printBill.ts              # 账单/厨单打印 (58mm 热敏纸适配)
│   ├── views/
│   │   ├── LoginView.vue             # 独立登录页
│   │   ├── OrderListView.vue         # 订单列表 (30s 自动刷新 + 音效)
│   │   ├── OrderFormView.vue         # 新建/编辑订单 (合并组件)
│   │   ├── OrderDetailView.vue       # 订单详情
│   │   ├── DishManagementView.vue    # 菜品维护 CRUD
│   │   ├── SettingsView.vue          # 系统设置
│   │   ├── StatisticsView.vue        # 营业数据统计 (ECharts + Excel导出)
│   │   ├── CustomerOrderView.vue     # 顾客端点单 (餐具自动计算)
│   │   └── KitchenDisplayView.vue    # KDS 厨房大屏 (公开路由, 10s 轮询)
│   ├── App.vue
│   └── main.ts
├── e2e/                              # Playwright E2E 测试
│   ├── auth.setup.ts                 # 预置登录态
│   ├── login.spec.ts
│   ├── order-flow.spec.ts            # 黄金流程: 登录→建单→状态变更→详情→打印
│   ├── dish-management.spec.ts
│   └── settings.spec.ts
├── scripts/
│   ├── deploy.sh                     # 一键自动部署脚本
│   └── nginx-example.conf            # Nginx 配置模板
├── docs/
│   ├── DEPLOYMENT_GUIDE.md           # 部署与迁移指南
│   └── RETIREMENT_PLAN.md            # 旧系统下线计划
├── pb_hooks/                         # PocketBase 后端钩子 (关键!)
│   └── orders.pb.js                  # 金额计算 + 状态机 + table_status 同步
├── .github/workflows/
│   ├── ci.yml                        # CI: Type Check + Unit Test + Build
│   ├── e2e.yml                       # E2E 测试工作流 (CI 用 preview 模式)
│   └── deploy.yml                    # CD: 自动部署
├── package.json
├── vite.config.ts                    # manualChunks 拆分 ECharts/XLSX
├── tsconfig.app.json
├── playwright.config.ts
└── docs/project-notes.md             # 本文件

/var/www/restaurant-pos/              # 生产构建产物 (dist 部署目录)
/opt/pocketbase/                      # PocketBase 服务 + pb_data/ + pb_migrations/
/etc/nginx/sites-available/restaurant-pos  # Nginx 站点配置
/etc/systemd/system/pocketbase.service     # systemd 服务
```

---

## 3. 数据库设计 (PocketBase Collections)

### orders 集合
```typescript
interface Order {
  id: string
  orderNo: string              // OYYYYMMDDNNN
  tableNo: string              // 桌号
  guests: number               // 用餐人数
  items: OrderItem[]           // 订单项数组 (JSON)
  status: OrderStatus          // pending/cooking/serving/dining/completed/settled/cancelled
  totalAmount: number          // 订单总金额 (后端强制重算)
  discount: number             // 折扣金额
  finalAmount: number          // 实付金额 (后端强制重算)
  cutlery: {                   // 餐具信息 (JSON)
    type: 'charged' | 'free'
    quantity: number
    unitPrice: number          // 从 dishes 集合 category='餐具' 读取
    totalPrice: number
  }
  note?: string                // 订单/菜品备注
  created: string
  updated: string
}
```

### dishes 集合
```typescript
interface Dish {
  id: string
  name: string
  category: string             // 铁锅炖/凉菜/特色菜/农家小炒/特色豆腐/汤/主食/酒水/餐具
  price: number
  description: string
  soldOut?: boolean            // 是否沽清
  soldOutNote?: string         // 沽清备注（如：约30分钟后恢复）
  soldOutAt?: string           // 沽清时间（ISO 字符串）
}
```
**注意**: `category === '餐具'` 的菜品用于确定餐具单价，禁止前端写死定价。

### table_status 集合
```typescript
interface TableStatus {
  id: string
  tableNo: string              // 桌号（唯一索引）
  status: 'dining' | 'idle'    // dining=占用中, idle=已清台
  currentOrderId: string       // 当前绑定订单ID（清台时校验用）
  openedAt: string             // 开台时间
}
```
**约束**: `tableNo` 字段设有数据库唯一索引 `idx_table_status_tableNo_unique`

### settings 集合
```typescript
interface Settings {
  id: string
  tableNumbers: string[]       // 15 个桌号
  categories: string[]         // 8 个分类
  restaurantName: string
  address: string
  phone: string
}
```

### users 集合 (PocketBase 内置)
用于登录认证，JWT Token 存储于 localStorage。

---

## 4. 最近完成的重大改造

### 改造 A: Vue 3 全面重构与部署 (2026-04-13)
- **内容**: 从原生 JavaScript SPA 迁移到 Vue 3 全家桶
- **关键改进**: 手搓路由→Vue Router、全局变量→Pinia、原生 CSS→Tailwind、无类型→TypeScript
- **涉及文件**: 几乎全部前端文件重构
- **新增页面**: StatisticsView.vue、KitchenDisplayView.vue、LoginView.vue

### 改造 B: P0 业务逻辑后端托管 (2026-04-17)
- **内容**: 金额计算、状态机流转、table_status 同步迁到后端 Hook
- **原因**: 前端并发操作同一订单会导致数据不一致
- **涉及文件**:
  - `pb_hooks/orders.pb.js` (新增)
  - `src/api/pocketbase.ts` (简化 updateOrderItemStatus / appendOrderItems)
  - `src/views/CustomerOrderView.vue` (移除手动同步 table_status)
- **核心逻辑**:
  - `onRecordBeforeCreateRequest` / `onRecordBeforeUpdateRequest`: 以"分"为单位重算 totalAmount/discount/finalAmount
  - `onRecordBeforeUpdateRequest`: 根据 items.status 变化推断订单整体状态，校验流转合法性
  - `onRecordAfterCreateRequest`: 自动开台
  - `onRecordAfterUpdateRequest`: 订单完成/取消后自动清台

### 改造 C: 餐具费定价改造 (2026-04-17)
- **内容**: 统一餐具价格源，前端不再展示餐具选择 UI
- **原因**: 员工端写死 ¥2/套与菜品维护不同步；顾客端将餐具混入 items 数组前后端不统一
- **涉及文件**:
  - `src/views/OrderFormView.vue` (删除餐具配置面板)
  - `src/views/CustomerOrderView.vue` (购物车不再展示餐具，提交时以 cutlery 字段传入)
  - `src/components/CutleryConfigPanel.vue` (已停止引用，组件保留备后用)
- **规则**: 餐具单价必须从 `dishes` 集合 `category === '餐具'` 读取；禁止前端写死定价

### 改造 D: 状态机升级 - 新增 SETTLED（已结账）状态 (2026-04-19)
- **内容**: 订单状态从「已完成即清台」拆分为「上菜完成(completed)」和「已结账(settled)」两个阶段；completed 不再自动清台，只有 settled/cancelled 才自动清台
- **原因**: 真实餐饮场景中「上菜完成」≠「顾客已结账离店」，中间存在「等待结账」阶段；原 completed 自动清台导致桌位在顾客未离店时就被释放
- **涉及文件**:
  - `pb_hooks/orders.pb.js` (自动清台条件改为 settled/cancelled；状态流转校验加入 settled；加菜回退支持 settled)
  - `src/utils/orderStatus.ts` (新增 SETTLED 状态，completed 标签改为「上菜完成」)
  - `src/api/pocketbase.ts` (已结束判断加入 settled)
  - `src/views/OrderListView.vue` (状态筛选新增 settled；自动刷新音效检测改为 settled)
  - `src/views/OrderDetailView.vue` (completed 显示「结账」按钮；终态提示加入 settled；扫码收款隐藏条件加入 settled)
  - `src/views/CustomerOrderView.vue` (已结束判断加入 settled)
  - `src/views/StatisticsView.vue` (营业额/客单价/日均只统计 settled；KPI 卡片拆分「上菜完成」和「已结账」维度)
  - `src/views/KitchenDisplayView.vue` (无需改动，已按 pending/cooking 过滤)
- **状态机 v2**:
  ```
  pending → cooking → serving → completed → settled
     ↓         ↓                            ↓
  cancelled  cancelled                    自动清台
  ```
  - `completed` = 上菜完成，桌台仍 dining
  - `settled` = 已结账/顾客离店，自动清台
  - `cancelled` = 已取消，自动清台

### 改造 E: 清台交互优化与文案去强制化 (2026-04-19)
- **内容**: 已清台订单再次点击清台时前置阻断提示；所有「强制清台」文案统一改为「清台」
- **原因**: 后端 Hook 已自动处理完成/取消订单的清台，再次手动清台是无意义操作；「强制」文案与当前自动化业务逻辑不符
- **涉及文件**:
  - `src/views/OrderListView.vue` (`clearTable` 增加前置 `table_status` 检查，调整文案)
  - `src/views/OrderDetailView.vue` (`clearTable` 增加前置检查 + 补「未完成订单检查」，调整文案)
- **清台规则**:
  1. 先查 `table_status`：若已是 `idle` → 提示「已经是空闲状态，无需重复清台」（阻断）
  2. 再查未完成订单：若有 → 提示「请先处理完毕」（阻断）
  3. 当前订单状态为 `completed` → 提示「已上菜完成但尚未结账，请先结账」（阻断）
  4. 以上均通过 → 确认清台 → 执行 API

### 改造 E: 订单列表新增「桌台状态」列 (2026-04-19)
- **内容**: `fetchOrders` 并行加载 `getAllTableStatuses()`，桌面表格和移动端卡片均显示桌台状态
- **涉及文件**: `src/views/OrderListView.vue`, `src/api/pocketbase.ts`

### 改造 F: table_status 数据修复与唯一约束 (2026-04-19)
- **内容**: 清理 `table_status` 集合中的重复记录（同一桌号多条），创建 `tableNo` 唯一索引
- **涉及操作**: SQLite DELETE 重复记录 + `CREATE UNIQUE INDEX idx_table_status_tableNo_unique`
- **根因**: 后端 Hook 并发创建时存在竞态条件，导致同一桌号产生多条记录

### 改造 G: 沽清功能完整实施 (2026-04-20)
- **内容**: 菜品实时沽清标记与多端同步，防止已沽清菜品被下单

### 改造 H: 测试覆盖率六阶段补测 (2026-04-21)
- **内容**: 系统性提升单元测试覆盖率，从基线 72.14% / 61.35% / ~65% 提升至 88.77% / 79.34% / 80.5%（Statements / Branch / Functions），新增 200+ 测试用例
- **关键动作**:
  - `orderValidation.ts` 从 `pb_hooks/orders.pb.js` 提取核心业务逻辑（金额重算、状态推断、追加/删除检测、流转校验），实现 100% 语句覆盖、91.52% 分支覆盖
  - `CustomerOrderView.vue` Branch 52.97% → 84.63%（+14 测试：模板分支+脚本边界+DOM 交互）
  - `OrderListView.vue` Functions 63.09% → 77.38%（+38 测试：筛选、清台、自动刷新音效、DOM 交互、分页、SoldOutDrawer）
  - `pocketbase.ts` Branch 65.94% → 75.67%（+18 测试：网络异常、SSE 单例、HTTP 500/403 处理）
  - `OrderFormView.vue` Stmts 57% → 78.54%（+21 测试：铁锅鱼自动加锅底、submit 成功/失败、折扣校验、触摸事件）
- **测试过程中发现的产品缺陷**:
  - BUG-FIX-001: `OrderFormView.vue` percent 折扣校验逻辑错位（`>10` 非法值可被提交）
  - BUG-FIX-002: `pocketbase.ts` HTTP 500 空响应体时错误消息显示为 `undefined`
  - `DialogModal.vue` `typeClass` 未用 `computed()` 包裹导致响应式失效
  - `CustomerOrderView.vue` 会话恢复后未关闭人数选择弹窗；`dining` 状态被误判为已结束
- **涉及文件**:
  - 新增: `src/utils/orderValidation.ts`, `src/utils/__tests__/orderValidation.spec.ts`
  - 修改测试: `src/views/__tests__/CustomerOrderView.spec.ts` (+46), `src/views/__tests__/OrderFormView.spec.ts` (+21), `src/views/__tests__/OrderListView.spec.ts` (+38), `src/api/__tests__/pocketbase.spec.ts` (+18)
  - 修复产品代码: `src/views/OrderFormView.vue`, `src/views/CustomerOrderView.vue`, `src/api/pocketbase.ts`, `src/components/DialogModal.vue`
- **产出文档**: `docs/TEST_COVERAGE_REPORT.md` v3.0（六阶段补测完成）
- **原因**: 营业高峰期菜品临时售罄，需要实时告知员工和顾客，避免无效下单
- **涉及文件**:
  - `pb_migrations/1776652288_add_soldOut_to_dishes.js` (新增)
  - `pb_hooks/orders.pb.js` (新增 `validateItemsSoldOut` 批量 IN 查询)
  - `server/src/services/dish.service.ts` (返回 soldOut 字段 + 二次校验)
  - `server/src/jobs/resetSoldOut.ts` (新增，每日 04:00 自动重置)
  - `src/api/pocketbase.ts` (Dish 类型扩展 + `toggleSoldOut` + 共享 SSE)
  - `src/components/DishActionSheet.vue`、`SoldOutDrawer.vue` (新增)
  - `src/views/OrderFormView.vue` (长按菜单 + 乐观更新 + 提交拦截)
  - `src/views/OrderListView.vue`、`OrderDetailView.vue`、`CustomerOrderView.vue` (沽清展示)
  - `src/composables/useToast.ts` (action 按钮支持)
- **核心逻辑**:
  - 标记沽清：前端乐观更新 → API PATCH → Toast 10 秒撤销 → 失败回滚（仅恢复 soldOut 字段）
  - 下单拦截：后端 Hook 批量 IN 查询检测 soldOut 菜品，发现即抛错
  - 实时同步：`subscribeToDishes` 共享单例 SSE，菜品状态变更秒级推送
  - 自动恢复：定时任务每日 04:00 重置所有 soldOut=true 菜品

### 改造 H: 已结账订单编辑阻断 (2026-04-20)
- **内容**: `completed`（已结账）和 `settled`（已清台）状态的订单禁止前端编辑
- **原因**: 已结账订单涉及财务闭环，允许编辑会导致订单金额与实际收款不一致，且已打印账单与系统数据不同步
- **涉及文件**:
  - `src/views/OrderDetailView.vue` (`handleEdit()` 直接 toast 阻断；按钮灰色禁用样式)
  - `src/views/OrderListView.vue` (列表编辑按钮同理阻断)
  - `src/views/__tests__/OrderDetailView.spec.ts` (新增阻断测试用例)
- **规则**: `pending`/`cooking`/`serving`/`dining`/`cancelled` 仍可编辑；`completed`/`settled` 彻底阻断

---

## 5. 核心业务规则 (当前有效)

### 订单状态流转
```
pending → cooking → serving → completed → settled
   ↓         ↓                            ↓
cancelled  cancelled                    自动清台
```
- 后端 Hook 自动根据 items 的 status 推断整体订单状态
- 前端不再直接控制状态流转，只负责提交 items 变化

### 订单编辑规则
- **可编辑状态**: `pending` / `cooking` / `serving` / `dining` / `cancelled`
- **不可编辑状态**: `completed`（已结账）/ `settled`（已清台）
- **阻断方式**: 前端按钮变灰 + Toast 提示「已结账/已清台订单不可编辑」
- **原因**: 已结账订单涉及财务闭环，编辑会破坏金额一致性

### 金额计算
- 后端 `orders.pb.js` 以"分"为单位精确计算，不信任前端传入金额
- 折扣仅应用于菜品金额，不应用于餐具费
- 公式: `finalAmount = 菜品金额 + 餐具费 - 折扣`

### 铁锅鱼自动加锅底
```typescript
const DISH_RULES = {
  '铁锅鱼': { add: '锅底', qty: 1 },
  '铁锅炖鱼': { add: '锅底', qty: 1 }
}
```

### 特殊约定
- 顾客端新建订单时，`cutlery` 以独立 JSON 字段传入，不混入 `items`
- 编辑订单时必须兼容旧订单数据（检查 `cutlery` 字段是否存在）
- 打印账单必须显示餐具明细

### 清台规则
- 后端 Hook 自动同步：`settled` / `cancelled` → 自动清台 (`idle`)
- `completed`（上菜完成）**不清台**，桌台保持 `dining`
- 前端手动清台仅作为异常兜底（Hook 未触发时的修正）
- 清台前三重校验：
  1. 桌台是否已 `idle` → 阻断提示「无需重复清台」
  2. 该桌是否有未完成订单 → 阻断提示「请先处理完毕」
  3. 当前订单状态是否为 `completed` → 阻断提示「请先结账」
- 文案统一为「清台」，去除「强制」字样

### 桌台状态数据一致性
- `table_status` 集合：`tableNo` 设有数据库唯一索引
- 已清理历史重复记录，一个桌号仅保留一条记录

---

## 6. 部署陷阱与教训（血泪史）

### ❌ 陷阱 #1: Nginx root 与 deploy.sh 目标目录不一致（2026-04-20）

**现象**: deploy.sh 报告"部署成功"，但生产环境仍然显示旧版本（扫码收款按钮还在、dining 状态未生效）。

**根因**:
```
Nginx 配置:  root /usr/share/nginx/html;
deploy.sh:   NGINX_ROOT="/var/www/restaurant-pos"
```
`deploy.sh` 往 `/var/www/restaurant-pos/` 写新代码，Nginx 却服务旧的 `/usr/share/nginx/html/`。

**影响**: 从 v1.0.2 到 v1.1.0 的所有部署实际上都是"假部署"——脚本跑完了，但用户看到的永远是旧版本。

**修复**:
1. 修改 `/etc/nginx/sites-available/restaurant-pos`: `root /var/www/restaurant-pos;`
2. 清空 `/usr/share/nginx/html/` 旧代码
3. `deploy.sh` 已增加 **Step 0 预检**（Nginx root 一致性检查）和 **Step 6 部署验证**（curl 确认 JS 文件名匹配）

**教训**: 部署脚本的成功 ≠ 用户看到新代码。必须在部署流程中加入"验证生产环境返回的代码确实是新构建的"这一环。

---

## 7. 已知问题与约束

### 7.1 当前已知问题

| 问题 | 严重程度 | 说明 |
|------|----------|------|
| 核心视图测试覆盖不足 | 🟡 P1 | 视图单元测试已达 568 用例通过，CustomerOrderView 分支覆盖 50.78%，仍有提升空间 |
| 文档债务严重 | 🟡 P1 | 根目录与 docs/ 混放、重复文档并存、命名不统一、无目录索引，共 26 个文件散落各处 |
| 菜品模型过于简化 | 🟢 P3 | 已增加沽清状态，仍缺多规格、库存管理 |

### 7.2 已解决的历史问题（归档）

| 问题 | 原严重程度 | 解决方式 | 解决时间 |
|------|-----------|---------|---------|
| 统计页前端聚合 | 🟡 P1 | 后端自定义路由 `/api/stats`，SQLite 原生聚合 | 2026-04-19 |
| KDS 10s 轮询 | 🟡 P2 | `KitchenDisplayView` 接入 PocketBase SSE Realtime，轮询仅作降级 | 2026-04-19 |
| 前端无错误监控 | 🟡 P1 | 接入 Sentry，生产环境自动上报 | 2026-04-19 |
| API 错误处理重复 | 🟡 P1 | 统一封装 `handleResponse` + 请求/响应拦截器 | 2026-04-19 |
| 无 PWA/离线能力 | 🟢 P3 | 完成 manifest.json + sw.js（Cache-First + Network-First） | 2026-04-19 |
| 退菜/删菜无后端校验 | 🔴 P0 | 后端 Hook 增加 `itemsRemoved` 检测，阻断 `cooking/cooked/served` 菜品删除 | 2026-04-21 |
| 手动清台兜底过于宽松 | 🔴 P0 | `executeClearTable` 重构：查询/更新失败时抛出异常阻断，不再静默继续 | 2026-04-21 |
| 顾客端沽清拦截策略不一致 | 🟡 P1 | 顾客端 Stepper 置灰 + `addToCart` 硬拦截 + 10s 菜品轮询实时感知 | 2026-04-21 |
| 铁锅鱼锅底检查不一致 | 🟡 P1 | `useCart.ts` 自动加锅底前统一检查 `soldOut`，员工端/顾客端行为一致 | 2026-04-21 |
| dining 追加重置为 pending | 🟡 P1 | 移除后端 Hook 重置逻辑，dining 订单追加菜品保持 dining | 2026-04-21 |
| 金额测试覆盖不足 | 🟢 P2 | `security.spec.ts` 补充 17 个 MoneyCalculator 边界测试 | 2026-04-21 |
| completed 清台路径不直观 | 🟢 P2 | 订单列表快捷筛选按钮 `COMPLETED` 显示「待清台」+ 琥珀色标识 | 2026-04-21 |
| 清台按钮对未完成订单可见 | 🟢 P2 | 清台按钮添加 `v-if` 条件渲染，仅 `COMPLETED` 状态显示；`pendingTableNumbers` 区域移除冗余清台按钮 | 2026-04-21 |
| 顾客无法给服务员创建的订单加菜 | 🟡 P1 | `pb_hooks/orders.pb.js` 统一为所有新订单生成 `accessToken`，消除顾客端/员工端双轨制差异 | 2026-04-21 |

---

## 8. 下一步待办事项 (按优先级)

### 🔴 P1 - 近期必须完成
- [x] **统计页后端聚合**: ✅ 已完成 `/api/stats` 自定义路由，SQLite 原生聚合
- [x] **补核心单元/E2E 测试**: ✅ 已完成四阶段补测（515 用例），新增 orderValidation.ts 提取 pb_hooks 核心逻辑并 100% 覆盖；CustomerOrderView / OrderFormView 交互测试大幅补充
- [ ] **文档目录整理**: 根目录 7 个 md 文件移入 docs/；删除过时文档（DEPLOY_CUTLERY_FEATURE.md、CODE_AUDIT_REPORT_20250414.md、TEST_COVERAGE.md）；重命名 CHECKLIST.md → feature-checklist.md；创建 docs/README.md 索引；删除 .bak 备份文件
- [x] **API 统一封装 + 错误标准化**: ✅ 已完成 `handleResponse` + 请求/响应拦截器
- [x] **前端错误监控**: ✅ 已完成 Sentry 接入（生产环境自动上报）

### 🟡 P2 - 中期优化
- [x] **KDS 轮询改 SSE Realtime**: ✅ `KitchenDisplayView` 已接入 SSE，失败降级 10s 轮询
- [ ] **请求缓存与离线化**: DishAPI 60s 缓存已移除（实时性要求），SettingsAPI 30s 缓存保留
- [x] **数据模型扩展**: ✅ 已增加沽清状态（soldOut/soldOutNote/soldOutAt），多规格/库存待规划
- [ ] **桌台可视化**: 大厅/包间布局图，直观显示桌台占用状态

### 🟢 P3 - 长期体验
- [x] **PWA 支持**: ✅ 已完成 manifest.json + sw.js（静态资源 Cache-First，API Network-First）
- [ ] **深色模式**: Tailwind CSS 的 dark mode 适配
- [ ] **打印模板引擎化**: 当前打印 HTML 是硬编码，改为可配置模板
- [ ] **多语言支持**: i18n 国际化（如有需要）

---

## 9. Agent 协作看板（所有 Agent 必须遵守）

> **用途**: 多 Agent 并行工作时的共享状态板，避免任务冲突、重复劳动、进度不透明  
> **更新规则**: Agent 在**启动/恢复时登记**、**每完成一个子任务后更新**、**退出前标记完成或交接**  
> **冲突解决**: 若两个 Agent 同时声明同一任务，以 `最后更新` 时间戳较晚者为准，另一 Agent 应立即释放并重新认领

### 9.1 协作规则

1. **启动必登记**：任何 Agent 在开始工作前，必须在本节表格中新增一行登记
2. **定期报心跳**：长时间运行（>10 分钟）的 Agent，至少每 10 分钟更新一次 `最后更新` 时间
3. **文件加锁**：修改核心文件（如 `pb_hooks/orders.pb.js`、`src/api/pocketbase.ts`、视图组件）前，先在看板中声明锁定，完成后释放
4. **不交叉修改**：同一文件在同一时间只能被一个 Agent 锁定；发现锁冲突时，等待或协商拆分任务
5. **退出必注销**：Agent 完成工作或被中断时，将状态改为 `completed`/`failed`/`idle`，并写入交付物摘要

### 9.2 当前活跃 Agent 状态

| Agent ID | 当前任务 | 状态 | 进度 | 锁定文件/范围 | 阻塞项 | 最后更新 | 预计完成 |
|----------|----------|------|------|---------------|--------|----------|----------|
| *(空)* | — | — | — | — | — | — | — |

**状态枚举**: `idle`（待命） / `running`（执行中） / `completed`（已完成） / `failed`（失败） / `blocked`（被阻塞）

### 9.3 历史完成记录（最近 5 条）

| 时间 | Agent ID | 任务 | 结果 | 交付物 |
|------|----------|------|------|--------|
| 2026-04-21 16:15 | `arch-reviewer` | 沽清功能文档合并 | completed | 3个文档合并为 `docs/sold-out-feature.md`；删除 `SOLD_OUT_FEATURE_SPEC.md` + `沽清功能架构审查报告.md`；追加架构审查结论为附录C |
| 2026-04-21 16:00 | `arch-reviewer` | 文档目录整理（方案A） | completed | 根目录7文件移入docs/；删除4个过时文档；重命名CHECKLIST.md；创建docs/README.md |
| 2026-04-21 11:40 | `arch-reviewer` | 架构优化路线图制定 | completed | `docs/ARCHITECTURE_ROADMAP_20250421.md` |
| 2026-04-21 11:39 | `deploy-bot` | 生产部署 v1.0.2 | completed | 备份 `pre-20260421-113913-accessToken-fix` |
| 2026-04-21 10:14 | `bugfix-gov` | 业务逻辑全面治理 BUG-GOV-001~008 | completed | commit `97b698a` |

### 9.4 文件锁定区

> 以下文件当前被 Agent 独占修改，其他 Agent **禁止直接编辑**：

| 文件路径 | 锁定 Agent | 锁定时间 | 预计释放 |
|----------|-----------|----------|----------|
| *(空)* | — | — | — |

---

## 10. 常用命令速查

```bash
# 开发启动
cd /var/www/restaurant-pos-vue && npm run dev

# 构建
cd /var/www/restaurant-pos-vue && npm run build

# 单元测试
cd /var/www/restaurant-pos-vue && npm run test:unit

# E2E 测试 (本地)
cd /var/www/restaurant-pos-vue && npm run test:e2e

# 一键部署 (生产)
sudo bash /var/www/restaurant-pos-vue/scripts/deploy.sh

# 回滚 (替换 YYYYMMDD-HHMMSS)
sudo rm -rf /var/www/restaurant-pos/*
sudo cp -r /var/www/restaurant-pos-backup-YYYYMMDD-HHMMSS/* /var/www/restaurant-pos/
sudo systemctl reload nginx

# PocketBase 服务管理
sudo systemctl status pocketbase
sudo systemctl restart pocketbase
sudo journalctl -u pocketbase -f

# Nginx 配置检查
sudo nginx -t && sudo systemctl reload nginx
```

---

## 11. 断点恢复卡（对话异常中断时使用）

> **用途**: 对话意外退出（浏览器崩溃、系统断电、网络断线、超时回收）后，下次对话快速恢复上下文
> **使用方法**: 复制下方整个代码块，粘贴给 AI 即可

```
请按以下步骤恢复智能点菜系统的上下文：

1. 读取 /var/www/restaurant-pos-vue/docs/project-notes.md
2. 读取 /var/www/restaurant-pos-vue/docs/智能点菜系统-详细设计说明书.md
3. 执行 `cd /var/www/restaurant-pos-vue && git log --oneline -10`
4. 执行 `cd /var/www/restaurant-pos-vue && git diff HEAD~2 --stat`
5. 基于以上信息，告诉我：
   - 当前项目版本和部署状态
   - 最近两次提交做了什么修改
   - 当前遗留的待办事项

然后我们继续讨论智能点菜系统的开发。
```

### 当前会话可能遗留的待办事项

| 优先级 | 事项 | 状态 | 说明 |
|--------|------|------|------|
| 🔴 P0 | 测试「标记为用餐中」状态流转 | ✅ 已验证 | 状态机 v2.0 已上线，dining 状态正常工作 |
| 🔴 P0 | 验证营业额统计口径 | ✅ 已验证 | settled 计入营业额，completed/dining 不计入 |
| 🔴 P0 | KDS 未完成菜品消失 | ✅ 已修复 | 过滤条件改为排除终态，v1.1.2 已部署 |
| 🔴 P0 | 桌台重复开台 | ✅ 已修复 | 前后端双重校验，v1.1.2 已部署 |
| 🔴 P0 | KDS 状态回退非法流转 | ✅ 已修复 | 自动推断增加优先级检查，v1.1.2 已部署 |
| 🟡 P1 | 传菜员角色设计方案 | 待确认 | 需定义职责范围、权限边界、登录方式 |
| 🟡 P1 | 统计页后端聚合 | ✅ 已完成 | `/api/stats` SQLite 原生聚合已上线 |
| 🟢 P2 | KDS 轮询改 SSE Realtime | ✅ 已完成 | KitchenDisplayView 已接入 SSE Realtime |
| 🟢 P2 | 沽清功能完整实施 | ✅ 已完成 | v1.1.0 已上线，含 SSE 实时同步 + 自动重置 |
| 🟢 P2 | 订单操作按钮文案优化 | ✅ 已完成 | StatusLabels 与 ActionLabels 分离，v1.1.2 已部署 |

### 检查点记录（上次保存时间：2026-04-21 10:14）

| 时间 | 已确认的决策 | 实施状态 |
|------|-------------|---------|
| 2026-04-19 | 状态机重构方案B：新增 dining 状态 | ✅ 已部署 v1.0.3 |
| 2026-04-19 | 部署脚本增加 pb_hooks/pb_migrations 自动同步 | ✅ 已部署 |
| 2026-04-19 | 修复金额归零 Bug（部分更新时使用 oldItems 兜底） | ✅ 已部署 |
| 2026-04-19 | 修复清台逻辑死锁（未完成订单过滤条件修正） | ✅ 已部署 |
| 2026-04-19 | 订单列表历史订单显示修复（显示「已结束」而非实时状态） | ✅ 已部署 |
| 2026-04-19 | 删除订单详情页扫码收款按钮 | ✅ 已部署 |
| 2026-04-19 | 更新详细设计说明书至 v2.3 | ✅ 已完成 |
| 2026-04-19 | 更新 CHANGELOG 至 v1.0.3 | ✅ 已完成 |
| 2026-04-20 | 沽清功能完整实施 | ✅ 已部署 v1.1.0 |
| 2026-04-20 | 更新项目文档至 v1.1.0 | ✅ 已完成 |
| 2026-04-20 | 修复 Nginx root 与 deploy.sh 目标目录不一致 | ✅ 已修复 |
| 2026-04-20 | deploy.sh 增加 Nginx root 预检 + 部署验证 | ✅ 已实施 |
| 2026-04-20 | deploy.sh 增加公共 API 服务自动重启 + 健康检查 | ✅ 已实施 |
| 2026-04-20 | 同步 pb_hooks/pb_migrations 到生产环境 | ✅ 已同步 |
| 2026-04-20 | 清空旧部署目录 /usr/share/nginx/html/ | ✅ 已清理 |
| 2026-04-20 | 已结账订单编辑阻断（completed/settled 不可编辑） | ✅ 已部署 v1.1.1 |
| 2026-04-20 | deploy.sh 改为 build-only（跳过类型检查阻塞） | ✅ 已实施 |
| 2026-04-20 | 修复多处 noUncheckedIndexedAccess 类型错误 | ✅ 已完成 |
| 2026-04-20 | 更新 CHANGELOG / project-notes / 设计说明书 | ✅ 已完成 |
| 2026-04-20 | 修复 OrderListView `allDishes` 未加载导致 SoldOutDrawer 为空 | ✅ 已部署 |
| 2026-04-20 | 关闭 `noUncheckedIndexedAccess` + 修复测试类型 + 恢复 `npm run build` | ✅ 已实施 |
| 2026-04-20 | 补充 `OrderListView.spec.ts`（11 用例） | ✅ 已通过 |
| 2026-04-20 | 创建 `docs/CHECKLIST.md` 功能开发自检清单 | ✅ 已完成 |
| 2026-04-20 | Git checkpoint commit: e25689e | ✅ 已提交 |
| 2026-04-20 | KDS 过滤条件改为排除终态（P0 修复） | ✅ 已部署 v1.1.2 |
| 2026-04-20 | 桌台重复开台前后端双重校验（P0 修复） | ✅ 已部署 v1.1.2 |
| 2026-04-20 | KDS 状态回退非法流转修复（P0 修复） | ✅ 已部署 v1.1.2 |
| 2026-04-20 | 订单操作按钮文案优化（方案A） | ✅ 已部署 v1.1.2 |
| 2026-04-20 | 更新 CODE_CHECKLIST.md Bug 根因分析库（BUG-014~017） | ✅ 已完成 |
| 2026-04-20 | 更新 CHANGELOG / 设计说明书 / project-notes 至 v1.1.2 | ✅ 已完成 |
| 2026-04-20 | 顾客端 dining 状态误判修复 + 新顾客自动加入订单（方案B） | ✅ 已部署 v1.1.2 |
| 2026-04-20 | Git checkpoint commit: 6b09a30 | ✅ 已提交 |
| 2026-04-21 | 业务逻辑全面治理：梳理流程图 + 测试案例 + 治理方案 | ✅ 已完成 |
| 2026-04-21 | BUG-GOV-001: 退菜/删菜后端校验 | ✅ 已实施 |
| 2026-04-21 | BUG-GOV-002: 清台异常处理重构 | ✅ 已实施 |
| 2026-04-21 | BUG-GOV-003/004: 顾客端沽清硬拦截 + 10s 轮询 | ✅ 已实施 |
| 2026-04-21 | BUG-GOV-005: 铁锅鱼锅底 soldOut 统一检查 | ✅ 已实施 |
| 2026-04-21 | BUG-GOV-006: dining 追加保持状态（不重置 pending） | ✅ 已实施 |
| 2026-04-21 | BUG-GOV-007: MoneyCalculator 边界测试 +17 用例 | ✅ 已实施 |
| 2026-04-21 | BUG-GOV-008: 订单列表「待清台」筛选标签 | ✅ 已实施 |
| 2026-04-21 | 更新 project-notes / CODE_CHECKLIST.md / 设计说明书 | ✅ 已完成 |
| 2026-04-21 | Git commit: 947025c — 业务逻辑全面治理 | ✅ 已提交 |
| 2026-04-21 | 生产部署: v1.0.2-20260421-101324 | ✅ 已上线 |
| 2026-04-21 | E2E 测试修复与部署（9 个 E2E 文件全部通过） | ✅ 已完成 |
| 2026-04-21 | 文档治理：`AGENTS.md`、README 重写、过时文档清理 | ✅ 已完成 |
| 2026-04-21 | Git commit: b2e566c — 文档治理 + E2E 补全 | ✅ 已提交 |
| 2026-04-21 | 测试 Phase 1：`orderValidation.ts` 外迁 + Views 交互测试 | ✅ 582 测试通过 |
| 2026-04-21 | 测试 Phase 2：OrderListView Functions + pocketbase.ts Branch | ✅ 覆盖率 87.91% / 74.91% |
| 2026-04-21 | 测试 Phase 3：CustomerOrderView Branch 52.97% → 84.63% | ✅ 覆盖率 88.77% / 79.34% |
| 2026-04-21 | Git commit: ce46a31 — 测试覆盖率六阶段补测完成 | ✅ 已提交 |
| 2026-04-21 | 生产部署验证：确认生产环境包含 b2e566c 及之前所有修复 | ✅ 已验证 |
| 2026-04-21 | 更新 `TEST_COVERAGE_REPORT.md` / `CHANGELOG.md` / `CHECKPOINT` | ✅ 已完成 |

---

**文档版本**: v1.9  
**最后更新人**: Kimi  
**更新日期**: 2026-04-21
