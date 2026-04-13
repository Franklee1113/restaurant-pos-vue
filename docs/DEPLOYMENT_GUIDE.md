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

### 2. 配置环境变量（可选）

如果 PocketBase 不在默认路径，创建 `.env.local`：

```env
VITE_PB_URL=/api
```

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

### 5. 验证部署

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
