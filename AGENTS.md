# AGENTS.md — 智能点菜系统 (restaurant-pos-vue)

> 本项目是面向 AI 编码助手的补充文档，记录构建流程、测试策略、常见陷阱和编码规范。
> 人类贡献者请优先阅读 `README.md`。

---

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Vue | 3.5 | 组件框架 + `<script setup>` Composition API |
| Vite | 8 | 构建工具 + 开发服务器 |
| Vue Router | 5 | SPA 路由 |
| Pinia | 3 | 全局状态管理 |
| Tailwind CSS | v4 | 原子化样式 |
| TypeScript | ~5.6 | 类型安全 |
| Vitest | 4 | 单元测试 |
| Playwright | ~1.49 | E2E 端到端测试 |
| PocketBase | v0.22.27 | 后端数据库 + 认证 + 实时订阅 |
| Fastify | 5 | 公共 API 服务（Node.js） |

---

## 构建与测试命令

```bash
# 安装依赖
npm install

# 开发服务器
npm run dev          # Vite dev server, port 5173

# 单元测试
npm run test:unit    # vitest run
npm run test:unit -- --coverage   # 带覆盖率报告 (v8)
npm run test:unit -- --watch      # 监听模式

# E2E 测试
npm run test:e2e     # playwright test
# CI 环境中建议先 build 再 preview：
# CI=true npm run test:e2e

# 生产构建
npm run build        # 输出到 dist/

# 代码检查
npm run lint
```

---

## 测试策略

### 覆盖率目标

| 指标 | 目标 | 当前 (2026-04-19) |
|------|------|-------------------|
| Statements | ≥ 90% | 92.58% ✅ |
| Branch | ≥ 85% | **85.41%** ✅ |
| Functions | ≥ 80% | 83.86% ✅ |
| Lines | ≥ 90% | 94.30% ✅ |

### 单元测试组织

- 测试文件与源码**同级目录**，后缀 `.spec.ts`：
  - `src/views/OrderListView.vue` → `src/views/__tests__/OrderListView.spec.ts`
  - `src/composables/useCart.ts` → `src/composables/__tests__/useCart.spec.ts`
- 使用 `@vue/test-utils` 的 `mount` + `flushPromises` 测试 Vue 组件。
- API 层使用 `vi.mock()` 模块级 mock。

### 覆盖率提升原则

1. **优先补充 Branch**：Branch 是最难达标的指标，优先覆盖 `if/else`、guard 分支、`catch` 块的 non-Error 路径。
2. **non-Error catch 是常见缺口**：代码中大量存在 `err instanceof Error ? err.message : '未知错误'`，需用 `mockRejectedValue('string error')` 覆盖 false 分支。
3. **模板渲染分支**：打开 modal / 触发 validation 错误后，断言 DOM 中的 `:class` 和 `v-if` 边界。

---

## 编码规范

### 错误处理

- 所有 API 调用必须 `try/catch`，catch 块使用 `err instanceof Error ? err.message : '...'` 模式。
- 不要裸抛字符串异常（`throw 'error'`），但测试需覆盖这种情况。

### 状态值

- 使用 `OrderStatus` 常量枚举，禁止魔法字符串（`'pending'`、`'cooking'` 等）。
- 定义在 `src/utils/orderStatus.ts`。

### 金额计算

- 使用 `MoneyCalculator` 或整数分计算，禁止直接浮点运算。
- 涉及金额的测试需覆盖边界值（0、负数、超大值）。

### 安全

- 用户输入插入 DOM 前必须经过 `escapeHtml()`。
- 禁止 `innerHTML = userInput`，禁止 `document.write(userContent)`。
- PocketBase Filter 使用 `escapePbString()` 转义。

---

## 常见陷阱（测试与开发）

### 1. AudioContext Mock 必须是函数/类

Vue 3 `<script setup>` 中 `new AudioContext()` 要求 mock 使用 `function` 声明：

```typescript
// ✅ 正确 — 可被 new 调用
const AudioContextMock = vi.fn(function AudioContextMock() {
  return { createOscillator: vi.fn(), /* ... */ }
})
globalThis.window.AudioContext = AudioContextMock

// ❌ 错误 — vitest 报 "is not a constructor"
const AudioContextMock = vi.fn(() => ({ /* ... */ }))
```

### 2. Vue 3 模板 ref 不支持对象嵌套属性

```vue
<!-- ❌ 错误 -->
<div ref="chartRefs.trend"></div>

<!-- ✅ 正确 -->
<div ref="trendChartRef"></div>
```

### 3. `ref` 在 `wrapper.vm` 上是 unwrapped 的

```typescript
// 组件内: const audioCtx = ref<AudioContext | null>(null)
// 测试中访问:
const vm = wrapper.vm as any
vm.audioCtx  // 直接是 AudioContext 实例，不是 Ref 对象
```

### 4. 模块级 mock 改变返回值后需重新 mount

```typescript
// useRoute 是模块级 mock，改变返回值后旧组件不会感知
vi.mocked(useRoute).mockReturnValue({ params: { orderId: 'o2' } } as any)
// 必须重新 mount 才能触发新 watcher
const wrapper2 = mount(OrderDetailView)
```

### 5. `vi.mock()` 中必须先声明被 mock 的方法

```typescript
// 在 mock 模块中必须显式声明方法
vi.mock('@/api/pocketbase', async () => ({
  TableStatusAPI: { getTableStatus: vi.fn() },  // ✅ 必须声明
}))
// 否则 vi.mocked(TableStatusAPI.getTableStatus).mockRejectedValue 报 "not a function"
```

### 6. `||` 运算符会吞掉 `0` 和空字符串

```typescript
// ❌ 危险 — 折扣为 0 时会回退到旧值
const discount = payload.discount || oldDiscount

// ✅ 安全
const discount = payload.discount !== undefined ? payload.discount : oldDiscount
```

---

## 文件结构速查

```
src/
├── api/
│   ├── pocketbase.ts           # 员工端 API（带认证、Filter 注入防护）
│   └── public-order.api.ts     # 顾客端公共 API
├── components/                 # 公共组件
│   ├── CartPanel.vue
│   ├── DialogModal.vue
│   ├── SoldOutDrawer.vue
│   └── TableCard.vue
├── composables/                # 组合式逻辑
│   ├── useAutoRefresh.ts       # 自动刷新 + visibilitychange 优化
│   ├── useCart.ts
│   ├── useClearTable.ts
│   ├── useConfirm.ts
│   ├── useDebounce.ts
│   ├── useGlobalLoading.ts
│   ├── usePagination.ts
│   └── useToast.ts
├── config/
│   └── dish.config.ts          # 菜品分类排序规则
├── constants/
│   └── index.ts                # 业务常量枚举
├── layouts/
│   └── MainLayout.vue
├── router/
│   └── index.ts
├── schemas/                    # Zod Schema
│   ├── dish.schema.ts
│   ├── order.schema.ts
│   └── settings.schema.ts
├── stores/                     # Pinia Store
│   ├── auth.store.ts
│   └── settings.store.ts
├── utils/
│   ├── assets.ts
│   ├── error.ts
│   ├── orderStatus.ts          # 订单状态枚举 + 流转校验
│   ├── orderValidation.ts
│   ├── printBill.ts            # 打印账单/厨单
│   └── security.ts             # XSS 防护 + MoneyCalculator + Validators
└── views/                      # 页面视图
    ├── LoginView.vue
    ├── OrderListView.vue       # 订单列表 + 沽清管理
    ├── OrderFormView.vue       # 新建/编辑订单
    ├── OrderDetailView.vue     # 订单详情 + 状态操作 + 清台
    ├── KitchenDisplayView.vue  # 厨房大屏（KDS）+ 音频通知
    ├── CustomerOrderView.vue   # 顾客扫码点餐
    ├── SettingsView.vue        # 系统设置 + 菜品维护 + 二维码下载
    ├── StatisticsView.vue      # 营业数据统计（ECharts）
    └── TableVisualizationView.vue  # 桌台可视化
```

---

## 关键业务规则

1. **订单状态推断**：后端 Hook 根据 `items[].status` 自动推断订单整体状态，前端不可直接设置。
2. **桌台占用检查**：新建订单前检查桌台是否为 `dining`，占用时阻断。
3. **completed/settled/cancelled 不可追加**：终态订单禁止顾客追加菜品。
4. **清台联动**：清台后订单变为 `settled`，桌台变为 `idle`。
5. **dining 追加保持**：dining 状态追加菜品，订单状态保持 `dining`，新增菜品为 `pending`。
6. **状态不回退**：后端自动推断订单状态时，优先级低的状态不会覆盖当前状态（如 `serving` 不会回退到 `cooking`）。

---

## 部署相关

- 生产环境部署脚本在 `README.md` 的「部署说明」章节。
- 前端构建产物通过 `rsync` 同步到 `/var/www/restaurant-pos/`。
- 公共 API 服务通过 `pm2` 管理。
- Nginx 配置在 `nginx.conf`。

---

**版本**: 1.0.0  
**创建日期**: 2026-04-19  
**适用范围**: 智能点菜系统 Vue 3 重构版
