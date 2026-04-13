#!/bin/bash
set -e

# 智能点菜系统 - Vue 3 版本部署脚本
# 用法: sudo ./scripts/deploy.sh [target-dir]

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TARGET_DIR="${1:-/var/www/restaurant-pos}"
NGINX_CONF="${2:-/etc/nginx/sites-available/restaurant-pos}"

echo "=========================================="
echo "智能点菜系统 - 部署脚本"
echo "=========================================="
echo "项目目录: $PROJECT_DIR"
echo "部署目标: $TARGET_DIR"
echo "=========================================="

# 1. 构建项目
echo "[1/5] 开始构建项目..."
cd "$PROJECT_DIR"
npm ci
npm run build

# 2. 备份旧版本
echo "[2/5] 备份现有部署..."
if [ -d "$TARGET_DIR" ]; then
  BACKUP_DIR="${TARGET_DIR}-backup-$(date +%Y%m%d-%H%M%S)"
  cp -r "$TARGET_DIR" "$BACKUP_DIR"
  echo "已备份到: $BACKUP_DIR"
fi

# 3. 部署静态文件
echo "[3/5] 部署静态文件..."
mkdir -p "$TARGET_DIR"
rm -rf "${TARGET_DIR:?}/"*
cp -r "${PROJECT_DIR}/dist/"* "$TARGET_DIR/"

# 4. 设置权限
echo "[4/5] 设置文件权限..."
chown -R www-data:www-data "$TARGET_DIR"
chmod -R 755 "$TARGET_DIR"

# 5. 检查 Nginx 配置
echo "[5/5] 检查 Nginx 配置..."
if [ -f "$NGINX_CONF" ]; then
  nginx -t && systemctl reload nginx
  echo "Nginx 已重载"
else
  echo "[警告] 未找到 Nginx 配置文件: $NGINX_CONF"
  echo "请参考 scripts/nginx-example.conf 创建配置"
fi

echo "=========================================="
echo "部署完成！"
echo "访问地址: http://$(hostname -I | awk '{print $1}')"
echo "=========================================="
