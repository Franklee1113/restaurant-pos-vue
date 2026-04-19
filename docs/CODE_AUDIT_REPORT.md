# 智能点菜系统 - 代码审核报告

> **审核日期**: 2026-04-19  
> **审核范围**: `src/` 全部源码 + `pb_hooks/orders.pb.js`  
> **审核维度**: 安全性、业务逻辑正确性、性能、类型安全、代码质量、错误处理  
> **审核人**: Kimi (AI Code Review)  
> **状态**: 待修复

---

## 审核概览

| 严重程度 | 数量 | 说明 |
|---------|------|------|
| 🔴 **P0** | 6 | 安全漏洞、业务逻辑错误、数据截断 |
| 🟡 **P1** | 29 | 类型不安全、竞态条件、重复代码、精度问题 |
| 🟢 **P2** | ~20 | 命名规范、性能优化、代码可读性 |

**修复状态**: 6 个 P0 已全部修复（2026-04-19）

---

## 🔴 P0 严重问题（已修复）

> ✅ **修复日期**: 2026-04-19
> **涉及文件**: `pocketbase.ts`, `security.ts`, `orders.pb.js`, `StatisticsView.vue`

### P0-1 `escapePbString` 转义不充分，存在 Filter 注入风险

| 项目 | 内容 |
|------|------|
| **文件** | `src/api/pocketbase.ts:91` |
| **问题** | 仅转义单引号 `'`，但 PocketBase Filter DSL 还支持 `~` `@` `#` `&&` `||` 等操作符，恶意输入可破坏查询逻辑 |
| **修复建议** | 增加白名单校验，或改用参数化查询 |

```typescript
// 当前代码（有问题的）
export function escapePbString(value: string): string {
  return value.replace(/'/g, "''")
}
```

---

### P0-2 `sessionExpired` 模块级状态导致竞态条件

| 项目 | 内容 |
|------|------|
| **文件** | `src/api/pocketbase.ts:46-72` |
| **问题** | `sessionExpired` 是模块级单例。并行 401 请求时，第一个触发跳转后，后续请求不会清理 token，导致错误信息不一致 |
| **修复建议** | 移除模块级锁，401 时统一清理认证状态并通过 Vue Router 导航 |

---

### P0-3 `setSafeHtml` 正则可被绕过，允许事件处理器注入

| 项目 | 内容 |
|------|------|
| **文件** | `src/utils/security.ts:29-40` |
| **问题** | `<div onclick="alert(1)">` 会被允许通过（标签名在白名单内），正则不校验属性，存在 XSS 风险 |
| **修复建议** | 废弃正则白名单方案，改为纯文本输出或引入 DOMPurify |

---

### P0-4 折扣值 `0` 被逻辑或运算符吞掉，无法取消折扣

| 项目 | 内容 |
|------|------|
| **文件** | `pb_hooks/orders.pb.js:212` |
| **问题** | `record.get('discountValue') || original.get('discountValue') || 0` 中，`0 || oldValue` 会回退到旧值，前端无法将折扣设为 0 |
| **修复建议** | 使用 `!== undefined` 判断 |

```javascript
// 当前代码（有问题的）
const discountValue = record.get('discountValue') || original.get('discountValue') || 0

// 修复后
const discountValue = record.get('discountValue') !== undefined 
  ? record.get('discountValue') 
  : (original.get('discountValue') || 0)
```

---

### P0-5 `cutlery.totalPrice` 直接信任前端输入，金额可被篡改

| 项目 | 内容 |
|------|------|
| **文件** | `pb_hooks/orders.pb.js:54-56, 220-222` |
| **问题** | `cutlery.totalPrice` 未经服务端重算直接计入总额。攻击者可构造 `cutlery: { totalPrice: 99999 }` |
| **修复建议** | 服务端根据 `quantity × unitPrice` 重新计算 `cutlery.totalPrice` |

---

### P0-6 统计页硬编码 500 条上限，核心经营指标可能失真

| 项目 | 内容 |
|------|------|
| **文件** | `src/views/StatisticsView.vue:99` |
| **问题** | `getOrders(1, 500)` 静默截断超出数据，"最近一年"可能只统计了前 500 单 |
| **修复建议** | 分页拉取全部数据，或迁移为后端聚合接口 |

---

## 🟡 P1 重要问题（建议修复）

### 安全性 & 类型安全

| # | 文件 | 位置 | 问题 | 修复建议 |
|---|------|------|------|---------|
| P1-1 | `pocketbase.ts` | 77-79 | `null as T` 欺骗类型系统，下游可能访问 null 属性 | 返回类型改为 `Promise<T \| null>` |
| P1-2 | `pocketbase.ts` | 119-143 | `Order.status: string` 过于宽泛，无法检查非法状态 | 改为联合类型 `'pending' \| 'cooking' \| 'serving' \| 'completed' \| 'settled' \| 'cancelled'` |
| P1-3 | `pocketbase.ts` | 204+ | `createOrder(orderData: Partial<Order>)` 允许传入服务端生成字段 | 定义专用 DTO `CreateOrderPayload` |
| P1-4 | `pocketbase.ts` | 260/420 | `appendOrderItems` 在 OrderAPI 和 PublicOrderAPI 中完全重复 | 提取为公共纯函数 |
| P1-5 | `pocketbase.ts` | 37-43 | 非 AbortError 网络错误未被统一包装为 APIError | 所有 catch 都包装为 APIError |
| P1-6 | `pocketbase.ts` | 48-82 | 403 Forbidden 完全未处理 | 增加 403 分支，提示权限不足 |
| P1-7 | `pocketbase.ts` | 287-300 | DELETE 请求未处理 204 No Content，可能抛异常 | 兼容空响应体 |
| P1-8 | `pocketbase.ts` | 84-86 | Token 无过期校验 | 增加 JWT `exp` 客户端校验 |
| P1-9 | `pocketbase.ts` | 多处 | Token 获取与请求头构造大量重复 | 封装 `privateRequest<T>()` 辅助函数 |
| P1-10 | `pocketbase.ts` | 304-328 | 认证策略不一致（部分接口允许匿名） | 统一公共接口与受保护接口策略 |

### 业务逻辑

| # | 文件 | 位置 | 问题 | 修复建议 |
|---|------|------|------|---------|
| P1-11 | `OrderDetailView.vue` | 153-162 | 清台③检查基于 `order.value.status`，与 OrderListView 的 `ts.currentOrderId` 逻辑不一致 | 统一清台校验逻辑 |
| P1-12 | `OrderDetailView.vue` | 173-176 | 清台成功后未调用 `loadOrder()` 刷新数据 | 清台后刷新订单详情 |
| P1-13 | `OrderDetailView.vue` | 436-442 | SERVING 状态显示「取消订单」按钮，但 StatusFlow 不允许 serving→cancelled | 按钮显示逻辑复用 `StatusFlow` |
| P1-14 | `OrderDetailView.vue` | 122-182 | `clearTable` 在确认弹窗前未设置 `processing=true`，可并发触发 | 弹窗前立即加锁 |
| P1-15 | `OrderDetailView.vue` | 20, 36-38 | 组件复用时（route params 变化）订单数据不会自动刷新 | 增加 `watch(orderId, loadOrder)` |
| P1-16 | `CustomerOrderView.vue` | 549, 751 | 追加订单时底部栏与弹窗总金额不一致（餐具费重复计算） | 统一金额计算逻辑 |
| P1-17 | `OrderFormView.vue` | 230-236 | 编辑时 schema 验证 payload 中 item status 被重置为 pending | 验证数据与实际提交数据保持一致 |
| P1-18 | `OrderListView.vue` | 65-77 | `stats` 中 `toDateString()` 涉及时区偏差 | 使用 `toISOString().slice(0,10)` |
| P1-19 | `OrderListView.vue` | 145-147 | `silentRefresh` 完全静默失败，网络异常无感知 | 至少输出 `console.warn` |
| P1-20 | `OrderListView.vue` | 250-308 | `clearTable` 函数与 OrderDetailView 完全重复 | 提取为共享 composable |

### 后端 Hook 业务逻辑

| # | 文件 | 位置 | 问题 | 修复建议 |
|---|------|------|------|---------|
| P1-21 | `orders.pb.js` | 216-218 | `quantity` 先 `round×10` 再计算，导致精度偏差 | 直接计算 `price × 100 × quantity` |
| P1-22 | `orders.pb.js` | 185 | 空订单时金额字段不更新（`if (newItems.length > 0)` 跳过） | 始终执行金额重算 |
| P1-23 | `orders.pb.js` | 302-303 | `afterCreate` 直接覆盖 `currentOrderId`，未校验桌台是否已被占用 | 若已有未完成订单则拒绝创建 |
| P1-24 | `orders.pb.js` | 156-177 | `table_status` 存在并发竞态条件（check-then-act） | 利用唯一索引捕获冲突并转为更新 |
| P1-25 | `orders.pb.js` | 179-181 | 重新开台失败被静默吞掉 | 让异常上浮或回滚订单状态 |
| P1-26 | `orders.pb.js` | 122-125 | `itemsAppended` 仅通过长度判断，无法检测数量变化 | 逐条比较 id+quantity |
| P1-27 | `orders.pb.js` | 139 | 已结束订单拦截条件漏了 `serving` | 补充 `serving` 拦截 |

### 精度问题

| # | 文件 | 位置 | 问题 | 修复建议 |
|---|------|------|------|---------|
| P1-28 | `security.ts` | 108-110 | `toYuan` 返回浮点数，二次运算累积误差 | 返回字符串 `toFixed(2)` |
| P1-29 | `printBill.ts` | 63-65 | 直接使用浮点减法计算 `dishesTotal` | 使用 `MoneyCalculator.toCents/toYuan` |
| P1-30 | `printBill.ts` | 91-92 | 打印模板写死 `80mm`，未适配 58mm 热敏纸 | 增加 58mm 适配分支 |

---

## 🟢 P2 建议优化（已完成 2026-04-19）

| # | 文件 | 问题 | 修复建议 | 状态 |
|---|------|------|---------|------|
| P2-1 | 多处 | 魔法字符串泛滥（`'pb_token'`、`'orders'`、状态字符串等） | 提取为常量枚举 | ✅ 已实施 |
| P2-2 | `orders.pb.js` | `console.log` 输出错误信息 | 统一改为 `console.error` | ✅ 已实施 |
| P2-3 | `orders.pb.js` | JSON 解析代码重复 6 次 | 提取 `parseJSONField()` 工具函数 | ✅ 已实施 |
| P2-4 | `OrderListView.vue` / `OrderDetailView.vue` | `statusBadgeClass` 重复定义 | 提取到 `orderStatus.ts` | ✅ 已实施 |
| P2-5 | `OrderFormView.vue` / `CustomerOrderView.vue` | `DISH_RULES` / `hotDishes` 重复硬编码 | 提取到共享配置 | ✅ 已实施 |
| P2-6 | `OrderFormView.vue` | `filteredDishes` 每次访问都全量排序 | 缓存排序结果 | ✅ 已实施 |
| P2-7 | `KitchenDisplayView.vue` | `onUnmounted` 为空，依赖内部清理 | 显式调用 `stop()` | ✅ 已实施 |
| P2-8 | `StatisticsView.vue` | `nextTick(updateCharts)` 存在竞态 | 增加卸载状态检查 | ✅ 已实施 |
| P2-9 | `OrderListView.vue` | `useAutoRefresh` 页面失焦时仍继续轮询 | 监听 `document.visibilitychange` | ✅ 已实施 |
| P2-10 | `CustomerOrderView.vue` | `setTimeout` 未保存引用清理 | 保存 timer 并在 `onUnmounted` 清除 | ✅ 已实施 |
| P2-B | `KitchenDisplayView.vue` | 10s 轮询服务器压力大 | 改为 PocketBase SSE Realtime（降级回轮询） | ✅ 已实施 |
| P2-C | `src/api/pocketbase.ts` | 菜品/设置重复请求 | 增加 MemoryCache TTL 缓存（60s/30s） | ✅ 已实施 |

---

## 修复计划建议

### 第一批：P0 + 关键 P1（安全 + 金额正确性）
**预计时间**: 2-3 小时  
**涉及文件**: `pocketbase.ts`, `security.ts`, `orders.pb.js`, `StatisticsView.vue`

### 第二批：业务逻辑一致性（清台、状态按钮、组件刷新）
**预计时间**: 1-2 小时  
**涉及文件**: `OrderListView.vue`, `OrderDetailView.vue`, `OrderFormView.vue`, `CustomerOrderView.vue`

### 第三批：P2 优化（代码质量、常量提取）
**预计时间**: 1 小时  
**涉及文件**: `orderStatus.ts`, `useCart.ts`, `orders.pb.js`

---

## 审核记录

| 日期 | 事件 |
|------|------|
| 2026-04-19 | 完成全面代码审核，生成本报告 |
| 2026-04-19 | **第一批修复完成** — 6 个 P0 全部修复，126 个单元测试全部通过 |
| 待填写 | 第二批修复完成（P1 业务逻辑一致性） |
| 待填写 | 第三批修复完成（P2 代码质量优化） |
| 待填写 | 复测验证通过 |
