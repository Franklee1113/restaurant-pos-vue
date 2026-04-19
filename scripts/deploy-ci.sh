#!/bin/bash
# CI 部署脚本（在服务器端执行）
# 由 GitHub Actions 通过 SSH 调用

set -euo pipefail

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 开始部署..."

# 解压前端构建产物
if [ -f /tmp/deploy-dist.tar.gz ]; then
    mkdir -p /tmp/deploy-dist
    tar xzf /tmp/deploy-dist.tar.gz -C /tmp/deploy-dist
    sudo /opt/pocketbase/scripts/deploy-frontend.sh
    rm -f /tmp/deploy-dist.tar.gz
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 前端已部署"
fi

# 解压 hooks
if [ -f /tmp/deploy-hooks.tar.gz ]; then
    mkdir -p /tmp/deploy-hooks
    tar xzf /tmp/deploy-hooks.tar.gz -C /tmp/deploy-hooks
    sudo /opt/pocketbase/scripts/deploy-hooks.sh
    rm -f /tmp/deploy-hooks.tar.gz
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] pb_hooks 已部署，PocketBase 已重启"
fi

# 重载 Nginx
sudo /opt/pocketbase/scripts/reload-nginx.sh
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Nginx 已重载"

# 清理临时目录
rm -rf /tmp/deploy-dist /tmp/deploy-hooks 2>/dev/null || true

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 部署完成"
