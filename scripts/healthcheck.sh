#!/bin/bash
# =============================================================================
# 智能点菜系统 - 服务健康检查
# 检查项: Nginx / PocketBase / Public API / 磁盘空间
# 失败时自动重启并告警
# =============================================================================

set -e

DATE=$(date '+%Y-%m-%d %H:%M:%S')
LOG_FILE="/var/log/restaurant-pos-healthcheck.log"
ALERT_WEBHOOK=""  # 如需企业微信/钉钉告警，在此配置

function log() {
  echo "[$DATE] $1" | tee -a "$LOG_FILE"
}

function check_service() {
  local name=$1
  local url=$2
  local expected_code=${3:-200}

  local actual_code
  actual_code=$(curl -s -o /dev/null -w "%{http_code}" "$url" || echo "000")

  if [ "$actual_code" != "$expected_code" ]; then
    log "[FAIL] $name: HTTP $actual_code (expected $expected_code)"
    return 1
  fi
  log "[OK] $name: HTTP $actual_code"
  return 0
}

function restart_service() {
  local service=$1
  log "[ACTION] 重启 $service ..."
  sudo systemctl restart "$service" || sudo systemctl start "$service"
  sleep 3
  if sudo systemctl is-active --quiet "$service"; then
    log "[OK] $service 重启成功"
  else
    log "[CRITICAL] $service 重启失败！"
  fi
}

# --- 检查开始 ---
log "========== 健康检查开始 =========="

# 1. Nginx
check_service "Nginx" "http://localhost/" "200" || restart_service "nginx"

# 2. PocketBase
check_service "PocketBase" "http://localhost:8090/api/health" "200" || restart_service "pocketbase"

# 3. Public API (Fastify)
# health 路由不存在，用 dishes 接口验证
check_service "PublicAPI" "http://localhost:3000/api/public/dishes" "200" || restart_service "public-api"

# 4. 磁盘空间
disk_usage=$(df -h / | awk 'NR==2 {print $5}' | tr -d '%')
if [ "$disk_usage" -gt 90 ]; then
  log "[WARN] 磁盘使用率 ${disk_usage}% > 90%"
else
  log "[OK] 磁盘使用率 ${disk_usage}%"
fi

log "========== 健康检查结束 =========="
echo "" >> "$LOG_FILE"

# 保留最近 1000 行日志
tail -n 1000 "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
