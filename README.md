# 智能点菜系统 - Vue 3 重构版

> 基于 Vue 3 + Vite + Pinia + Tailwind CSS 的现代前端架构重构

---

## 项目背景

本项目是原 `restaurant-pos` 原生 JavaScript SPA 的架构升级版本。
原系统因手搓组件和路由导致维护成本激增，出现路由闪退、事件重复绑定、页面间大量重复代码等问题。
本重构版在保留原有 PocketBase 后端接口的前提下，全面迁移到 Vue 3 生态。

---

## 技术栈

| 技术 | 用途 |
|------|------|
| Vue 3.5 | 组件框架 + Composition API |
| Vite 8 | 构建工具 + 热更新 |
| Vue Router 5 | 单页路由 |
| Pinia 3 | 全局状态管理 |
| Tailwind CSS v4 | 原子化样式 |
| TypeScript 6 | 类型安全 |
| Vitest 4 | 单元测试 |
| Playwright | E2E 端到端测试 |
| Fastify 5 | 公共 API 服务（Node.js） |
| PocketBase | 后端数据库 + 认证 + 实时订阅 |

---

## 快速开始

```bash
# 1. 安装前端依赖
npm install

# 2. 安装后端公共 API 依赖
cd server && npm install && cd ..

# 3. 启动开发服务器
npm run dev

# 4. 运行单元测试
npm run test:unit

# 5. 运行 E2E 测试
npm run test:e2e

# 6. 生产构建
npm run build
```

---

## 项目结构

```
├── src/                       # 前端源码
│   ├── api/
│   │   ├── pocketbase.ts      # PocketBase 员工端 API 封装
│   │   └── public-order.api.ts # 顾客端公共 API
│   ├── components/            # 公共组件（CartPanel、DialogModal 等）
│   ├── composables/           # 组合式逻辑（useToast、useCart 等）
│   ├── config/
│   │   └── dish.config.ts     # 菜品分类排序和规则配置
│   ├── layouts/MainLayout.vue # 主布局（导航栏 + 内容区）
│   ├── router/index.ts        # 路由配置
│   ├── stores/                # Pinia Store
│   ├── utils/                 # 工具函数
│   │   ├── security.ts        # XSS 防护 + MoneyCalculator
│   │   ├── orderStatus.ts     # 订单状态枚举和流转
│   │   └── printBill.ts       # 打印账单/厨单
│   └── views/                 # 页面视图
│       ├── LoginView.vue
│       ├── OrderListView.vue
│       ├── OrderFormView.vue  # 新建/编辑订单
│       ├── OrderDetailView.vue
│       ├── KitchenDisplayView.vue  # 厨房大屏
│       ├── CustomerOrderView.vue   # 顾客扫码点餐
│       ├── SettingsView.vue
│       └── StatisticsView.vue
├── server/                    # 公共 API 服务（顾客端）
│   ├── src/
│   │   ├── index.ts           # Fastify 入口
│   │   ├── routes/            # API 路由
│   │   └── services/          # 业务逻辑
│   └── dist/                  # 编译产物（tsc 输出）
├── e2e/                       # Playwright E2E 测试
│   ├── helpers/api-client.ts  # E2E 测试 Admin API 客户端
│   ├── customer-order-flow.spec.ts
│   ├── clear-table-integration.spec.ts
│   ├── sold-out-sync.spec.ts
│   ├── order-flow.spec.ts
│   ├── order-detail.spec.ts
│   ├── dish-management.spec.ts
│   ├── kitchen-display.spec.ts
│   ├── login.spec.ts
│   └── settings.spec.ts
├── pb_hooks/                  # PocketBase JS 钩子
│   ├── orders.pb.js           # 订单状态自动推断
│   └── stats.pb.js            # 统计聚合
├── pb_migrations/             # 数据库迁移
├── nginx.conf                 # Nginx 生产配置
├── docker-compose.yml         # Docker 编排
├── Dockerfile                 # 前端镜像
└── server/Dockerfile          # 公共 API 镜像
```

---

## 与原系统的主要改进

1. **路由可靠性**
   - 使用 `vue-router` 替代手搓 hash router，彻底解决页面闪退和参数丢失问题

2. **组件复用**
   - 原 `CreateOrder.js` (547行) + `EditOrder.js` (509行) 合并为单一 `OrderFormView.vue`
   - 重复代码减少约 70%

3. **顾客端扫码点餐**
   - 新增独立的 `CustomerOrderView.vue`，支持扫码选菜、下单、追加
   - 通过 `CustomerSession`（accessToken）实现无登录追加菜品
   - 10 秒轮询实时同步沽清状态

4. **厨房大屏（KDS）**
   - 新增 `KitchenDisplayView.vue`，SSE 实时推送待制作菜品
   - 支持按桌号/时间排序，标记制作中/已完成

5. **沽清功能**
   - 员工端长按/右键标记沽清，顾客端实时显示不可点
   - 一键清空所有沽清状态

6. **状态管理**
   - `settings.store.ts` 全局缓存系统设置，避免每个页面重复 fetch
   - `auth.store.ts` 统一管理登录态

7. **类型安全**
   - API 层、工具函数、组件 Props 全部使用 TypeScript
   - 编译期即可捕获大量潜在错误

8. **样式工程化**
   - 使用 Tailwind CSS 替代 2247 行的巨型 CSS 文件 + 大量内联 style

9. **内存安全**
   - Vue 3 自动管理组件生命周期和事件清理，彻底消除手动 DOM 事件绑定导致的内存泄漏风险

---

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `VITE_PB_URL` | PocketBase API 地址（前端调用） | `/api` |
| `VITE_SENTRY_DSN` | Sentry 错误监控 DSN | - |
| `VITE_APP_VERSION` | 应用版本号 | `1.0.2` |

---

## 部署说明

### 方式一：直接部署（推荐，当前生产环境使用）

```bash
# 1. 构建前端
cd /var/www/restaurant-pos-vue
npm run build

# 2. 构建后端公共 API
cd server && npm run build && cd ..

# 3. 同步到生产目录
sudo rsync -av --delete dist/ /var/www/restaurant-pos/
sudo chown -R www-data:www-data /var/www/restaurant-pos

# 4. 重启公共 API 服务
pm2 restart restaurant-pos-public-api
# 或直接 kill + 启动
# kill $(lsof -t -i:3000) 2>/dev/null; nohup node server/dist/index.js &

# 5. 重载 Nginx（如配置有变更）
sudo nginx -t && sudo systemctl reload nginx
```

### 方式二：Docker Compose

```bash
docker compose up -d --build
```

服务组成：
- `frontend` (Nginx:80) → 前端静态资源
- `pocketbase` (8090) → 数据库 + Admin UI
- `public-api` (3000) → 顾客端公共 API

---

## 生产环境架构

```
用户请求 → Nginx (80)
    ├── /           → /var/www/restaurant-pos (前端静态文件)
    ├── /api/public/ → 127.0.0.1:3000 (Node.js 公共 API)
    ├── /api/       → 127.0.0.1:8090 (PocketBase 员工 API)
    └── /_/         → 127.0.0.1:8090 (PocketBase Admin UI)
```

---

## 测试状态

- **单元测试**: 515 个通过，2 个跳过 ✅ (`npm run test:unit`)
- **E2E 测试**: 27 个通过，2 个条件跳过 ✅ (`npx playwright test`)
  - 覆盖：登录、扫码点餐完整链路、清台联动、沽清同步、厨房大屏、订单核心流程、菜品维护、系统设置

---

## 关键业务规则

| 规则 | 说明 |
|------|------|
| 订单状态推断 | 后端 Hook 根据 `items[].status` 自动推断订单状态，不可直接设置 |
| 桌台占用检查 | 新建订单前检查桌台是否为 `dining`，占用时阻断 |
| completed 不可追加 | `completed`/`cancelled`/`settled` 订单禁止顾客追加菜品 |
| 清台联动 | 清台后订单变为 `settled`，桌台变为 `idle` |
| dining 追加保持 | dining 状态追加菜品，新项状态为 `pending`，旧项不变 |

---

**版本**: 1.0.2  
**重构日期**: 2026-04-13  
**最后更新**: 2026-04-21
