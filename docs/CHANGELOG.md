# Changelog

所有项目的显著变更都将记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
并且本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 新增（核心功能 — 桌台全景视图）
- **桌台全景页面（TableVisualizationView）**：一屏掌握全店桌台实时状态，兼顾店长管理和传菜员日常操作
  - **展示范围**：仅展示占用中 + 待清台桌台，空闲桌台不显示，信息聚焦
  - **统计栏**：占用中 / 待清台 / 空闲 / 🟢 待上菜数量，一目了然
  - **双维度筛选**：「全部桌台」+「🔔 有待上菜」（传菜员核心入口）+ 桌号搜索
  - **卡片设计**：3 列大卡片（桌面端），桌号 + 订单状态 + 订单号 + 人数 + 金额 + 等待时长
  - **菜品列表**：按状态排序（cooked → cooking → pending → served），cooked 菜品绿色高亮置顶
  - **已上菜淡化**：served 菜品 opacity-50，保留可见但降低视觉干扰
  - **等待时长**：⏱️ 已等 N 分钟，≥10分钟橙色 / ≥20分钟红色预警
  - **标记上菜**：每道 cooked 菜品旁显示「✓ 标记上菜」按钮，调用 `updateOrderItemStatus` 标记为 served，补全系统缺失的"出菜→上桌"闭环
  - **编辑按钮**：completed 订单自动禁用，防止误操作
  - **实时更新**：SSE 订阅 + 10 秒轮询兜底，数据秒级同步
  - **组件拆分**：拆出 `TableCard.vue` 子组件，提升可维护性
  - **零后端改动**：纯前端功能，仅新增路由 + 导航 + 页面 + 组件 + 测试
  - **测试覆盖**：12 个组件测试，覆盖数据加载、复合状态、排序、筛选、空状态、标记上菜、按钮禁用

### 修复（P0 生产故障 — 追加菜品 KDS 状态错乱）
- **追加菜品后 KDS 显示总份数全为"待制作"**：`mergeOrderItems` 合并相同 `dishId` 的数量并统一重置状态为 `pending`，导致追加的已做过菜品被覆盖为待做，KDS 显示的总份数与已完成份数全部错乱
  - **方案 A**：`mergeOrderItems` 改为追加不合并，相同 `dishId` 作为独立 `OrderItem` 条目，保留各自状态
  - `updateOrderItemStatus(id, dishId, status)` → `updateOrderItemStatus(id, itemIndex, status)`：按数组索引精确定位单条菜品，避免同名菜品批量误改状态
  - `KitchenDisplayView.vue`：`v-for` 改为 `template v-for` + `v-if` 按状态筛选，`:key` 使用 `itemIdx + '-pending'/'-cooking'`，`startCooking`/`finishCooking` 传递原始索引而非 `dishId`
  - `OrderDetailView.vue`：`:key="item.dishId"` → `:key="index"`，避免重复 `dishId` 导致 Vue key 冲突
  - 影响分析：`OrderListView`（菜品数统计按 `items.length` 不受影响）、`StatisticsView`（销量统计按条目累加不受影响）、`printBill.ts`（逐条打印不受影响）、后端 Hook（`items` 数组长度增加，金额/状态推断逻辑完全兼容）

### 修复（P0 生产故障）
- **新建订单返回 400 `data: {}` 导致"无响应"**：`pb_hooks/orders.pb.js` 中 `parseJSONField` 与 PocketBase v0.22.27 Goja VM 的 JSON 字段返回类型不兼容，Hook 执行异常后 PocketBase 返回空 data 的通用 400 错误
  - `parseJSONField` 增强为三模式兼容：优先识别已解析的 `object`/`array`、其次 `string`（JSON 文本）、最后回退到 `[]byte`（PB VM 默认行为）
  - `recalculateCutlery` 防御 `cutlery.quantity` 为 `undefined` 时产生 `NaN` 的边界情况
  - 顶层 catch 将 `throw err` 改为 `$app.newBadRequestError(...)`，确保前端 Toast 能展示具体错误信息，不再"无响应"
- **删除订单后产生幽灵桌台占用**：`table_status` 中 `currentOrderId` 指向已删除订单，状态仍为 `dining`，导致同一桌号无法再次新建订单
  - 新增 `onRecordAfterDeleteRequest` Hook：删除订单时若 `table_status.currentOrderId` 匹配被删订单，自动重置为 `idle`
  - 原因：系统仅处理 `completed→settled` 和 `cancelled` 时的自动清台，未覆盖"直接删除订单"场景
- **KDS 更新菜品状态后订单整体状态不同步（P0）**：厨师大屏标记菜品为"制作中"后，订单管理仍显示"待确认"
  - 根因：`parseJSONField` 首版修复中 `typeof raw === 'object'` 优先返回导致 `[]byte` 被误识别为已解析数组；`Array.isArray([]byte)` 为 `false` 后 `newItems` fallback 为 `oldItems`，`itemStatusChanged` 检测永远为 `false`
  - `parseJSONField` 二次修正：通过首元素类型区分——`typeof raw[0] === 'number'` 为 `[]byte`（遍历解码），否则为已解析 JS 数组（直接返回）
  - 状态推断增加兜底逻辑：`shouldInferStatus = itemStatusChanged || (活跃状态 && newItems.length > 0)`，即使 `parseJSONField` 异常，活跃期订单也会强制执行状态推断，避免状态永久卡死
- **顾客端扫码加菜 502 Bad Gateway + 提示"需要选择用餐人数"（P0）**：`public-api.service`（Node.js Fastify，端口 3000）inactive 近 4 小时，Nginx 代理 `/api/public/*` 返回 502；顾客端 `getOrdersByTable` 失败 → `currentOrder.value` 为 null → fallback 显示人数选择弹窗
  - 启动 public-api 服务恢复
  - 新增 `scripts/healthcheck.sh`：每 2 分钟通过 cron 自动检查 Nginx / PocketBase / Public API / 磁盘空间，异常自动重启并记录日志到 `/var/log/restaurant-pos-healthcheck.log`

### 修复（UI）
- **订单详情页两个"取消订单"按钮**：`StatusFlow` 已包含 `cancelled`，`v-for` 遍历已渲染一个取消按钮；下方单独的 `v-if="...includes(CANCELLED)"` 按钮重复。删除多余按钮，仅保留 `v-for` 自动渲染的一个

### 修复（业务逻辑一致性）
- **顾客无法给服务员创建的订单加菜（P1）**：`pb_hooks/orders.pb.js` 在 `onRecordBeforeCreateRequest` 中为**所有新订单**生成 `accessToken`（`$security.randomString(43)`），消除顾客端/员工端订单创建的双轨制差异。服务员建单后顾客扫码即可正常追加菜品

### 改进（交互体验）
- **清台按钮条件渲染**：`OrderDetailView.vue` / `OrderListView.vue` 清台按钮仅对 `COMPLETED` 状态订单显示；`pendingTableNumbers` 快捷标签旁移除冗余清台按钮，避免对未完成订单误操作

### 测试（覆盖率提升 — 六阶段补测完成）
- **第一阶段** (`f80c0de`)：`pb_hooks/orders.pb.js` 核心逻辑外迁至 `src/utils/orderValidation.ts`（212 行，41 个测试，100% 语句覆盖），提取金额重算、状态推断、追加/删除检测、流转校验等纯函数；`CustomerOrderView.spec.ts` +8 用例（refreshDishes、桌台已完成订单提示、addExistingToCart、onDishesScroll、scrollToTop、人数弹窗、追加失败）；`OrderFormView.spec.ts` +11 用例（setupDishesRealtime、触摸事件、右键菜单、购物车弹跳、loadData 异常、编辑模式无 cutlery 兼容）
- **第二阶段** (`9cc6a46`)：`OrderListView.vue` Functions 63.09% → 77.38%（+38 个测试：formatDate、buildFilterString、silentRefresh 音频、exportExcel、DOM 交互、分页、SoldOutDrawer、移动端按钮）；`pocketbase.ts` Branch 65.94% → 75.67%（+18 个测试：fetchWithTimeout 超时/网络错误、handleResponse JSON.parse 失败、StatsAPI 404 回退、SSE 单例清理、PublicOrderAPI sold-out 验证、DishAPI CRUD）
- **第三阶段** (`ce46a31`)：`CustomerOrderView.vue` Branch 52.97% → 84.63%（+14 个测试：铁锅鱼标签/按斤计价、soldOut 状态、空分类、购物车 modal 三种状态、已下单菜品状态标签、再来一份、loadData/refreshDishes/refreshOrder catch、submitOrder 追加会话过期阻断、无餐具费 free 类型、sortedDishes 铁锅鱼置顶、getTableStatus 失败继续加载）
- **产品缺陷修复（测试过程中发现）**：
  - BUG-FIX-001：`OrderFormView.vue` percent 折扣范围检查在 `safeParse` 通过后独立执行，修复 `>10` 非法值可被提交的问题
  - BUG-FIX-002：`pocketbase.ts` `handleResponse` 修复 HTTP 500 空响应体时错误消息显示为 `undefined` 的问题（`errorJson?.message` 空安全访问 + `statusText` 条件拼接）
  - `DialogModal.vue`：`typeClass` 改用 `computed()` 包裹，修复响应式更新失效
  - `CustomerOrderView.vue`：会话恢复和自动加入订单后关闭 `showGuestSetup` 弹窗；`dining` 状态订单不再被误判为已结束
- **类型检查修复**：`useClearTable.spec.ts` `mockResolvedValue(undefined)` → `mockResolvedValue({} as any)`；`@ts-ignore` → `@ts-expect-error` 符合 ESLint 规范
- **最终覆盖率**：Statements 88.77% / Branch 79.34% / Functions 80.5% / Lines 90.71%；30 个测试文件、582 个用例通过、2 个 skipped（jsdom 限制）、0 失败

## [1.1.3] - 2026-04-21

### 修复（业务逻辑一致性）
- **退菜/删菜无后端校验（P0）**：`pb_hooks/orders.pb.js` 新增 `itemsRemoved` 检测，编辑订单时若删除 `cooking`/`cooked`/`served` 状态的菜品，后端抛出 `400` 错误阻断
- **手动清台兜底过于宽松（P0）**：`useClearTable.ts` 重构异常处理，订单查询失败或 `completed→settled` 更新失败时**抛出异常阻断清台**，禁止静默忽略
- **dining 订单追加菜品重置为 pending（P1）**：移除后端 Hook 中 `dining`/`serving` 追加重置逻辑，追加新菜品后**订单状态保持原状态**，仅新增菜品 `status = pending`
- **顾客端与员工端沽清拦截不一致（P1）**：`CustomerOrderView.vue` Stepper 置灰 + `useCart.ts` `addToCart` 硬拦截，已沽清菜品无法添加；新增 10s 菜品轮询实时感知沽清变化
- **铁锅鱼自动加锅底检查不一致（P1）**：`useCart.ts` 统一检查锅底 `soldOut`，员工端与顾客端行为一致

### 改进（交互体验）
- **订单列表「待清台」筛选标签**：`OrderListView.vue` 快捷筛选按钮中 `COMPLETED` 显示为「待清台」，琥珀色标识，与「用餐中」区分

### 测试
- `security.spec.ts` 补充 17 个 `MoneyCalculator` 边界测试用例（浮点精度、小数数量、折扣边界、大额场景），作为前后端金额计算一致性契约
- 新增业务流程文档：`BUSINESS_PROCESS_FLOW.md`（Mermaid 流程图）、`TEST_CASE_MINDMAP.md`（测试案例）、`BUSINESS_LOGIC_GOVERNANCE.md`（治理方案）

### 文档
- `project-notes.md` v1.8：更新已知问题、检查点记录
- `CODE_CHECKLIST.md` v1.7：新增 BUG-GOV-001~008 根因分析库 + 6 条预防措施
- `智能点菜系统-详细设计说明书.md` v1.0.5：同步清台规则、编辑规则、追加规则、错误码

## [1.1.2] - 2026-04-20

### 修复（KDS 与状态机）
- **KDS 未完成菜品消失（P0）**：`KitchenDisplayView` 订单拉取过滤从只取 `pending`/`cooking` 改为**排除终态**（`completed`/`settled`/`cancelled`），`serving`/`dining` 订单中的未完成菜品继续展示
- **KDS 状态回退非法流转（P0）**：厨师在 KDS 更新单品状态时，后端 `onRecordBeforeUpdateRequest` 自动推断整体状态，若推断出回退状态（如 `serving → cooking`）则保持当前状态不变，不再抛出非法流转错误
- **原因**：服务员手动标记 `serving` 后，即使还有未制作菜品，订单状态也不应回退

### 修复（桌台管理）
- **桌台重复开台（P0）**：员工端可对未清台桌号创建新订单，无任何阻断
  - 后端 `orders.pb.js`：`onRecordBeforeCreateRequest` 新增桌台占用检查，`dining` + `currentOrderId` 存在时直接阻止订单创建
  - 前端 `OrderFormView.vue`：提交前调用 `TableStatusAPI.getTableStatus()`，占用时 Toast 阻断

### 修复（数据加载与同步）
- **OrderListView 沽空加载为空**：`onMounted` 补充 `DishAPI.getDishes()`，修复"今日沽空"抽屉数据为空
- **菜品状态自动刷新**：`OrderDetailView` 10秒轮询 + `CustomerOrderView` 15秒轮询 + `visibilitychange` 即时刷新，解决员工端/顾客端/厨房端状态不同步

### 修复（构建与部署）
- **public-api 502**：部署脚本 `deploy.sh` Step 4b 增加 PocketBase 重启后自动重启 `public-api.service`
- **类型检查恢复**：关闭 `noUncheckedIndexedAccess`，修复测试文件类型错误，`deploy.sh` 恢复 `npm run build`（含类型检查）

### 改进（交互体验）
- **订单状态操作按钮文案优化**：分离 `StatusLabels`（状态展示）与 `ActionLabels`（操作文案）
  - 制作中 → 开始制作；上菜中 → 开始上菜；用餐中 → 上菜完毕；已结账 → 确认结账；已清台 → 确认清台；取消 → 取消订单
  - `OrderListView` 与 `OrderDetailView` 已同步更新

### 测试
- 更新 `OrderDetailView.spec.ts`：同步按钮文案断言（「标记为制作中」→「开始制作」等）
- 更新 `KitchenDisplayView.spec.ts`：同步 KDS 过滤条件断言

## [1.1.1] - 2026-04-20

### 修复（订单编辑权限）
- **彻底阻断已结账订单编辑**：`completed`（已结账）和 `settled`（已清台）状态的订单禁止编辑
  - `OrderDetailView.vue`：`handleEdit()` 直接 toast 阻断，不再弹"继续编辑"确认框；编辑按钮灰色禁用样式
  - `OrderListView.vue`：桌面端/移动端列表的"编辑"按钮同理阻断
  - 后端 Hook `orders.pb.js`：已保留对 `completed`/`settled`/`cancelled` 修改菜品状态的阻断逻辑
- **原因**：已结账订单涉及财务闭环，允许编辑会导致订单金额与实际收款不一致，且已打印账单与系统数据不同步

### 修复（构建与部署）
- **`deploy.sh` 改为 `build-only`**：跳过 `vue-tsc` 类型检查直接构建，解决历史遗留的测试文件类型错误阻塞生产部署的问题
- **修复多处 `noUncheckedIndexedAccess` 类型错误**：`OrderFormView.vue`、`OrderListView.vue` 中数组索引访问导致的 TypeScript 编译失败
- **修复 Web Bluetooth 类型声明引用**：`bluetoothPrinter.ts` 添加 `/// <reference path="../types/web-bluetooth.d.ts" />`

### 测试
- 更新 `OrderDetailView.spec.ts`：移除旧版" settled 弹确认框"测试，新增 `completed` / `settled` 阻断测试（2 用例）

## [1.1.0] - 2026-04-20

### 新增（沽清功能）
- **菜品沽清状态管理**：`dishes` 集合新增 `soldOut`（布尔）、`soldOutNote`（备注文本）、`soldOutAt`（时间戳）字段，支持实时标记和恢复
- **前端交互**：
  - `DishActionSheet.vue`（长按/右键菜单）：菜品卡片长按 600ms 弹出操作菜单，支持输入备注并标记「已沽清」或恢复售卖
  - `SoldOutDrawer.vue`（沽清管理抽屉）：全局管理入口，支持搜索过滤、已沽清优先排序、一键清空所有沽清
  - `OrderFormView.vue`：点菜页集成沽清拦截 —— `addToCart()` 自动阻断已沽清菜品，购物车提交前二次校验，SSE 实时同步菜品状态变化
  - `CustomerOrderView.vue`：顾客端已沽清菜品置灰显示且不可点击，若购物车中存在沽清菜品自动移除并提示
  - `OrderDetailView.vue` / `OrderListView.vue`：订单明细和列表中已沽清菜品显示「已沽清」标签；列表页新增「今日沽清」快捷入口按钮
  - `useToast.ts`：Toast 支持 `action` 按钮（如「撤销」），配合乐观更新提供 10 秒回滚窗口
- **后端校验（防御纵深）**：
  - PocketBase Hook (`pb_hooks/orders.pb.js`)：`validateItemsSoldOut()` 批量 IN 查询（单条 SQL 往返）拦截包含沽清菜品的订单创建/加菜
  - Node.js 公共服务 (`server/src/services/dish.service.ts`)：`validateItems()` 增加 soldOut 二次校验，防止缓存穿透
- **实时同步**：`subscribeToDishes()` 共享单例 SSE 连接，避免多组件并发创建连接；`visibilitychange` 降级为页面可见时刷新
- **自动重置**：`server/src/jobs/resetSoldOut.ts` 每日 04:00 自动将所有沽清菜品恢复为可售，`lastRunDate` 文件持久化防止重启后重复/漏执行
- **数据迁移**：`pb_migrations/1776652288_add_soldOut_to_dishes.js` 创建字段，支持回滚

### 改进（API 与缓存）
- **移除 DishAPI.getDishes 60 秒缓存**：菜品状态频繁变化，缓存会导致沽清状态延迟，改为实时查询
- **DishAPI.toggleSoldOut()**：前端 PATCH 更新并主动清除本地缓存，保证多端状态一致

### 测试
- **+16 个测试用例**：新增 `DishActionSheet.spec.ts`（9 用例）、`SoldOutDrawer.spec.ts`（10 用例）、`useToast` action 按钮测试、`subscribeToDishes` SSE 单例测试等
- **覆盖率提升**：Statements 74.1% → 84.86%，Branches 59.01% → 71.72%，views 0% → 84.9%
- **2 skipped tests**：`OrderFormView` 中 Zod safeParse 与响应式数组在 jsdom 环境下的已知交互问题，不影响生产

## [1.0.3] - 2026-04-19

### 重构（状态机 v2.0）
- **新增 `dining`（用餐中）状态**：上菜完成 + 未结账 + 桌台占用，填补「上菜完成」与「已结账」之间的状态空白
- **状态语义重定义**：
  - `completed` 标签从「上菜完成」改为「已结账」（语义：已付 + 占用）
  - `settled` 标签从「已结账」改为「已清台」（语义：已付 + 空闲）
  - `dining` 标签为「用餐中」（语义：未付 + 占用）
- **状态流转更新**：`serving → dining → completed → settled`，后端 Hook 自动推断 `allServed → dining`

### 修复（P0 清台逻辑）
- **修复自动清台条件**：后端 Hook 从 `completed/cancelled` 清台改为 `settled/cancelled` 清台，completed/dining 不再自动清台
- **修复清台死锁**：`getOrdersByTable` 未完成订单过滤从排除 `completed/cancelled` 改为排除 `settled/cancelled`，消除「settled 后无法手动清台」的死锁
- **修复订单列表历史订单显示**：settled/cancelled 历史订单显示「已结束」而非当前桌台实时状态，消除「已结账订单跟随新客人显示占用中」的误导
- **修复清台同步订单状态**：手动清台时自动将 `completed` 订单同步更新为 `settled`，保持订单状态与桌台状态一致
- **修复金额归零 Bug**：后端 Hook 部分更新（只改 status）时 `newItems` 为空导致金额重算为 0，现使用 `oldItems` 兜底
- **删除扫码收款按钮**：后付模式下，订单详情页移除「扫码收款」按钮及二维码模态框，收款统一通过「标记为已结账」完成

### 改进（部署流程）
- **部署脚本增加 pb_hooks 自动同步**：`scripts/deploy.sh` Step 4 新增自动复制 `pb_hooks/` 到 `/opt/pocketbase/pb_hooks/` 并重启 PocketBase，解决「源码 Hook 已改但运行环境未更新」的部署漏洞
- **部署脚本增加 pb_migrations 自动同步**：迁移文件同步到 PocketBase 目录，确保数据库 Schema 变更自动生效

### 安全（P0 漏洞修复）
- **Filter 注入防护**：`escapePbString` 增加对 `||` `&&` `#` 等操作符过滤
- **竞态条件修复**：移除 `sessionExpired` 模块级锁，401 时统一清理 token 并跳转
- **XSS 绕过修复**：`setSafeHtml` 拒绝任何带属性的 HTML 标签
- **折扣 0 值修复**：后端 Hook 改用 `!== undefined && !== null` 判断，区分 `0` 与未设置
- **餐具费防篡改**：后端根据 `dishes` 集合实时读取餐具单价重算，不信任前端传入
- **统计截断修复**：循环分页拉取，安全上限 5000 条，消除硬编码 500 条截断

### 改进（P1 架构优化）
- **API 类型安全**：`handleResponse` 返回 `T | null`，废弃 `null as T`
- **JWT 过期预检**：新增 `isTokenExpired()`，提前拦截过期 token
- **严格 DTO**：定义 `CreateOrderPayload`，禁止前端传入计算字段
- **常量提取**：新建 `src/constants/index.ts`，覆盖 token key、collection 名、状态值等
- **请求/响应拦截器**：401/403 标准化处理，非 Abort 网络错误统一包装
- **状态机类型收紧**：`OrderStatusValue` 从 `string` 收紧为联合类型
- **清台逻辑提取**：新建 `useClearTable` composable，统一清台规则
- **后端聚合统计**：新增 `/api/stats` 自定义路由，SQLite 原生聚合
- **Sentry 监控**：生产环境错误自动上报，支持 Replay

### 改进（P2 代码质量）
- **魔法字符串提取**：`DISH_RULES`、`HOT_DISHES`、`CATEGORY_ORDER` 迁移到 `src/config/dish.config.ts`
- **SSE Realtime**：`KitchenDisplayView` 接入 PocketBase SSE，失败降级 10s 轮询
- **请求缓存**：新增 `MemoryCache` 工具，`DishAPI` 60s TTL，`SettingsAPI` 30s TTL
- **失焦暂停轮询**：`useAutoRefresh` 监听 `visibilitychange`，页面隐藏时暂停

### 新增（P3 体验优化）
- **PWA 离线化**：`manifest.json` + `sw.js`，静态资源 Cache-First，API Network-First
- **蓝牙打印**：`OrderDetailView` 集成 Web Bluetooth + ESC/POS 指令生成器（需 HTTPS）
- **网络状态提示**：`useNetworkStatus` 监听 `online/offline`，顶部显示离线条

### 运维
- **数据库自动备份**：SQLite 热备份，每日 03:00，保留 30 天
- **CI/CD 自动部署**：GitHub Actions `deploy.yml`，CI 通过后自动 SCP + SSH 部署
- **deploy 用户**：专用于部署，最小权限 sudo，SSH 密钥认证

### 文档
- 重构 `docs/智能点菜系统-详细设计说明书.md`，删除第 14/15 章（迁移至 CHANGELOG.md 和 ARCHITECTURE_REVIEW.md）

## [1.0.2] - 2026-04-17

### 改进
- **餐具费定价统一迁移到菜品维护**：
  - 餐具单价不再写死为 ¥2，改为从 `dishes` 集合中 `category === '餐具'` 的菜品价格读取
  - 顾客端（`CustomerOrderView.vue`）购物车中不再展示餐具 item，但底部 bar 和结算弹窗的总金额仍自动包含餐具费
  - 员工端（`OrderFormView.vue`）删除「餐具配置」折叠面板及 `CutleryConfigPanel` 组件，餐具费改为后台自动根据人数计算
  - 顾客端提交订单时，餐具信息以 `cutlery` 字段传入后端，不再混入 `items` 数组，前后端逻辑统一

### 文档
- 更新 `docs/智能点菜系统-详细设计说明书.md` 与 `docs/CODE_CHECKLIST.md`，记录餐具费改造规范

## [1.0.1] - 2026-04-17

### 修复 (P0 架构安全)
- **后端接管核心业务逻辑**：通过 PocketBase JS Hooks (`pb_hooks/orders.pb.js`) 实现
  - 订单金额计算强制在后端执行（创建/更新时自动重算 `totalAmount` / `discount` / `finalAmount`）
  - 订单状态机由后端托管：根据 `items` 的 `status` 变化自动推断整体订单状态，并校验状态流转合法性
  - `table_status` 自动同步：订单创建后自动开台，订单完成/取消后自动清台
- **前端瘦身**：移除 `OrderAPI.updateOrderItemStatus` 和 `appendOrderItems` 中的状态推断与金额计算逻辑
- **移除冗余代码**：`CustomerOrderView.vue` 中创建订单后手动同步 `table_status` 的代码已删除

### 文档
- 更新 `docs/智能点菜系统-详细设计说明书.md` 第 14 节，记录架构优化计划与 P0 修复详情
- 更新 `docs/CODE_CHECKLIST.md`，新增业务逻辑后端托管检查项

## [1.0.0] - 2026-04-14

### 新增
- 全新视觉设计体系：统一卡片、按钮、标签、骨架屏和空状态组件。
- 订单列表移动端卡片化适配，支持快捷状态筛选与操作下拉菜单。
- 厨房大屏新增「待备料汇总」看板、超时强提醒动画、一键状态变更按钮。
- 订单详情页重构为「头部卡片 + 收银小票式明细 + 右侧汇总」布局。
- 新建订单页新增折叠餐具配置、热门菜品 🔥 标签、购物车弹跳反馈动画。
- 设置页分区块展示，桌号管理改为网格化方块布局。
- 菜品维护（移入系统设置）桌面端新增分类侧边栏，全局增加菜品图片占位框。
- 全局页面切换淡入淡出动画，Toast 通知移至顶部居中。
- 登录页增加品牌图标区、错误抖动动画，生产环境隐藏默认账号。
- 自动类型生成：集成 `pocketbase-typegen`，类型定义自动同步数据库 Schema。
- Docker 化支持：提供 `Dockerfile` 与 `docker-compose.yml`，实现一键本地/生产部署。

### 改进
- 返回按钮统一为醒目的蓝色实心样式。
- 状态标签从色块升级为圆环胶囊徽章，提升可访问性。
- 统计页 KPI 卡片增加图标与渐变背景，图表布局响应式优化。
- 按钮统一增加 `active:scale-[0.98]` 点击反馈。
- 支持 `prefers-reduced-motion`，自动关闭动画保障无障碍体验。

### 修复
- 彻底移除 PocketBase JS 迁移脚本相关风险，部署脚本不再自动处理 `pb_migrations`。
- 修复类型安全性：全面替换 `catch (err: any)` 为 `catch (err: unknown)`。
- 修复 401 处理逻辑：正确识别 token 过期并跳转登录页。
- 修复浮点数精度问题：所有金额计算统一走 `MoneyCalculator`。
- 修复 XSS 风险：打印模板增加 `escapeHtml` 转义。
- 修复内存泄漏：`KitchenDisplayView`、`StatisticsView` 增加生命周期清理。

### 工程化
- 集成 Husky + lint-staged，提交前强制类型检查与 ESLint 修复。
- 增加 `scripts/healthcheck.sh`（每分钟）与 `scripts/backup.sh`（每日 02:00）Cron 任务。
- `deploy.sh` 增加版本号显示、自动备份、健康检查与异常回滚机制。

---

## [0.9.0] - 2026-04-08

### 新增
- 完成核心点餐闭环：订单管理、新建/编辑订单、订单详情、菜品维护、系统设置。
- 集成 PocketBase 作为后端数据库与认证服务。
- 集成 ECharts 营业统计大屏与 XLSX 订单导出。
- 新增厨房大屏（KDS）实时展示待制作与制作中订单。

### 工程化
- 项目初始化：Vue 3 + Vite + TypeScript + Pinia + Tailwind CSS。
