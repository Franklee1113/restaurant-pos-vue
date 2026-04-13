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
| Vue 3 | 组件框架 + Composition API |
| Vite 8 | 构建工具 + 热更新 |
| Vue Router 4 | 单页路由 |
| Pinia | 全局状态管理 |
| Tailwind CSS v4 | 原子化样式 |
| TypeScript | 类型安全 |
| Vitest | 单元测试 |
| Playwright | E2E 测试（已配置） |

---

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 启动开发服务器
npm run dev

# 3. 运行单元测试
npm run test:unit

# 4. 生产构建
npm run build
```

---

## 项目结构

```
src/
├── api/pocketbase.ts        # PocketBase API 封装（TypeScript）
├── components/              # 公共组件
├── composables/             # 组合式逻辑
├── layouts/MainLayout.vue   # 主布局（导航栏 + 内容区）
├── router/index.ts          # 路由配置
├── stores/                  # Pinia Store
│   ├── auth.store.ts
│   └── settings.store.ts
├── utils/                   # 工具函数
│   ├── security.ts          # XSS 防护 + MoneyCalculator
│   ├── orderStatus.ts       # 订单状态枚举和流转
│   └── printBill.ts         # 打印账单/厨单
└── views/                   # 页面视图
    ├── LoginView.vue
    ├── OrderListView.vue
    ├── OrderFormView.vue    # 新建/编辑订单（合并）
    ├── OrderDetailView.vue
    ├── DishManagementView.vue
    ├── SettingsView.vue
    └── StatisticsView.vue
```

---

## 与原系统的主要改进

1. **路由可靠性**
   - 使用 `vue-router` 替代手搓 hash router，彻底解决页面闪退和参数丢失问题

2. **组件复用**
   - 原 `CreateOrder.js` (547行) + `EditOrder.js` (509行) 合并为单一 `OrderFormView.vue`
   - 重复代码减少约 70%

3. **状态管理**
   - `settings.store.ts` 全局缓存系统设置，避免每个页面重复 fetch
   - `auth.store.ts` 统一管理登录态

4. **类型安全**
   - API 层、工具函数、组件 Props 全部使用 TypeScript
   - 编译期即可捕获大量潜在错误

5. **样式工程化**
   - 使用 Tailwind CSS 替代 2247 行的巨型 CSS 文件 + 大量内联 style

6. **内存安全**
   - Vue 3 自动管理组件生命周期和事件清理，彻底消除手动 DOM 事件绑定导致的内存泄漏风险

---

## 环境变量

如有需要，可在项目根目录创建 `.env`：

```env
VITE_PB_URL=/api
```

---

## 部署说明

```bash
npm run build
```

构建产物输出到 `dist/` 目录，可直接部署到 Nginx/Apache 静态服务器。
后端 PocketBase 接口路径不变，无需修改服务器配置。

---

## 测试状态

- **单元测试**: 16 个通过 ✅
- **E2E 测试**: Playwright 已配置，待补充完整场景

---

**重构日期**: 2026-04-13
