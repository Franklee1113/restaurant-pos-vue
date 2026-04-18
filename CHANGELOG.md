# Changelog

所有项目的显著变更都将记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
并且本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

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
