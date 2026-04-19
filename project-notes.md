# 智能点菜系统 - 项目上下文摘要

> **用途**: 对话意外退出后快速恢复项目上下文
> **更新时机**: 每次重大改造/功能完成后必须更新
> **最后更新**: 2026-04-19

---

## 1. 项目基本信息

| 项目 | 内容 |
|------|------|
| 系统名称 | 智能点菜系统 |
| 当前版本 | v3.0-vue-migration |
| 部署状态 | **已上线** (2026-04-13 15:44) |
| 最后更新 | **2026-04-19** (状态机升级 + 清台优化 + 桌台状态列 + 数据修复) |
| 生产地址 | http://43.143.169.88/ |
| 管理员账号 | admin@restaurant.com / REDACTED_DEFAULT_PASSWORD |
| PocketBase Admin | http://43.143.169.88/_/ |

### 技术栈
- **前端**: Vue 3.5 + Vite 8 + Vue Router 4 + Pinia 3 + Tailwind CSS v4 + TypeScript 6
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
└── project-notes.md                  # 本文件

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
  status: OrderStatus          // pending/cooking/serving/completed/cancelled
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

---

## 5. 核心业务规则 (当前有效)

### 订单状态流转
```
pending → cooking → serving → completed
   ↓         ↓
cancelled  cancelled
```
- 后端 Hook 自动根据 items 的 status 推断整体订单状态
- 前端不再直接控制状态流转，只负责提交 items 变化

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

## 6. 已知问题与约束

| 问题 | 严重程度 | 说明 |
|------|----------|------|
| 统计页前端聚合 | 🟡 P1 | 一次性拉取 500 条订单在前端聚合，大数据量会卡死 |
| KDS 10s 轮询 | 🟡 P2 | 服务器压力大，建议改为 SSE Realtime |
| 核心视图测试覆盖不足 | 🟡 P1 | View 级别单元测试只有 6 个，需补充 |
| 前端无错误监控 | 🟡 P1 | 生产环境报错黑盒，建议接入 Sentry |
| API 错误处理重复 | 🟡 P1 | token/错误处理代码重复多，需统一封装 |
| 菜品模型过于简化 | 🟢 P3 | 缺少多规格、库存管理 |
| 无 PWA/离线能力 | 🟢 P3 | 网络断时无法使用 |

---

## 7. 下一步待办事项 (按优先级)

### 🔴 P1 - 近期必须完成
- [ ] **统计页后端聚合**: 避免一次性拉取 500 条订单，改为后端按日期/状态聚合后返回
- [ ] **补核心单元/E2E 测试**: OrderFormView、OrderDetailView、KitchenDisplayView 的测试覆盖
- [ ] **API 统一封装 + 错误标准化**: 统一处理 token 失效、网络错误、服务端报错提示
- [ ] **前端错误监控**: 接入 Sentry 或类似方案，生产环境报错可追踪

### 🟡 P2 - 中期优化
- [ ] **KDS 轮询改 SSE Realtime**: PocketBase 原生支持 SSE，替换 10s 轮询减少服务器压力
- [ ] **请求缓存与离线化**: 菜品列表、设置等不常变数据做本地缓存
- [ ] **数据模型扩展**: Dish 增加多规格(大/中/小)、库存管理、沽清状态
- [ ] **桌台可视化**: 大厅/包间布局图，直观显示桌台占用状态

### 🟢 P3 - 长期体验
- [ ] **PWA 支持**: Service Worker 缓存，离线可查看已加载数据
- [ ] **深色模式**: Tailwind CSS 的 dark mode 适配
- [ ] **打印模板引擎化**: 当前打印 HTML 是硬编码，改为可配置模板
- [ ] **多语言支持**: i18n 国际化（如有需要）

---

## 8. 常用命令速查

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

## 9. 对话恢复指南

如果对话意外退出，将以下内容粘贴给 AI 即可快速恢复上下文：

```
请读取 /var/www/restaurant-pos-vue/project-notes.md 和 docs/智能点菜系统-详细设计说明书.md，
然后我们继续讨论智能点菜系统的开发和优化。
当前最新版本是 v3.0-vue-migration，已于 2026-04-13 部署上线，
2026-04-17 完成了业务逻辑后端托管和餐具费定价改造。
```

---

**文档版本**: v1.2  
**最后更新人**: Kimi  
**更新日期**: 2026-04-19
