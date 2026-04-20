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

# Step 0: 预检 - Nginx root 一致性检查
log_info "Step 0/7: 预检 Nginx root 一致性..."
NGINX_CONFIG_ROOT=$(grep -E '^\s*root\s+' /etc/nginx/sites-available/restaurant-pos 2>/dev/null | awk '{print $2}' | tr -d ';')
if [ "$NGINX_CONFIG_ROOT" != "$NGINX_ROOT" ]; then
  log_error "Nginx root 不一致！"
  log_error "  Nginx 配置: $NGINX_CONFIG_ROOT"
  log_error "  deploy.sh 配置: $NGINX_ROOT"
  log_error "  请同步两者后再部署，否则部署的代码不会被实际服务！"
  exit 1
fi
log_info "Nginx root 一致性检查通过: $NGINX_CONFIG_ROOT"

# Step 1: 构建项目
log_info "Step 1/7: 执行构建..."
npm run build

# Step 2: 备份当前生产环境
log_info "Step 2/7: 备份当前生产环境..."
mkdir -p "$BACKUP_DIR"
if [ -d "$NGINX_ROOT" ]; then
  sudo cp -r "$NGINX_ROOT" "$BACKUP_DIR/pre-$TIMESTAMP"
  log_info "前端文件已备份到 $BACKUP_DIR/pre-$TIMESTAMP"
fi

# Step 3: 部署前端文件
log_info "Step 3/7: 部署前端文件..."
if [ -d "$NGINX_ROOT/assets" ]; then
  sudo rm -rf "$NGINX_ROOT/assets"
fi
sudo cp -r "$PROJECT_DIR/dist/assets" "$NGINX_ROOT/"
sudo cp "$PROJECT_DIR/dist/index.html" "$NGINX_ROOT/"

# Step 4: 同步后端 Hook 文件并重启 PocketBase
log_info "Step 4/7: 同步后端 Hook 文件..."
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

# Step 4b: 重启公共 API 服务（顾客端依赖）
log_info "Step 4b/7: 重启公共 API 服务..."
sudo systemctl restart public-api || sudo systemctl start public-api
sleep 2
if ! sudo systemctl is-active --quiet public-api; then
  log_error "公共 API 服务启动失败！"
  rollback
fi
log_info "公共 API 服务运行正常"

# Step 5: 重启 Nginx
log_info "Step 5/7: 重启 Nginx..."
sudo systemctl restart nginx || { log_error "Nginx 重启失败"; rollback; }
if ! sudo systemctl is-active --quiet nginx; then
  log_error "Nginx 启动失败！"
  rollback
fi

# Step 6: 部署验证 - 确认生产环境返回的是新构建的代码
log_info "Step 6/7: 验证前端部署是否生效..."
sleep 2

# 获取本地构建的 index.js 文件名
LOCAL_INDEX_JS=$(grep -o 'src="/assets/index-[^"]*\.js"' "$PROJECT_DIR/dist/index.html" | sed 's/src=\"//;s/\"//')
# 获取生产环境返回的 index.js 文件名
REMOTE_INDEX_JS=$(curl -s http://127.0.0.1/ | grep -o 'src="/assets/index-[^"]*\.js"' | sed 's/src=\"//;s/\"//')

if [ -z "$REMOTE_INDEX_JS" ]; then
  log_error "无法从生产环境获取 index.js 文件名，部署验证失败！"
  rollback
fi

if [ "$LOCAL_INDEX_JS" != "$REMOTE_INDEX_JS" ]; then
  log_error "前端部署验证失败！"
  log_error "  本地构建: $LOCAL_INDEX_JS"
  log_error "  生产环境: $REMOTE_INDEX_JS"
  log_error "  可能原因：Nginx root 指向了错误的目录、CDN 缓存、或 Service Worker 拦截"
  rollback
fi
log_info "前端部署验证通过: $REMOTE_INDEX_JS"

# Step 7: 健康检查
log_info "Step 7/7: 执行健康检查..."
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

PUBLIC_API_OK=false
PUBLIC_API_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/api/public/dishes 2>/dev/null || echo "000")
if [ "$PUBLIC_API_CODE" = "200" ]; then
  PUBLIC_API_OK=true
fi

if [ "$NGINX_OK" = true ] && [ "$API_OK" = true ] && [ "$PUBLIC_API_OK" = true ]; then
  log_info "✅ 部署成功！版本: $VERSION"
  log_info "Nginx: OK, API: OK (HTTP $HTTP_CODE), 公共API: OK (HTTP $PUBLIC_API_CODE), 前端: OK ($REMOTE_INDEX_JS)"
  log_info "如需回滚: sudo rm -rf $NGINX_ROOT && sudo cp -r $BACKUP_DIR/pre-$TIMESTAMP $NGINX_ROOT && sudo systemctl restart nginx"
  exit 0
else
  log_error "健康检查失败 - Nginx: $NGINX_OK, API: $API_OK (HTTP $HTTP_CODE), 公共API: $PUBLIC_API_OK (HTTP $PUBLIC_API_CODE)"
  rollback
fi
