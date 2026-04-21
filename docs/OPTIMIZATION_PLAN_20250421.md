# 智能点菜系统 — 中风险问题优化方案

> **文档版本**: v1.0  
> **编写日期**: 2026-04-21  
> **编写人**: Kimi Code CLI  
> **适用范围**: `restaurant-pos-vue` v1.1.3  
> **文档定位**: 针对系统洞察发现的中风险问题，制定可执行的优化方案，便于后续分阶段实施。

---

## 1. 执行摘要

基于 2026-04-21 系统全面洞察，识别出 **4 个中风险问题**。这些问题不会立即导致系统故障，但会持续累积技术债务，影响代码质量、重构安全性和 CI/CD 可靠性。

| # | 问题 | 当前状态 | 目标状态 | 预估工作量 | 优先级 | 进度 |
|---|------|----------|----------|-----------|--------|------|
| 1 | CI 中 ESLint 被注释，代码风格无门禁 | 手动注释跳过 | CI 自动拦截 | 0.5 人天 | P1 | ⏳ 未开始 |
| 2 | `views/` 单元测试分支覆盖率 **77.08%** ✅ | 页面级异常/交互已大幅覆盖 | 分支 ≥ 75%，函数 ≥ 75% | 1 人天 | P1 | 🟡 部分达成（函数 71.74%，差 3.26%） |
| 3 | 缺少覆盖率阈值门禁 | 无阈值，覆盖率可下滑 | 低于阈值 CI 失败 | 0.3 人天 | P2 | ⏳ 未开始 |
| 4 | `api/` 分支覆盖率 **76.84%** | 网络异常分支未覆盖 | 分支 ≥ 80% | 0.5 人天 | P2 | 🟡 进行中（差 3.16%） |

**建议执行顺序**：问题 1 → 问题 3 → 问题 4 → 问题 2（先建立门禁，再补齐覆盖）。

> **注**：截至 2026-04-21 23:55，六阶段补测已完成。`api/` 分支覆盖率从 72.41% 提升至 76.84%（`pocketbase.ts` 从 65.94% 提升至 75.67%），`views/` 分支覆盖率从 66.71% 提升至 77.08%，`CustomerOrderView.vue` 分支覆盖从 52.97% 跃升至 84.63%。详见 `docs/TEST_COVERAGE_REPORT.md`。

---

## 2. 问题详解与优化方案

### 2.1 问题 1：CI 中 ESLint 检查被注释

#### 2.1.1 现状诊断

`.github/workflows/ci.yml` 第 49-51 行 ESLint 步骤被注释：

```yaml
# Uncomment when ESLint is configured
# - name: Lint
#   run: npm run lint
```

当前 `npm run lint` 执行结果：
- **487 个问题**：65 errors + 422 warnings
- **Errors 分布**：
  - `pb_hooks/*.js`：Goja VM 全局变量未定义（`$app`, `$security`, `onRecordBeforeCreateRequest` 等）≈ 35 个
  - `public/sw.js`：Service Worker 全局变量未定义（`self`, `caches`, `fetch` 等）≈ 15 个
  - `src/` + `server/src/`：`@ts-ignore` 应改为 `@ts-expect-error` ≈ 14 个
  - `server/src/`: `module` 未定义 ≈ 1 个

**根因**：ESLint 配置未覆盖 PocketBase Hook 和 Service Worker 的运行环境，导致大量 `no-undef` 误报。

#### 2.1.2 优化方案

**步骤 A：修复 ESLint 配置（`eslint.config.js`）**

为 `pb_hooks/` 和 `public/sw.js` 增加独立的配置块，声明 Goja VM 和 Service Worker 的全局变量：

```javascript
// 在 eslint.config.js 中新增
{
  name: 'app/pb-hooks',
  files: ['pb_hooks/**/*.js'],
  languageOptions: {
    globals: {
      onRecordBeforeCreateRequest: 'readonly',
      onRecordBeforeUpdateRequest: 'readonly',
      onRecordAfterCreateRequest: 'readonly',
      onRecordAfterUpdateRequest: 'readonly',
      routerAdd: 'readonly',
      $app: 'readonly',
      $security: 'readonly',
      module: 'readonly',
    },
  },
  rules: {
    'no-console': 'off', // PB Hook 允许 console.log
  },
},
{
  name: 'app/service-worker',
  files: ['public/sw.js'],
  languageOptions: {
    globals: {
      self: 'readonly',
      caches: 'readonly',
      clients: 'readonly',
      fetch: 'readonly',
      Response: 'readonly',
      URL: 'readonly',
    },
  },
},
```

**步骤 B：批量替换 `@ts-ignore` 为 `@ts-expect-error`**

涉及文件：
- `src/api/pocketbase.ts`（6 处）
- `src/views/OrderFormView.vue`（2 处）
- `src/views/OrderDetailView.vue`（1 处）
- `src/utils/printBill.ts`（1 处 triple-slash-reference）

使用 `sed` 或 IDE 批量替换，并验证替换后无新增类型错误。

**步骤 C：取消注释 CI 中的 Lint 步骤**

修改 `.github/workflows/ci.yml`：

```yaml
- name: Lint
  run: npm run lint
```

**步骤 D：验证**

```bash
npm run lint
# 预期结果：0 errors，warnings 可接受（当前 422 个主要是测试文件中的 any）
```

#### 2.1.3 验收标准

- [ ] `npm run lint` 返回 0 errors
- [ ] CI 中 `lint-and-type-check` Job 的 Lint 步骤正常运行
- [ ] `pb_hooks/` 和 `public/sw.js` 不再产生 `no-undef` 误报
- [ ] 不引入新的 lint errors

---

### 2.2 问题 2：`views/` 单元测试覆盖率偏低

#### 2.2.1 现状诊断（2026-04-21 更新）

| 视图文件 | Statements | Branches | Functions | 风险焦点 |
|----------|------------|----------|-----------|----------|
| `CustomerOrderView.vue` | **84.15%** | **84.63%** | **66.19%** | 支付流程、加菜弹窗、餐具计算 |
| `OrderListView.vue` | **90.75%** | **77.32%** | **77.38%** | 批量操作、高级筛选、打印弹窗、清台 |
| `OrderFormView.vue` | **78.54%** | **77.61%** | **62.19%** | 菜品搜索过滤、大图预览、编辑回显 |
| `OrderDetailView.vue` | 89.75% | 66.49% | 76.19% | 状态按钮可用性、追加菜品弹窗 |
| `SettingsView.vue` | 75.90% | 76.88% | **54.71%** | 图片上传预览、复杂表单校验 |
| **views 合计** | **85.18%** | **77.08%** | **71.74%** | — |

**核心缺口**：页面级**异常处理分支**（API 失败、网络超时）、**复杂交互路径**（弹窗打开/关闭、表单验证失败）在 `OrderFormView.vue` 和 `SettingsView.vue` 中仍有残留；`OrderDetailView.vue` 分支覆盖 66.49% 仍有提升空间。

#### 2.2.2 优化方案

**策略**：按「业务风险 × 覆盖难度」排序，优先补齐顾客端和订单核心流程。

**阶段 1：CustomerOrderView.vue（分支 50.78% → 65%，实际已达 84.63%）** ✅

原计划的以下场景已在 Phase 1~3 补测中覆盖：

| # | 场景 | 覆盖状态 |
|---|------|----------|
| 1 | 顾客首次扫码，桌台已有未完成订单 | ✅ 自动加入订单、恢复会话、显示已有菜品 |
| 2 | 追加菜品弹窗交互 | ✅ 打开弹窗 → 选菜 → 数量修改 → 提交 |
| 3 | 追加菜品时餐具费变化 | ✅ 底部栏金额与弹窗金额一致 |
| 4 | 支付二维码展示 | 🟡 仍待覆盖（支付流程模板分支） |
| 5 | 菜品被标记沽清后的购物车响应 | ✅ SSE 推送后自动提示移除 |
| 6 | 网络异常降级 | ✅ `getOrdersByTable` / `refreshDishes` / `refreshOrder` catch 分支已覆盖 |

**阶段 2：OrderListView.vue（分支 62.45% → 72%，实际已达 77.32%）** ✅

原计划的以下场景已覆盖：

| # | 场景 | 覆盖状态 |
|---|------|----------|
| 1 | 批量筛选组合 | ✅ `buildFilterString` 全分支覆盖 |
| 2 | 清台前置检查阻断 | ✅ `handleToggleSoldOut`、`handleResetAllSoldOut` 乐观更新+回滚 |
| 3 | 打印小票弹窗 | 🟡 仍待覆盖（`exportExcel` 已测，`printBill` 弹窗未测） |
| 4 | 自动刷新失败 | ✅ `silentRefresh` 网络异常时 `console.warn` |
| 5 | 分页边界 | ✅ 分页边界条件已覆盖 |

**阶段 3：OrderFormView.vue（函数 54.87% → 65%，实际已达 62.19%）** 🟡

| # | 场景 | 覆盖状态 |
|---|------|----------|
| 1 | 菜品搜索过滤 | 🟡 仍待覆盖 |
| 2 | 大图预览 | 🟡 仍待覆盖 |
| 3 | 编辑模式数据回显 | 🟡 仍待覆盖 |
| 4 | 折扣边界校验 | ✅ percent > 10 / amount > total 阻断已覆盖 |

**阶段 4：SettingsView.vue（函数 54.71% → 65%）** ⏳

| # | 场景 | 覆盖状态 |
|---|------|----------|
| 1 | 图片上传预览 | 🟡 仍待覆盖 |
| 2 | 表单校验失败提示 | 🟡 仍待覆盖 |

#### 2.2.3 验收标准

- [x] `views/` 整体分支覆盖率 ≥ **75%**（当前 **77.08%** ✅）
- [ ] `views/` 整体函数覆盖率 ≥ **75%**（当前 **71.74%**，差 3.26%）
- [x] 新增测试全部通过，2 个 skipped（jsdom 环境限制）
- [x] 测试过程中发现 2 个产品缺陷并已修复（BUG-FIX-001 / BUG-FIX-002）

---

### 2.3 问题 3：缺少覆盖率阈值门禁

#### 2.3.1 现状诊断

`vitest.config.ts` 中未配置 `coverage.thresholds`，意味着即使覆盖率下降，CI 也不会失败。

#### 2.3.2 优化方案

**步骤 A：安装/确认覆盖率插件**

```bash
npm install -D @vitest/coverage-v8
```

**步骤 B：修改 `vitest.config.ts`**

```typescript
import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      exclude: [...configDefaults.exclude, 'e2e/**'],
      root: fileURLToPath(new URL('./', import.meta.url)),
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html', 'json-summary'],
        thresholds: {
          statements: 80,
          branches: 70,
          functions: 70,
          lines: 85,
        },
        // 排除不可测试或低价值代码
        exclude: [
          ...configDefaults.exclude,
          'src/types/**',
          'src/router/**',
          'src/layouts/**',
          'src/main.ts',
          'src/App.vue',
          '**/*.d.ts',
        ],
      },
    },
  }),
)
```

**步骤 C：在 CI 中启用覆盖率检查**

修改 `.github/workflows/ci.yml` 的 `unit-tests` Job：

```yaml
- name: Run unit tests with coverage
  run: npm run test:unit -- --coverage
```

**步骤 D：验证当前覆盖率是否满足阈值**

```bash
npm run test:unit -- --coverage
# 若当前分支/函数覆盖率低于阈值，先补齐视图/API测试后再启用
```

> **注意**：建议先完成「问题 2」和「问题 4」的补测，确认覆盖率达标后再合并阈值配置，避免阻塞其他开发。

#### 2.3.3 验收标准

- [ ] `vitest.config.ts` 中包含 `coverage.thresholds` 配置
- [ ] CI 中 `npm run test:unit -- --coverage` 低于阈值时构建失败
- [ ] 阈值设置合理，不阻碍正常开发（建议：statements 80, branches 70, functions 70, lines 85）

---

### 2.4 问题 4：`api/` 分支覆盖率偏低

#### 2.4.1 现状诊断（2026-04-21 更新）

| 文件 | Statements | Branches | 未覆盖分支 |
|------|------------|----------|-----------|
| `pocketbase.ts` | **89.17%** | **75.67%** | SSE error 回调、极少数网络边缘场景 |
| `public-order.api.ts` | 97.87% | 88.88% | 基本覆盖良好 |

核心缺口在 `pocketbase.ts` 的**SSE 异常降级**和**极端网络边缘场景**（剩余行 426-427, 500-503）。

#### 2.4.2 优化方案

补齐以下分支：

| # | 场景 | 测试方法 |
|---|------|----------|
| 1 | `handleResponse` 处理 HTTP 500 + 空响应体 | Mock fetch 返回 `{ status: 500, statusText: 'Internal Server Error', json: () => Promise.reject() }` |
| 2 | `handleResponse` 处理 HTTP 403 Forbidden | Mock fetch 返回 403，验证是否抛出 `APIError` |
| 3 | `fetchWithTimeout` 超时触发 `AbortController` | 使用 `vi.useFakeTimers()` 快进超过 30 秒 |
| 4 | `getAdminToken` JWT 过期客户端预检 | Mock `localStorage` 中存储已过期 token，验证是否清除并重定向 |
| 5 | `privateRequest` 非 AbortError 网络错误包装 | Mock fetch 抛出非 AbortError 异常，验证是否包装为 `APIError` |
| 6 | `subscribeToOrders` SSE 连接异常降级 | Mock `EventSource` 触发 `error` 事件，验证回调是否收到错误通知 |

#### 2.4.3 验收标准

- [ ] `api/` 整体分支覆盖率 ≥ **80%**（当前 **76.84%**，差 3.16%）
- [x] `pocketbase.ts` 分支覆盖率 ≥ **75%**（当前 **75.67%** ✅）
- [x] 新增测试不依赖真实网络，全部使用 Mock

---

## 3. 执行路线图（2026-04-21 更新）

```
已完成的测试补测（单日完成，2026-04-21）
├── Phase 1: pb_hooks 核心逻辑外迁 (orderValidation.ts) + CustomerOrderView / OrderFormView 交互测试
├── Phase 2: OrderListView DOM 交互 / pocketbase.ts SSE & 网络异常分支
├── Phase 3: CustomerOrderView.vue 分支覆盖 52.97% → 84.63%
└── 产出: 582 测试通过, 覆盖率 Statements 88.77% / Branch 79.34% / Functions 80.5%

Week 1: 建立门禁
├── Day 1-2: 修复 ESLint 配置 + 批量修复 @ts-ignore + 取消 CI 注释
├── Day 3: 配置 Vitest 覆盖率阈值（statements 80, branches 70, functions 70, lines 85）
└── Day 4-5: 验证 CI 全链路通过（lint + type-check + unit-test + threshold）

Week 2: 剩余补测（轻量）
├── Day 1-2: OrderFormView.vue 补齐搜索/预览/编辑回显（目标函数 65%+，当前 62.19%）
├── Day 3: SettingsView.vue 补齐图片上传/表单校验（目标函数 65%+，当前 54.71%）
└── Day 4-5: api/ 分支覆盖补齐至 80%（当前 76.84%，差 3.16%）

收尾
├── 全量单元测试通过
├── E2E 核心流程回归
├── 更新所有相关文档
└── 合并到 develop → main
```

**总预估工作量**：已完成的补测约占 8-10 人天（实际在单日会话中完成）；剩余工作量约 1-1.5 周（3-4 人天）。

---

## 4. 风险控制

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 补测过程中发现产品 Bug | 延长工期 | 发现的 Bug 单独记录，不阻塞覆盖率提升主线；严重 Bug 单独提 PR 修复 |
| ESLint 修复引入新的类型错误 | CI 失败 | 每一步修改后在本地运行 `npm run type-check && npm run lint` |
| 阈值配置过早导致 CI 频繁失败 | 阻碍开发 | 先跑通覆盖率再合并阈值配置，或初始阈值设低（statements 75, branches 65）逐步收紧 |
| Mock 测试过于复杂难以维护 | 测试腐败 | 使用 `vitest` 的 `mockResolvedValue` / `mockRejectedValue` 保持简洁；每个测试独立 mock |

---

## 5. 相关文档索引

| 文档 | 用途 | 更新状态 |
|------|------|----------|
| `docs/CODE_AUDIT_REPORT.md` | P1 问题跟踪 | 已更新，标注优化方案引用 |
| `docs/TEST_COVERAGE_REPORT.md` | 覆盖率基线与缺口 | ✅ 已更新至 v3.0，反映六阶段补测最终数据 |
| `docs/ARCHITECTURE_ROADMAP_20250421.md` | 长期技术投资方向 | 已更新，P2-1 对齐本方案 |
| `CHECKPOINT-20260421.md` | 当前会话状态 | ✅ 已更新，新增测试完成记录 |
| `CHANGELOG.md` | 版本变更日志 | ✅ 已新增测试覆盖率提升章节 |
| `.github/workflows/ci.yml` | CI 配置 | 待执行（取消 lint 注释、增加 coverage） |
| `vitest.config.ts` | 测试配置 | 待执行（增加 thresholds） |
| `eslint.config.js` | 代码规范配置 | 待执行（增加 pb_hooks / sw 全局变量） |

---

**文档结束**
