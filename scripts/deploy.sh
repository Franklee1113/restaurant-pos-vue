#!/bin/bash
# =============================================================================
# 智能点菜系统 - 生产部署脚本
# 功能：构建 → 备份 → 部署 → 健康检查 → 异常自动回滚
# 用法: sudo ./scripts/deploy.sh
# =============================================================================

set -e

# 配置项
PROJECT_DIR="/var/www/restaurant-pos-vue"
NGINX_ROOT="/var/www/restaurant-pos"
PB_MIGRATIONS_DIR="/opt/pocketbase/pb_migrations"
PB_HOOKS_DIR="/opt/pocketbase/pb_hooks"
BACKUP_DIR="/var/www/restaurant-pos-backups"
APP_VERSION=$(node -p "require('./package.json').version")
if [ -z "$APP_VERSION" ]; then
  echo "[ERROR] 无法读取 package.json 版本号"
  exit 1
fi
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
VERSION="v${APP_VERSION}-${TIMESTAMP}"

# 颜色输出
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

function log_info() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

function log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

function log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

function rollback() {
  log_error "部署失败，开始回滚..."
  if [ -d "$BACKUP_DIR/pre-$TIMESTAMP" ]; then
    sudo rm -rf "$NGINX_ROOT"
    sudo cp -r "$BACKUP_DIR/pre-$TIMESTAMP" "$NGINX_ROOT"
    log_info "前端文件已回滚到 pre-$TIMESTAMP"
  fi
  sudo systemctl restart nginx || { log_error "回滚时 Nginx 重启失败"; exit 1; }
  log_info "Nginx 已重启"
  log_error "❌ 部署失败并已回滚，请检查错误日志"
  exit 1
}

# 捕获错误并回滚
trap 'rollback' ERR

cd "$PROJECT_DIR"

log_info "========== 开始部署 (版本: $VERSION) =========="

# Step 1: 构建项目
log_info "Step 1/6: 执行构建..."
npm run build

# Step 2: 备份当前生产环境
log_info "Step 2/6: 备份当前生产环境..."
mkdir -p "$BACKUP_DIR"
if [ -d "$NGINX_ROOT" ]; then
  sudo cp -r "$NGINX_ROOT" "$BACKUP_DIR/pre-$TIMESTAMP"
  log_info "前端文件已备份到 $BACKUP_DIR/pre-$TIMESTAMP"
fi

# Step 3: 部署前端文件
log_info "Step 3/6: 部署前端文件..."
if [ -d "$NGINX_ROOT/assets" ]; then
  sudo rm -rf "$NGINX_ROOT/assets"
fi
sudo cp -r "$PROJECT_DIR/dist/assets" "$NGINX_ROOT/"
sudo cp "$PROJECT_DIR/dist/index.html" "$NGINX_ROOT/"

# Step 4: 同步后端 Hook 文件并重启 PocketBase
log_info "Step 4/6: 同步后端 Hook 文件..."
if [ -d "$PROJECT_DIR/pb_hooks" ]; then
  sudo cp -r "$PROJECT_DIR/pb_hooks/"* "$PB_HOOKS_DIR/"
  log_info "pb_hooks 已同步到 $PB_HOOKS_DIR"
fi

# 同步迁移文件
if [ -d "$PROJECT_DIR/pb_migrations" ] && [ "$(ls -A "$PROJECT_DIR/pb_migrations" 2>/dev/null)" ]; then
  sudo cp -r "$PROJECT_DIR/pb_migrations/"* "$PB_MIGRATIONS_DIR/"
  log_info "pb_migrations 已同步到 $PB_MIGRATIONS_DIR"
fi

sudo systemctl restart pocketbase
sleep 1
if ! sudo systemctl is-active --quiet pocketbase; then
  log_error "PocketBase 重启失败！"
  rollback
fi
log_info "PocketBase 已重启并运行正常"
sleep 1
if ! sudo systemctl is-active --quiet pocketbase; then
  log_error "PocketBase 未正常运行！"
  rollback
fi
log_info "PocketBase 运行正常"

# Step 5: 重启 Nginx
log_info "Step 5/6: 重启 Nginx..."
sudo systemctl restart nginx || { log_error "Nginx 重启失败"; rollback; }
if ! sudo systemctl is-active --quiet nginx; then
  log_error "Nginx 启动失败！"
  rollback
fi

# Step 6: 健康检查
log_info "Step 6/6: 执行健康检查..."
sleep 2

NGINX_OK=false
API_OK=false

if sudo systemctl is-active --quiet nginx; then
  NGINX_OK=true
fi

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8090/api/ 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "404" ]; then
  API_OK=true
fi

if [ "$NGINX_OK" = true ] && [ "$API_OK" = true ]; then
  log_info "✅ 部署成功！版本: $VERSION"
  log_info "Nginx: OK, API: OK (HTTP $HTTP_CODE)"
  log_info "如需回滚: sudo rm -rf $NGINX_ROOT && sudo cp -r $BACKUP_DIR/pre-$TIMESTAMP $NGINX_ROOT && sudo systemctl restart nginx"
  exit 0
else
  log_error "健康检查失败 - Nginx: $NGINX_OK, API: $API_OK (HTTP $HTTP_CODE)"
  rollback
fi
