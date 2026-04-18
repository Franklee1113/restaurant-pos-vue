# 智能点菜系统 - 全系统代码审核报告

**审核日期**: 2026-04-14  
**审核范围**: `src/` 源码、`scripts/`、`Dockerfile`、`docker-compose.yml`、`nginx.conf`、构建与部署流程  
**版本**: `v1.0.0`  
**审核结论**: **良好，但存在 2 项安全漏洞和 5 项架构/性能缺陷需要修复。**

---

## 一、执行摘要

| 维度 | 评分 | 说明 |
|------|------|------|
| **代码规范** | ⭐⭐⭐⭐☆ | ESLint + Prettier + Husky 已落地，无 `console.log`，无 `as any` |
| **类型安全** | ⭐⭐⭐⭐☆ | 已清理 `catch (err: any)`，`vue-tsc --build` 通过 |
| **安全** | ⭐⭐☆☆☆ | **存在 PocketBase Filter 注入漏洞**；Nginx 缺安全头；账单打印有类型断言残留 |
| **架构设计** | ⭐⭐⭐☆☆ | Composable 复用良好，但存在 props 突变、样板文件堆积、工具函数重复定义 |
| **性能** | ⭐⭐⭐☆☆ | 部分视图存在重复计算（`elapsedMinutes` 每帧调用 3-4 次）、不必要的重渲染 |
| **可维护性** | ⭐⭐⭐⭐☆ | 组件拆分合理（CartPanel、CutleryConfigPanel），CHANGELOG 完整 |

### 关键风险（需立即处理）
1. **🔴 高危**: `OrderListView.vue` 和 `StatisticsView.vue` 中 PocketBase Filter 的字符串拼接存在**注入攻击风险**。
2. **🔴 高危**: `CartPanel.vue` 直接 `v-model="item.remark"` 修改 prop 对象的嵌套属性，破坏单向数据流，可能导致不可预期的响应式 bug。
3. **🟡 中危**: `docker-compose.yml` 仍向容器挂载 `pb_migrations`，与项目安全策略（禁用自动迁移）存在冲突。

---

## 二、问题清单（按严重级别）

### 🔴 P0 - 安全与稳定性缺陷

| # | 问题 | 位置 | 影响 | 修复建议 |
|---|------|------|------|----------|
| P0-1 | **Filter 注入漏洞** | `OrderListView.vue:70-87`, `StatisticsView.vue:85-91` | 攻击者可通过搜索框或日期选择器注入 PocketBase filter 语法，绕过权限读取/删除数据 | 对 filter 参数使用 PocketBase 的参数化查询或增加严格的输入白名单/转义 |
| P0-2 | **Props 突变反模式** | `CartPanel.vue:127` | `v-model="item.remark"` 直接修改 `props.cart` 中的对象，Vue 警告且难以追踪状态变化 | 在父组件 `OrderFormView.vue` 中维护 `remark` 状态，通过事件更新 |
| P0-3 | **并发 Confirm 挂起** | `useConfirm.ts:15-21` | 连续弹窗会覆盖 `resolveFn`，前一个 Promise 永远 unresolved | 增加队列机制，或在打开新弹窗前拒绝/关闭旧弹窗 |

### 🟡 P1 - 架构与性能缺陷

| # | 问题 | 位置 | 影响 | 修复建议 |
|---|------|------|------|----------|
| P1-1 | **重复计算未缓存** | `KitchenDisplayView.vue` 模板中多次调用 `elapsedMinutes(order)` | 同一订单在同一渲染周期内计算 3-4 次，浪费 CPU | 将超时状态提取为 `computed` 或 `Map` 缓存 |
| P1-2 | **破坏 Composable 封装** | `OrderListView.vue:95` | 直接修改 `totalPages.value`，未通过 `usePagination` 提供的 `setTotal` | 统一调用 `setTotal(res.totalItems)` |
| P1-3 | **工具函数重复定义** | `SettingsView.vue` 和 `OrderDetailView.vue` 均定义 `getQrUrl` | DRY 原则被破坏，URL 生成逻辑分散 | 提取到 `src/utils/assets.ts` 或 `src/api/pocketbase.ts` |
| P1-4 | **类型断言残留** | `printBill.ts:42`, `printBill.ts:164` | `order.cutlery as CutleryConfig` 绕过类型检查 | 将 `cutlery` 的类型定义与 schema 对齐，移除 `as` |
| P1-5 | **样板文件未清理** | `src/stores/counter.ts`, `src/views/HomeView.vue`, `src/views/AboutView.vue`, `src/components/HelloWorld.vue` 等 | 增加构建体积和认知负担 | 删除未使用的样板文件 |
| P1-6 | **docker-compose 挂载 pb_migrations** | `docker-compose.yml:16` | 与 "禁用 PB JS 迁移" 的安全策略冲突，容器启动时 PocketBase 仍可能读取该目录 | 移除该 volume 挂载，或在文档中明确说明必须为空目录 |

### 🟢 P2 - 代码质量与可维护性建议

| # | 问题 | 位置 | 修复建议 |
|---|------|------|----------|
| P2-1 | `resizeHandler` 为空函数 | `KitchenDisplayView.vue:42-44` | 直接删除，无实际作用 |
| P2-2 | `silentRefresh` 与 `fetchOrders` 大量重复 | `OrderListView.vue:89-125` | 提取统一的 `loadOrders(silent?: boolean)` |
| P2-3 | `useAutoRefresh` 生命周期强耦合 | `useAutoRefresh.ts:34-38` | 移除内部的 `onMounted/onUnmounted`，由调用方决定是否挂载，提高灵活性 |
| P2-4 | Nginx 缺少安全响应头 | `nginx.conf` | 添加 `X-Frame-Options`、`X-Content-Type-Options`、`Referrer-Policy` |
| P2-5 | `MoneyCalculator.toCents` 极端精度 | `security.ts:96` | 注释说明仅适用于人民币场景（分），或考虑引入 `decimal.js` 处理极端 case |
| P2-6 | `Order.items` 必填与 DB schema 不一致 | `pocketbase-types.ts` vs `api/pocketbase.ts` | 手动 `Order` 接口中 `items: OrderItem[]` 应为 `items?: OrderItem[] \| null` 以匹配 DB |
| P2-7 | 健康检查逻辑过宽 | `healthcheck.sh:22` | 404 算 OK 过于宽松，应改为检查 `/api/collections/orders/records?perPage=1` 并期望 200/401 |
| P2-8 | `useGlobalLoading` 无限累加风险 | `useGlobalLoading.ts` | 如果某处 `show()` 后未调用 `hide()`，loading 将永久显示；建议增加 timeout 兜底 |

---

## 三、按模块详细分析

### 3.1 API 层 (`src/api/pocketbase.ts`) — 良好

**优点**:
- `handleResponse<T>` 泛型化，错误处理统一。
- `fetchWithTimeout` 使用 `AbortController`，防止请求挂死。
- `APIError` 自定义错误类携带 `status` 和 `data`，便于上层决策。
- `updateOrderItemStatus` 实现了业务状态自动推断，逻辑清晰。

**缺陷**:
- `getAdminToken()` 直接从 `localStorage` 读取，没有做 token 过期校验（JWT decode）。目前依赖后端 401 后清除，可以接受。
- `DishAPI.getDishesByCategory` 的 filter 没有使用 `encodeURIComponent` 包裹整个 filter 表达式（虽然 `encodeURIComponent(category)` 已经做了部分保护）。
- `SettingsAPI.updateSettingsFiles` 与 `updateSettings` 分离是合理的，但 `PB_URL` 被 `export` 出来供打印模块使用，耦合度略高。

### 3.2 Store 层 — 良好，有小问题

**`auth.store.ts`**:
- `isLoggedIn` 同时要求 `token` 和 `user`，安全性较好。
- 登录失败时返回对象而非抛异常，UI 层处理方便。
- **小问题**: `login` 函数使用硬编码 `/api/collections/users/auth-with-password`，与 `PB_URL` 环境变量不统一。如果生产环境 `VITE_PB_URL` 不是 `/api`，登录会 404。

**`settings.store.ts`**:
- 缓存策略合理（`if (settings.value) return`）。
- `saveSettingsFiles` 新增方法无问题。

### 3.3 Views 层 — 混合

**`OrderListView.vue`**:
- 筛选、搜索、分页、快捷操作、Excel 导出功能齐全。
- `buildFilterString` 存在 **P0-1 注入漏洞**。当前仅转义了单引号：
  ```ts
  const safe = filter.value.tableNo.replace(/'/g, "\\'")
  ```
  但这不足以防御 PocketBase 的 `||`、`&&`、`!=`、`,` 等 filter 操作符注入。
- `totalPages.value = res.totalPages || 1` 直接修改 composable ref（P1-2）。

**`OrderFormView.vue`**:
- 表单状态管理清晰，`CartPanel` 拆分得当。
- `DISH_RULES` 硬编码的配菜规则目前够用，但建议未来迁移到数据库配置。
- `submit()` 中 `Validators.sanitizeString` 用于 `item.name` 是合理的防御性编程。
- **问题**: `editingRemarkId` 通过事件传递给 `CartPanel`，但 `CartPanel` 直接 `v-model="item.remark"` 修改了 prop（P0-2）。

**`OrderDetailView.vue`**:
- 新增了 QR 收款弹窗，体验良好。
- `getQrUrl` 与 `SettingsView.vue` 重复定义（P1-3）。
- 状态操作按钮组布局清晰。

**`KitchenDisplayView.vue`**:
- 按菜品维度控制制作状态，业务价值高。
- **性能问题**: `elapsedMinutes(order)` 在模板中被调用多次（P1-1）。Vue 的渲染优化不会缓存纯函数调用结果。
- `resizeHandler` 为空函数，应删除（P2-1）。
- `playAlertSound` 中 `AudioContext` 的创建和关闭逻辑正确。

**`StatisticsView.vue`**:
- ECharts 图表初始化、更新、销毁、resize 处理完整。
- `toUTCDateTime` 构建 filter 使用双引号：
  ```ts
  filters.push(`created >= "${toUTCDateTime(startDate.value, '00:00:00')}"`)
  ```
  这虽然避免了单引号冲突，但仍然属于字符串拼接构建查询条件，存在注入风险（P0-1 的另一种形式）。
- `getDateRange()` 的 `for` 循环会修改 `start` 对象，目前无副作用但写法不够纯粹。

### 3.4 组件层 — 良好

**`CartPanel.vue`**:
- 布局紧凑，信息密度高。
- **严重问题**: `v-model="item.remark"` 修改 prop（P0-2）。

**`DialogModal.vue`**:
- `Escape` 键支持、点击遮罩关闭、Teleport 到 body 都正确。
- 未阻止背景滚动，建议增加 `overscroll-behavior: contain` 或 `body overflow-hidden`。

**`ToastContainer.vue`**:
- `top-center` 定位合理，TransitionGroup 动画流畅。

**`ErrorBoundary.vue`**:
- `onErrorCaptured` 返回 `false` 阻止冒泡正确。
- 建议增加错误上报（如发送到 Sentry 或服务器日志接口）。

### 3.5 工具函数 — 良好

**`security.ts`**:
- `MoneyCalculator` 使用整数分计算，避免了浮点精度问题。
- `escapeHtml` 使用 `textContent` 再取 `innerHTML` 是巧妙的 DOM 级转义。
- `setSafeHtml` 的清理正则 `on\w+\s*=` 和 `javascript:` 基本够用，但不是完美的 XSS 过滤（例如 `<img src=x onerror=alert(1)>` 中的 `onerror` 会被过滤，但 `data:text/html,<script>` 等场景未覆盖）。由于只用于打印的受控 HTML，风险较低。

**`orderStatus.ts`**:
- 状态流转图 `StatusFlow` 清晰，`canTransition` 校验合理。

### 3.6 基础设施 — 良好，有配置隐患

**`deploy.sh`**:
- 构建 → 备份 → 部署 → 健康检查 → 自动回滚流程完整。
- 正确跳过 `pb_migrations` 自动部署。
- `cp -r` 备份大 `dist` 目录时如果 assets 很多可能耗时，但目前项目规模小，没问题。

**`docker-compose.yml`**:
- `pb_migrations` volume 挂载与禁用迁移策略矛盾（P1-6）。
- `pocketbase` 服务使用 `latest` tag 存在**镜像漂移风险**，建议锁定到具体版本（如 `0.25.0`）。

**`nginx.conf`**:
- SPA `try_files` 正确。
- gzip 配置合理。
- 缺少安全头（P2-4）。

---

## 四、修复优先级与行动计划

### 本周内必须完成（P0 + P1）

1. **修复 Filter 注入漏洞**
   - `OrderListView.vue` 的 `buildFilterString` 应使用 PocketBase 的 filter 参数化能力（如果支持）或对输入做白名单校验。
   - 最低要求：禁止输入 `'`、`"`、`\`、`||`、`&&`、`~`、`=`、`(`、`)` 等字符；对 `tableNo` 只做纯数字/字母匹配。

2. **修复 Props 突变**
   - `CartPanel.vue` 中备注输入改为只读显示，通过 `emit('updateRemark', dishId, newRemark)` 让父组件更新 `cart`。

3. **修复 Confirm 并发问题**
   - 在 `useConfirm.ts` 中，如果 `open.value === true` 时再次调用 `confirm`，先 `resolveFn?.(false)` 关闭旧弹窗。

4. **清理未使用样板文件**
   - 删除 `counter.ts`, `HomeView.vue`, `AboutView.vue`, `HelloWorld.vue`, `TheWelcome.vue`, `WelcomeItem.vue`, `Icon*.vue`。

5. **提取 `getQrUrl` 工具函数**
   - 新建 `src/utils/assets.ts`：
     ```ts
     export function getFileUrl(collection: string, recordId: string, filename: string) {
       return `${PB_URL}/files/${collection}/${recordId}/${filename}`
     }
     ```

6. **优化 `KitchenDisplayView` 性能**
   - 将 `elapsedMinutes` 改为基于 `computed` 或 `Map` 的缓存。

### 下两周完成（P2）

7. 移除 `docker-compose.yml` 的 `pb_migrations` 挂载，并锁定 PocketBase 镜像版本。
8. 在 `nginx.conf` 中添加安全响应头。
9. 统一 `usePagination` 的调用方式，停止直接修改 `totalPages.value`。
10. 清理 `printBill.ts` 中的 `as CutleryConfig` 类型断言。
11. 优化 `useAutoRefresh` 生命周期耦合设计。

---

## 五、正向实践清单（继续保持）

- ✅ **零 `any` 断言**：全代码库已清除 `as any`，类型严格。
- ✅ **Pre-commit 强制检查**：`husky` + `lint-staged` + `vue-tsc --noEmit` 有效拦截劣质代码。
- ✅ **语义化版本与 CHANGELOG**：版本管理规范，发布可追溯。
- ✅ **部署安全回滚**：`deploy.sh` 的自动备份和回滚机制降低了发布风险。
- ✅ **组件拆分合理**：`CartPanel`、`CutleryConfigPanel` 等组件边界清晰。
- ✅ **金额计算安全**：`MoneyCalculator` 整数分计算避免了经典的 JavaScript 浮点精度 bug。
- ✅ **PocketBase JS 迁移管控**：从 502 事故中吸取了教训，已将其纳入 `.gitignore` 并禁用自动部署。

---

## 六、附录：快速检查命令

```bash
# 类型检查
npm run type-check

# 单元测试
npm run test:unit -- --run

# 安全扫描（手动）
grep -rn "replace(/'/g" src/views/          # 检查 filter 转义
grep -rn "v-model=\"item\." src/components/ # 检查 prop 突变
```

---

**报告人**: Kimi Code CLI  
**下次建议审核时间**: 新增 3 个以上视图或接入支付 API 后
