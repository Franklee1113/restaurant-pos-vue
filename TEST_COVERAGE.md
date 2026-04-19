# 单元测试覆盖率报告

> 生成时间：2026-04-19
> 测试框架：Vitest v4.1.4 + @vitest/coverage-v8
> 测试环境：jsdom

---

## 一、测试执行摘要

| 指标 | 数值 |
|------|------|
| 测试文件 | 14 个 |
| 测试用例 | **126 个** |
| 通过 | **126 个** |
| 失败 | 0 个 |
| 整体语句覆盖率 | **59.96%** |
| 分支覆盖率 | **48.89%** |
| 函数覆盖率 | **68.75%** |
| 行覆盖率 | **61.64%** |

---

## 二、分层覆盖率明细

### 2.1 Composables（组合式函数）

| 模块 | 语句 | 分支 | 函数 | 行 | 状态 |
|------|------|------|------|-----|------|
| `useAutoRefresh.ts` | 100% | 100% | 100% | 100% | ✅ 完整 |
| `useCart.ts` | 96.36% | 80.95% | 100% | 100% | ✅ 高覆盖 |
| `useConfirm.ts` | 100% | 100% | 100% | 100% | ✅ 完整 |
| `useDebounce.ts` | 100% | 80% | 100% | 100% | ✅ 高覆盖 |
| `useGlobalLoading.ts` | 100% | 100% | 100% | 100% | ✅ 完整 |
| `usePagination.ts` | 100% | 100% | 100% | 100% | ✅ 完整 |
| `useToast.ts` | 100% | 100% | 100% | 100% | ✅ 完整 |

**未覆盖行提示**：
- `useCart.ts` 第 51, 77, 84, 95 行：配菜规则未命中分支、removeFromCart边界
- `useDebounce.ts` 第 17 行：`cancel()` 中 `timer = null` 的分支

### 2.2 Stores（状态管理）

| 模块 | 语句 | 分支 | 函数 | 行 | 状态 |
|------|------|------|------|-----|------|
| `auth.store.ts` | 95.55% | 75% | 100% | 95.34% | ✅ 高覆盖 |
| `settings.store.ts` | 83.75% | 58.53% | 87.5% | 90.76% | 🟡 中等 |

**未覆盖行提示**：
- `auth.store.ts` 第 22 行：localStorage 解析 catch 分支；第 63 行：登录 data.token 为 falsy 的分支
- `settings.store.ts` 第 46-47, 56-57, 67-68 行：`saveSettings` / `saveSettingsFiles` 中 `settings.value?.id` 缺失的分支，以及 isSaving 并发拦截分支

### 2.3 Utils（工具函数）

| 模块 | 语句 | 分支 | 函数 | 行 | 状态 |
|------|------|------|------|-----|------|
| `assets.ts` | 100% | 100% | 100% | 100% | ✅ 完整 |
| `error.ts` | 100% | 100% | 100% | 100% | ✅ 完整 |
| `orderStatus.ts` | 84.84% | 68.42% | 85.71% | 87.5% | 🟡 中等 |
| `printBill.ts` | 100% | 65.93% | 100% | 100% | ✅ 高覆盖 |
| `security.ts` | 56.94% | 38% | 64.28% | 59.09% | 🟡 中等 |

**未覆盖行提示**：
- `orderStatus.ts` 第 92 行：`transitionStatus` 函数；第 117, 133-134 行：`generateOrderNo` 的 `crypto` 不可用降级分支和 `calculateAmount` 函数
- `printBill.ts` 第 163-169 行：免费餐具分支；第 190-245 行：`printKitchenTicket` 函数（HTML生成与打印）
- `security.ts` 第 30-90 行：`setSafeHtml` / `setSafeAttribute` / `createSafeText` / `setSafeText`；第 167 行：`Validators.orderNo`；第 206-209 行：`Validators.sanitizeString` 非字符串分支

### 2.4 API 层（未覆盖）

| 模块 | 语句 | 分支 | 函数 | 行 | 状态 |
|------|------|------|------|-----|------|
| `api/pocketbase.ts` | **3.77%** | **1.7%** | **0%** | **4.25%** | 🔴 未覆盖 |

**说明**：API 层是系统中最大的覆盖率洼地。需要 Mock `fetch` 全局对象，覆盖 OrderAPI / DishAPI / PublicOrderAPI / TableStatusAPI / SettingsAPI 的全部方法，以及错误处理分支（401/超时/网络异常）。

---

## 三、已覆盖测试文件清单

```
src/
├── composables/
│   ├── __tests__/
│   │   ├── useAutoRefresh.spec.ts    (8 tests)
│   │   ├── useCart.spec.ts           (15 tests)
│   │   ├── useConfirm.spec.ts        (7 tests)
│   │   ├── useDebounce.spec.ts       (6 tests)
│   │   ├── useGlobalLoading.spec.ts  (7 tests)
│   │   ├── usePagination.spec.ts     (13 tests)
│   │   └── useToast.spec.ts          (11 tests)
├── stores/
│   ├── __tests__/
│   │   ├── auth.store.spec.ts        (9 tests)
│   │   └── settings.store.spec.ts    (13 tests)
└── utils/
    ├── __tests__/
    │   ├── assets.spec.ts            (5 tests)
    │   ├── error.spec.ts             (7 tests)
    │   ├── orderStatus.spec.ts       (7 tests)
    │   ├── printBill.spec.ts         (10 tests)
    │   └── security.spec.ts          (8 tests)
```

---

## 四、待覆盖模块清单（按优先级排序）

### 🔴 P0 — 核心模块，缺失风险高

| 模块 | 预估用例 | 主要挑战 |
|------|---------|---------|
| `src/api/pocketbase.ts` | 25+ | Mock `fetch` / `AbortController` / `localStorage`，覆盖 401/408/500 等异常分支 |

### 🟡 P1 — 重要模块，建议尽快补充

| 模块 | 预估用例 | 主要挑战 |
|------|---------|---------|
| `src/utils/security.ts` | 15+ | `setSafeHtml` / `setSafeAttribute` 需要 DOM 环境操作验证 |
| `src/utils/orderStatus.ts` | 5+ | `transitionStatus` 异步流转、`generateOrderNo` crypto 降级分支 |
| `src/utils/printBill.ts` | 5+ | `printKitchenTicket` 的 HTML 生成与窗口操作 |
| `src/stores/settings.store.ts` | 4+ | `saveSettings` / `saveSettingsFiles` 中 id 缺失和 isSaving 拦截分支 |
| `src/stores/auth.store.ts` | 2+ | localStorage 解析 catch 分支、登录 data.token 为 falsy 分支 |

### 🟢 P2 — 视图层，复杂度高但业务价值大

| 模块 | 预估用例 | 主要挑战 |
|------|---------|---------|
| `src/views/LoginView.vue` | 8+ | `@vue/test-utils` 挂载 + 表单输入 + 提交验证 |
| `src/views/OrderListView.vue` | 10+ | 大量 DOM 交互 + filter 构建 + 清台逻辑 |
| `src/views/OrderFormView.vue` | 10+ | 购物车交互 + 折扣计算 + 表单提交 |
| `src/views/OrderDetailView.vue` | 8+ | 状态流转 + 打印 + 清台 |
| `src/views/CustomerOrderView.vue` | 8+ | 移动端布局 + 购物车抽屉 + 提交 |
| `src/views/KitchenDisplayView.vue` | 6+ | 轮询模拟 + 菜品状态操作 |
| `src/views/StatisticsView.vue` | 6+ | ECharts 初始化 mock + 数据聚合验证 |
| `src/views/SettingsView.vue` | 8+ | 分类/桌号增删 + 菜品维护模态框 |

### ⚪ P3 — 组件层

| 模块 | 预估用例 | 主要挑战 |
|------|---------|---------|
| `src/components/*.vue` | 3-5/个 | 纯 UI 交互，建议选择性覆盖核心组件（CartPanel / DialogModal / CutleryConfigPanel） |
| `src/layouts/MainLayout.vue` | 3+ | 导航交互 + 全局 confirm/loading 挂载 |
| `src/router/index.ts` | 5+ | 路由守卫 + 导航验证 |
| `src/App.vue` | 2+ | 页面过渡 + ErrorBoundary |

---

## 五、覆盖率提升路线图

```
当前:  语句 60% / 分支 49% / 函数 69% / 行 62%

第一阶段（API层）:
  补充 api/pocketbase.ts 测试
  目标: 语句 75% / 分支 60% / 函数 80% / 行 78%

第二阶段（utils补全）:
  补充 security.ts / orderStatus.ts / printBill.ts 未覆盖分支
  目标: 语句 85% / 分支 70% / 函数 88% / 行 87%

第三阶段（视图核心）:
  补充 LoginView / OrderListView / OrderFormView 测试
  目标: 语句 70% / 分支 55% / 函数 75% / 行 72%
```

---

## 六、运行测试命令

```bash
# 运行全部单元测试
npm run test:unit

# 运行并生成覆盖率报告
npm run test:unit -- --coverage

# 运行特定文件
npx vitest --run src/utils/__tests__/security.spec.ts

# 监听模式（开发时）
npx vitest
```

---

## 七、更新记录

| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-04-19 | v1.0 | 初始版本，14 个测试文件，126 个用例，整体语句覆盖率 60% |
