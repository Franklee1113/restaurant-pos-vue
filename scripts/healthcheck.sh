#!/bin/bash
# =============================================================================
# 智能点菜系统 - 健康检查脚本
# 用法: 建议通过 crontab 每分钟执行一次
#   * * * * * /var/www/restaurant-pos-vue/scripts/healthcheck.sh >> /var/log/healthcheck.log 2>&1
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ALERT_LOG="/var/log/healthcheck.alert"
CHECK_TIME=$(date '+%Y-%m-%d %H:%M:%S')

# 检查项状态
NGINX_OK=false
POCKETBASE_OK=false
API_OK=false

# 1. 检查 Nginx
if sudo systemctl is-active --quiet nginx; then
  NGINX_OK=true
fi

# 2. 检查 PocketBase
if sudo systemctl is-active --quiet pocketbase; then
  POCKETBASE_OK=true
fi

# 3. 检查 API 可用性
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8090/api/health 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  API_OK=true
fi

# 判断整体状态
if [ "$NGINX_OK" = true ] && [ "$POCKETBASE_OK" = true ] && [ "$API_OK" = true ]; then
  echo "[$CHECK_TIME] ✅ HEALTHY - Nginx: OK, PocketBase: OK, API: OK"
  exit 0
fi

# 不健康，记录告警日志
ALERT_MSG="[$CHECK_TIME] ❌ UNHEALTHY - Nginx: $NGINX_OK, PocketBase: $POCKETBASE_OK, API: $API_OK (HTTP $HTTP_CODE)"
echo "$ALERT_MSG" | tee -a "$ALERT_LOG" || true

# 自动恢复尝试：尝试重启失败的服务
if [ "$NGINX_OK" = false ]; then
  echo "[$CHECK_TIME] ⚠️ 尝试自动重启 Nginx..." | tee -a "$ALERT_LOG" || true
  if ! sudo systemctl restart nginx; then
    echo "[$CHECK_TIME] ❌ Nginx 重启失败" | tee -a "$ALERT_LOG" || true
  fi
fi

if [ "$POCKETBASE_OK" = false ]; then
  echo "[$CHECK_TIME] ⚠️ 尝试自动重启 PocketBase..." | tee -a "$ALERT_LOG" || true
  sudo systemctl reset-failed pocketbase || true
  if ! sudo systemctl restart pocketbase; then
    echo "[$CHECK_TIME] ❌ PocketBase 重启失败" | tee -a "$ALERT_LOG" || true
  fi
fi

# 发送通知（如果有配置 webhook）
WEBHOOK_URL="${HEALTHCHECK_WEBHOOK_URL:-}"
if [ -n "$WEBHOOK_URL" ]; then
  JSON_MSG=$(printf '%s' "$ALERT_MSG" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' 2>/dev/null || printf '"%s"' "$ALERT_MSG")
  curl -s -X POST "$WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -d "{\"msg_type\":\"text\",\"content\":{\"text\":$JSON_MSG}}" \
    > /dev/null 2>&1 || true
fi

exit 1
