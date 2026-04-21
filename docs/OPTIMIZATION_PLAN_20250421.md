# 智能点菜系统 — 中风险问题优化方案

> **文档版本**: v1.0  
> **编写日期**: 2026-04-21  
> **编写人**: Kimi Code CLI  
> **适用范围**: `restaurant-pos-vue` v1.1.3  
> **文档定位**: 针对系统洞察发现的中风险问题，制定可执行的优化方案，便于后续分阶段实施。

---

## 1. 执行摘要

基于 2026-04-21 系统全面洞察，识别出 **4 个中风险问题**。这些问题不会立即导致系统故障，但会持续累积技术债务，影响代码质量、重构安全性和 CI/CD 可靠性。

| # | 问题 | 当前状态 | 目标状态 | 预估工作量 | 优先级 |
|---|------|----------|----------|-----------|--------|
| 1 | CI 中 ESLint 被注释，代码风格无门禁 | 手动注释跳过 | CI 自动拦截 | 0.5 人天 | P1 |
| 2 | `views/` 单元测试分支覆盖率 66.71% | 页面级异常/交互未覆盖 | 分支 ≥ 75%，函数 ≥ 70% | 2-3 人天 | P1 |
| 3 | 缺少覆盖率阈值门禁 | 无阈值，覆盖率可下滑 | 低于阈值 CI 失败 | 0.3 人天 | P2 |
| 4 | `api/` 分支覆盖率 76.84% | 网络异常分支未覆盖 | 分支 ≥ 80% | 0.5 人天 | P2 |

**建议执行顺序**：问题 1 → 问题 3 → 问题 4 → 问题 2（先建立门禁，再补齐覆盖）。

> **注**：截至 2026-04-21，`api/` 分支覆盖率已从 72.41% 提升至 76.84%（`pocketbase.ts` 从 65.94% 提升至 75.67%），详见 `docs/TEST_COVERAGE_REPORT.md`。

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

#### 2.2.1 现状诊断

| 视图文件 | Statements | Branches | Functions | 风险焦点 |
|----------|------------|----------|-----------|----------|
| `CustomerOrderView.vue` | 70.21% | **50.78%** | **42.25%** | 支付流程、加菜弹窗、餐具计算 |
| `OrderListView.vue` | 73.92% | **62.45%** | **63.09%** | 批量操作、高级筛选、打印弹窗、清台 |
| `OrderFormView.vue` | 71.92% | 74.36% | **54.87%** | 菜品搜索过滤、大图预览、编辑回显 |
| `OrderDetailView.vue` | 89.75% | 66.49% | 76.19% | 状态按钮可用性、追加菜品弹窗 |
| `SettingsView.vue` | 75.90% | 76.88% | **54.71%** | 图片上传预览、复杂表单校验 |
| **views 合计** | **78.60%** | **66.71%** | **63.14%** | — |

**核心缺口**：页面级**异常处理分支**（API 失败、网络超时）、**条件渲染分支**（空状态/加载态/错误态）、**复杂交互路径**（弹窗打开/关闭、表单验证失败）未覆盖。

#### 2.2.2 优化方案

**策略**：按「业务风险 × 覆盖难度」排序，优先补齐顾客端和订单核心流程。

**阶段 1：CustomerOrderView.vue（分支 50.78% → 65%）**

补齐以下未覆盖路径（行 627-756, 770-806）：

| # | 场景 | 测试要点 |
|---|------|----------|
| 1 | 顾客首次扫码，桌台已有未完成订单 | 自动加入订单、恢复会话、显示已有菜品 |
| 2 | 追加菜品弹窗交互 | 打开弹窗 → 选菜 → 数量修改 → 提交 → 成功后刷新订单 |
| 3 | 追加菜品时餐具费变化 | 追加后底部栏金额与弹窗金额一致（避免重复计算） |
| 4 | 支付二维码展示 | 订单 dining 状态后显示收款码、点击放大 |
| 5 | 菜品被标记沽清后的购物车响应 | SSE 推送后自动提示移除、禁用提交 |
| 6 | 网络异常降级 | `getOrdersByTable` 失败时显示错误提示、允许重试 |

**阶段 2：OrderListView.vue（分支 62.45% → 72%）**

补齐以下未覆盖路径（行 459-767, 780-823）：

| # | 场景 | 测试要点 |
|---|------|----------|
| 1 | 批量筛选组合 | 日期筛选 + 状态筛选 + 桌号搜索同时生效 |
| 2 | 清台前置检查阻断 | 点击清台 → 检测到未完成订单 → 显示阻断提示 |
| 3 | 打印小票弹窗 | 点击打印 → 弹窗渲染 → 调用 `printBill` → 关闭弹窗 |
| 4 | 自动刷新失败 | `silentRefresh` 网络异常时输出 `console.warn` |
| 5 | 分页边界 | 最后一页、空列表、切换页码 |

**阶段 3：OrderFormView.vue（函数 54.87% → 65%）**

补齐以下未覆盖路径（行 461-462, 561-662, 685-728）：

| # | 场景 | 测试要点 |
|---|------|----------|
| 1 | 菜品搜索过滤 | 输入关键词 → 实时过滤 → 清空关键词恢复 |
| 2 | 大图预览 | 点击菜品图片 → 打开预览 → 点击关闭 |
| 3 | 编辑模式数据回显 | 进入 `/edit-order/:id` → 表单回填原有菜品/折扣/餐具 |
| 4 | 折扣边界校验 | percent > 10 被阻断、amount > total 被阻断 |

**阶段 4：SettingsView.vue（函数 54.71% → 65%）**

| # | 场景 | 测试要点 |
|---|------|----------|
| 1 | 图片上传预览 | 选择文件 → 预览显示 → 上传成功 → 保存设置 |
| 2 | 表单校验失败提示 | 空店名、无效电话、重复分类 |

#### 2.2.3 验收标准

- [ ] `views/` 整体分支覆盖率 ≥ **75%**（当前 66.71%）
- [ ] `views/` 整体函数覆盖率 ≥ **70%**（当前 63.14%）
- [ ] 新增测试全部通过，无 skipped
- [ ] 测试过程中不引入产品代码变更（除非发现 Bug）

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

#### 2.4.1 现状诊断

| 文件 | Statements | Branches | 未覆盖分支 |
|------|------------|----------|-----------|
| `pocketbase.ts` | 75.15% | **65.94%** | HTTP 500/403 处理、超时兜底、Token 过期预检 |
| `public-order.api.ts` | 97.87% | 88.88% | 基本覆盖良好 |

核心缺口在 `pocketbase.ts` 的**网络异常处理**和**边缘响应场景**。

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

- [ ] `api/` 整体分支覆盖率 ≥ **80%**（当前 72.41%）
- [ ] `pocketbase.ts` 分支覆盖率 ≥ **75%**（当前 65.94%）
- [ ] 新增测试不依赖真实网络，全部使用 Mock

---

## 3. 执行路线图

```
Week 1: 建立门禁
├── Day 1-2: 修复 ESLint 配置 + 批量修复 @ts-ignore + 取消 CI 注释
├── Day 3: 配置 Vitest 覆盖率阈值
└── Day 4-5: 验证 CI 全链路通过（lint + type-check + unit-test + threshold）

Week 2: API 层补测
├── Day 1-2: 补齐 pocketbase.ts 网络异常分支测试（6 个场景）
└── Day 3-5: 验证 api/ 分支覆盖 ≥ 80%，修复可能的回归问题

Week 3-4: 视图层补测（核心）
├── Week 3 Day 1-2: CustomerOrderView.vue 补测（支付/加菜/餐具/沽清）
├── Week 3 Day 3-4: OrderListView.vue 补测（筛选/清台/打印/分页）
├── Week 3 Day 5: 验证 views 分支/函数覆盖率提升
├── Week 4 Day 1-2: OrderFormView.vue 补测（搜索/预览/编辑回显）
└── Week 4 Day 3-5: SettingsView.vue 补测 + 整体回归

收尾
├── 全量单元测试通过
├── E2E 核心流程回归
├── 更新所有相关文档
└── 合并到 develop → main
```

**总预估工作量**：3.5-4 周（约 10-12 人天），建议分配 1 名前端工程师全职投入。

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
| `docs/TEST_COVERAGE_REPORT.md` | 覆盖率基线与缺口 | 已更新，补充具体执行建议 |
| `docs/ARCHITECTURE_ROADMAP_20250421.md` | 长期技术投资方向 | 已更新，P2-1 对齐本方案 |
| `CHECKPOINT-20260421.md` | 当前会话状态 | 已更新，新增待办优化项 |
| `.github/workflows/ci.yml` | CI 配置 | 待执行（取消 lint 注释、增加 coverage） |
| `vitest.config.ts` | 测试配置 | 待执行（增加 thresholds） |
| `eslint.config.js` | 代码规范配置 | 待执行（增加 pb_hooks / sw 全局变量） |

---

**文档结束**
