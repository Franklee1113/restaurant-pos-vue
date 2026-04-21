# AGENTS.md — 智能点菜系统 (Vue 3 重构版)

> 本文件为 AI 编码助手提供项目背景、构建步骤、测试规范和部署流程。

---

## 项目概述

- **名称**: restaurant-pos-vue
- **类型**: 餐厅点餐系统（员工端 + 顾客扫码端 + 厨房大屏）
- **前端**: Vue 3.5 + Vite 8 + TypeScript + Tailwind CSS v4
- **后端**: PocketBase (数据库/认证/实时) + Node.js Fastify (公共 API)
- **测试**: Vitest (单元) + Playwright (E2E)

---

## 目录约定

| 目录 | 用途 |
|------|------|
| `src/` | 前端源码 |
| `server/src/` | 公共 API 源码（Fastify + TypeScript） |
| `server/dist/` | 公共 API 编译产物（`tsc` 输出） |
| `e2e/` | Playwright 端到端测试 |
| `pb_hooks/` | PocketBase JS 钩子（订单状态推断、统计） |
| `pb_migrations/` | PocketBase 数据库迁移 |
| `dist/` | 前端生产构建产物 |

---

## 构建命令

```bash
# 前端生产构建
npm run build          # 等同于 run-p type-check "build-only {@}" --

# 前端仅构建（跳过类型检查）
npm run build-only     # vite build

# 后端公共 API 构建
cd server && npm run build   # tsc，输出到 server/dist/
```

**关键规则**: `server/src/` 的任何修改都必须执行 `cd server && npm run build`，
否则 `server/dist/` 不会更新，生产环境运行的是旧代码。

---

## 测试命令

```bash
# 单元测试
npm run test:unit      # vitest

# E2E 测试（必须在 Linux 无图形环境使用 xvfb）
xvfb-run npx playwright test --project=chromium --workers=1

# 单文件调试
xvfb-run npx playwright test e2e/customer-order-flow.spec.ts --project=chromium --workers=1
```

### E2E 环境要求

- **Playwright 配置**: `workers: 1`（串行执行，避免数据竞争）
- **无图形服务器**: 必须使用 `xvfb-run` 包装
- **认证**: `e2e/auth.setup.ts` 登录后保存 `playwright/.auth/user.json`
- **Admin Token**: E2E 辅助客户端通过 `admin@restaurant.com` / `<E2E_TEST_PASSWORD>` 登录 PocketBase  
  > ⚠️ **安全提醒**：生产环境必须修改默认管理员密码，且不得在代码或文档中提交明文密码。
- **VITE_PB_URL**: 必须配置为 `/api`（通过 Nginx 代理到 PocketBase）

---

## 部署流程

### 前置检查

1. 确认 `.env` 或 `.env.production` 中 `VITE_PB_URL=/api`
2. 确认 `server/src/` 已编译到 `server/dist/`
3. 确认 E2E 测试全部通过

### 部署步骤

```bash
# 1. 进入项目目录
cd /var/www/restaurant-pos-vue

# 2. 构建前端
npm run build

# 3. 构建后端
cd server && npm run build && cd ..

# 4. 备份当前生产环境
sudo cp -a /var/www/restaurant-pos /var/www/restaurant-pos-backup-$(date +%Y%m%d-%H%M%S)

# 5. 同步前端到生产目录
sudo rsync -av --delete dist/ /var/www/restaurant-pos/
sudo chown -R www-data:www-data /var/www/restaurant-pos

# 6. 重启公共 API
pm2 restart restaurant-pos-public-api
# 或手动：kill $(lsof -t -i:3000) 2>/dev/null; cd server && nohup node dist/index.js &

# 7. 验证 Nginx 配置并重载
sudo nginx -t && sudo systemctl reload nginx
```

### 回滚

```bash
# 找到最新备份
BACKUP=$(ls -td /var/www/restaurant-pos-backup-* | head -1)
sudo rsync -av --delete "$BACKUP/" /var/www/restaurant-pos/
sudo systemctl reload nginx
```

---

## 服务进程管理

| 服务 | 端口 | 管理方式 | 命令 |
|------|------|----------|------|
| Nginx | 80 | systemd | `sudo systemctl {start|stop|reload|restart} nginx` |
| PocketBase | 8090 | systemd / 直接 | `/opt/pocketbase/pocketbase serve --http=127.0.0.1:8090` |
| Public API | 3000 | PM2 / 直接 | `pm2 {start|restart|stop} server/ecosystem.config.js` |

---

## 关键代码约束

### 订单状态
- 订单 `status` 由 `pb_hooks/orders.pb.js` 根据 `items[].status` 自动推断
- **禁止**直接通过 Admin API 设置 `status: 'completed'`，除非所有 item 状态为 `served`
- 有效的状态流转：`pending` → `cooking` → `serving` → `dining` → `completed` → `settled`

### 顾客端会话
- `CustomerSession` 使用 `accessToken` 进行身份验证
- 会话存储在 `sessionStorage`，键名为 `customerOrderSession`
- 刷新页面后若会话丢失，通过 `tableStatus.currentOrderId` 自动恢复

### 沽清同步
- `dish.soldOut` 字段由员工端修改，通过 SSE/轮询同步到顾客端
- 顾客端每 10 秒轮询刷新菜品列表
- 公共 API `PublicDishAPI.getDishes()` 必须返回 `soldOut` 和 `soldOutNote`

### 桌台占用检查
- `OrderFormView.vue` 新建订单前检查桌台状态
- 若 `ts.status === 'dining' && ts.currentOrderId`，阻断提交并提示清台

---

## 常见问题

### Q: 修改了 server/src/ 但生产环境未生效？
A: 必须执行 `cd server && npm run build`，然后重启 public-api 服务。
`server/dist/` 是实际运行的代码，`server/src/` 只是源码。

### Q: E2E 测试报 "Failed to authenticate"？
A: 检查 `e2e/auth.setup.ts` 中的登录凭据是否正确，以及 PocketBase 是否可访问。

### Q: 顾客端追加菜品报 "订单已结束，不能追加菜品"？
A: 订单状态必须是 `pending`/`cooking`/`serving`/`dining`，`completed` 及之后的状态禁止追加。

### Q: Nginx 前端刷新 404？
A: 确认 Nginx 配置中有 `try_files $uri $uri/ /index.html;`。

---

## 相关文件

- `nginx.conf` — Nginx 生产配置（含 API 反向代理）
- `docker-compose.yml` — Docker 编排定义
- `server/ecosystem.config.js` — PM2 进程配置
- `e2e/helpers/api-client.ts` — E2E 测试 Admin API 客户端
- `src/config/dish.config.ts` — 菜品分类排序和规则
