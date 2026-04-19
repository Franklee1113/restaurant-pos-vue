# 智能点菜系统 - 部署与迁移指南

> **目标读者**: 运维人员 / 技术负责人  
> **文档版本**: v1.0  
> **日期**: 2026-04-13

---

## 一、环境要求

### 服务器要求

| 组件 | 最低配置 | 说明 |
|------|---------|------|
| Node.js | 18.x+ | 构建前端项目 |
| Nginx | 1.18+ | 静态文件服务和反向代理 |
| PocketBase | 最新版 | 后端 BaaS，需独立运行 |

### 网络要求

- 服务器 80 端口对外开放
- PocketBase 默认运行在 `127.0.0.1:8090`（仅本地访问，通过 Nginx 反向代理暴露 `/api`）

---

## 二、首次部署步骤

### 1. 拉取新项目代码

```bash
cd /var/www
# 如果已在此服务器开发，直接使用现有目录
cd restaurant-pos-vue
npm install
```

### 2. 配置环境变量

复制模板文件并根据环境修改：

```bash
cp .env.example .env.production
```

#### 必需配置

```env
VITE_PB_URL=/api
```

#### Sentry 前端监控（可选但强烈推荐）

1. 在 [sentry.io](https://sentry.io) 注册账号并创建项目
2. 复制项目 DSN 到 `.env.production`：

```env
VITE_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
VITE_APP_VERSION=1.0.2
```

> **注意**：Sentry 仅在 `import.meta.env.PROD` 为 true 时生效（即生产构建）。开发环境自动禁用。
>
> 未配置 `VITE_SENTRY_DSN` 时，Sentry 模块完全不会初始化，对应用零开销。

### 3. 执行部署脚本

```bash
chmod +x scripts/deploy.sh
sudo ./scripts/deploy.sh /var/www/restaurant-pos
```

脚本会自动完成：
- `npm ci` + `npm run build`
- 备份现有 `/var/www/restaurant-pos`
- 将 `dist/` 内容复制到 `/var/www/restaurant-pos`
- 设置 `www-data` 权限
- 重载 Nginx

### 4. 配置 Nginx

```bash
sudo cp scripts/nginx-example.conf /etc/nginx/sites-available/restaurant-pos
sudo ln -sf /etc/nginx/sites-available/restaurant-pos /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 5. 部署 PocketBase Hooks（后端业务逻辑）

前端代码部署后，必须同步部署后端 hooks，否则金额计算、状态拦截、统计聚合等关键逻辑不会生效。

```bash
# 备份现有 hooks
sudo cp /opt/pocketbase/pb_hooks/orders.pb.js /opt/pocketbase/pb_hooks/orders.pb.js.backup.$(date +%Y%m%d-%H%M%S)

# 复制新 hooks（假设源码在 /var/www/restaurant-pos-vue）
sudo cp /var/www/restaurant-pos-vue/pb_hooks/orders.pb.js /opt/pocketbase/pb_hooks/
sudo cp /var/www/restaurant-pos-vue/pb_hooks/stats.pb.js /opt/pocketbase/pb_hooks/

# 重启 PocketBase 使 hooks 生效
sudo systemctl restart pocketbase

# 验证统计聚合路由
sleep 2
curl -s "http://127.0.0.1:8090/api/stats?start=$(date +%Y-%m-01)&end=$(date +%Y-%m-%d)" | head -c 100
# 预期输出：{"averageOrderValue":...}
```

> **重要**：`orders.pb.js` 包含金额权威计算逻辑，`stats.pb.js` 提供后端聚合统计。两者必须同时部署。

---

## 二、自动化部署（GitHub Actions → 服务器）

已配置 CI/CD 自动部署流水线，push 到 `main` 分支后自动构建并部署到生产服务器。

### 服务器端配置（已完成）

- **deploy 用户**：专用于 CI 部署，无登录密码，仅通过 SSH 密钥认证
- **sudo 权限**：仅允许执行前端复制、hooks 复制、PocketBase 重启、Nginx 重载
- **部署脚本**：`/opt/pocketbase/scripts/deploy-ci.sh`
- **前端备份**：每次部署自动备份到 `/opt/backups/frontend-YYYYMMDD-HHMMSS/`

### GitHub Secrets 配置（需手动配置）

在 GitHub 仓库 **Settings → Secrets and variables → Actions** 中添加：

| Secret 名称 | 值 | 获取方式 |
|------------|-----|---------|
| `REMOTE_HOST` | `43.143.169.88` | 服务器公网 IP |
| `DEPLOY_KEY` | SSH 私钥 | 服务器执行 `sudo cat /home/deploy/.ssh/id_rsa` |

配置完成后，push 到 `main` 分支将自动触发部署。

### 手动触发部署

```bash
git push origin main
# 或到 GitHub Actions 页面点击 "Run workflow"
```

---

## 三、数据库自动备份

### 备份策略

- **频率**：每日凌晨 3:00
- **内容**：SQLite 热备份（data.db + logs.db）+ storage 附件 + pb_hooks
- **保留期**：30 天，过期自动清理
- **存储位置**：`/opt/backups/pocketbase/YYYYMMDD-HHMMSS.tar.gz`

### 验证备份

```bash
# 查看备份列表
ls -lh /opt/backups/pocketbase/

# 查看备份日志
tail -20 /var/log/pocketbase-backup.log

# 手动执行备份测试
sudo /opt/pocketbase/scripts/backup.sh
```

### 恢复备份

```bash
# 1. 停止 PocketBase
sudo systemctl stop pocketbase

# 2. 备份当前数据（防止恢复失败）
sudo cp -r /opt/pocketbase/pb_data /opt/pocketbase/pb_data.manual-backup-$(date +%Y%m%d)

# 3. 解压目标备份
BACKUP_DATE="20260419-030000"
cd /opt/backups/pocketbase
sudo tar xzf "${BACKUP_DATE}.tar.gz"

# 4. 恢复数据库（使用 sqlite3 的 .restore）
sudo sqlite3 /opt/pocketbase/pb_data/data.db ".restore '/opt/backups/pocketbase/${BACKUP_DATE}/data.db'"
sudo sqlite3 /opt/pocketbase/pb_data/logs.db ".restore '/opt/backups/pocketbase/${BACKUP_DATE}/logs.db'"

# 5. 恢复 storage
sudo rm -rf /opt/pocketbase/pb_data/storage
sudo cp -r "/opt/backups/pocketbase/${BACKUP_DATE}/storage" /opt/pocketbase/pb_data/

# 6. 启动 PocketBase
sudo systemctl start pocketbase
```

---

## 四、旧系统平滑迁移方案

访问 `http://<服务器IP>/login`，使用默认账号登录：
- 邮箱: `admin@restaurant.com`
- 密码: `REDACTED_DEFAULT_PASSWORD`

---

## 三、旧系统平滑迁移方案

### 迁移原则

**新系统与旧系统使用同一个 PocketBase 数据库**，无需数据迁移。只需切换前端代码即可。

### 推荐迁移策略：域名切换法

```
Day 1:  新系统部署到测试域名，内部试用
Day 3:  如无问题，Nginx 主域名切到新系统
Day 7:  稳定运行后，旧系统归档
```

### 快速回滚

如果新系统上线后出现问题，可秒级回滚：

```bash
# 查看备份
ls -la /var/www/restaurant-pos-backup-*

# 恢复旧版本
sudo rm -rf /var/www/restaurant-pos/*
sudo cp -r /var/www/restaurant-pos-backup-20260413-120000/* /var/www/restaurant-pos/
sudo systemctl reload nginx
```

---

## 四、目录结构对照

| 旧系统 | 新系统 |
|--------|--------|
| `/var/www/restaurant-pos` | `/var/www/restaurant-pos`（部署产物） |
| `/var/www/restaurant-pos-vue` | `/var/www/restaurant-pos-vue`（源码） |

---

## 五、常见问题

### Q1: 刷新页面后 404
A: 检查 Nginx 配置中是否有 `try_files $uri $uri/ /index.html;`

### Q2: API 请求失败
A: 检查 PocketBase 是否运行 (`systemctl status pocketbase`)，以及 Nginx `/api/` 代理配置是否正确

### Q3: 缓存导致新代码不生效
A: 每次部署都会生成带 hash 的 JS/CSS 文件名，浏览器会自动加载新版本。如遇极端情况可强制清缓存：
```bash
sudo rm -rf /var/cache/nginx/*
```
