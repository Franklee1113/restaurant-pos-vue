#!/bin/bash
# =============================================================================
# 自动配置 PocketBase 以支持顾客扫码点餐 (PocketBase 0.22.27 兼容版)
# 关键注意：公开访问规则必须用空字符串 ""，不能用 "true"
# =============================================================================

set -e

command -v python3 >/dev/null 2>&1 || { echo "错误：本脚本需要 python3，请先安装。"; exit 1; }

PB_URL="http://127.0.0.1:8090"

echo "=========================================="
echo "PocketBase 顾客扫码点餐自动配置脚本"
echo "=========================================="
echo ""
read -p "请输入 PocketBase 管理员邮箱: " ADMIN_EMAIL
read -s -p "请输入 PocketBase 管理员密码: " ADMIN_PASS
echo ""

echo ""
echo "[1/4] 正在登录获取 Admin Token..."

LOGIN_PAYLOAD=$(python3 -c "import json; print(json.dumps({'identity': '$ADMIN_EMAIL', 'password': '$ADMIN_PASS'}))" 2>/dev/null || echo "")
if [ -z "$LOGIN_PAYLOAD" ]; then
  echo "登录参数编码失败"
  exit 1
fi

LOGIN_RES=$(curl -s -X POST "${PB_URL}/api/admins/auth-with-password" \
  -H "Content-Type: application/json" \
  -d "$LOGIN_PAYLOAD")

TOKEN=$(echo "$LOGIN_RES" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || echo "")

if [ -z "$TOKEN" ]; then
  echo "登录失败，请检查邮箱和密码是否正确。"
  echo "返回信息: $LOGIN_RES"
  exit 1
fi

echo "登录成功"

echo ""
echo "[2/4] 检查并创建 table_status 集合..."

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${PB_URL}/api/collections/table_status" -H "Authorization: Bearer ${TOKEN}")

if [ "$HTTP_CODE" = "200" ]; then
  echo "table_status 集合已存在，跳过创建"
else
  TMP_JSON=$(mktemp)
  cat > "$TMP_JSON" << 'JSONEOF'
{
  "name": "table_status",
  "type": "base",
  "schema": [
    { "system": false, "id": "field_tableNo", "name": "tableNo", "type": "text", "required": true, "unique": true, "options": { "min": null, "max": null, "pattern": "" } },
    { "system": false, "id": "field_status", "name": "status", "type": "text", "required": true, "unique": false, "options": { "min": null, "max": null, "pattern": "" } },
    { "system": false, "id": "field_currentOrderId", "name": "currentOrderId", "type": "text", "required": false, "unique": false, "options": { "min": null, "max": null, "pattern": "" } },
    { "system": false, "id": "field_openedAt", "name": "openedAt", "type": "date", "required": false, "unique": false, "options": { "min": "", "max": "", "format": "" } }
  ],
  "listRule": "",
  "viewRule": "",
  "createRule": "",
  "updateRule": "",
  "deleteRule": "@request.auth.id != ''"
}
JSONEOF
  CREATE_RES=$(curl -s -X POST "${PB_URL}/api/collections" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "@$TMP_JSON")
  rm -f "$TMP_JSON"
  if echo "$CREATE_RES" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null | grep -q .; then
    echo "table_status 集合创建成功"
  else
    echo "table_status 创建失败: $CREATE_RES"
    exit 1
  fi
fi

echo ""
echo "[3/4] 更新 orders 集合字段和 API 规则..."

ORDERS_JSON=$(curl -s "${PB_URL}/api/collections/orders" -H "Authorization: Bearer ${TOKEN}")
ORDERS_ID=$(echo "$ORDERS_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))")

if [ -z "$ORDERS_ID" ]; then
  echo "无法获取 orders 集合信息"
  exit 1
fi

TMP_PY=$(mktemp)
cat > "$TMP_PY" << 'PYEOF'
import sys, json

data = json.load(sys.stdin)
schema = data.get('schema', [])

existing_names = {f['name'] for f in schema}
if 'source' not in existing_names:
    schema.append({
        "system": False,
        "id": "field_source",
        "name": "source",
        "type": "text",
        "required": False,
        "unique": False,
        "options": {"min": None, "max": None, "pattern": ""}
    })
if 'customerPhone' not in existing_names:
    schema.append({
        "system": False,
        "id": "field_customerPhone",
        "name": "customerPhone",
        "type": "text",
        "required": False,
        "unique": False,
        "options": {"min": None, "max": None, "pattern": ""}
    })

data['schema'] = schema
# 顾客可以查看/创建/更新自己相关的订单（通过订单ID和桌号公开访问）
# 员工拥有完全权限
data['listRule'] = ""
data['viewRule'] = ""
data['createRule'] = ""
# updateRule 允许公开更新，但关键财务字段应在 PocketBase 中设置 field-level 保护
data['updateRule'] = ""
data['deleteRule'] = "@request.auth.id != ''"

for key in ['id', 'name', 'type', 'created', 'updated', 'system', 'indexes']:
    data.pop(key, None)

json.dump(data, sys.stdout)
PYEOF

TMP_ORDERS_JSON=$(mktemp)
echo "$ORDERS_JSON" | python3 "$TMP_PY" > "$TMP_ORDERS_JSON"
rm -f "$TMP_PY"

PATCH_RES=$(curl -s -X PATCH "${PB_URL}/api/collections/${ORDERS_ID}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "@$TMP_ORDERS_JSON")
rm -f "$TMP_ORDERS_JSON"

if echo "$PATCH_RES" | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if d.get('id') else 1)" 2>/dev/null; then
  echo "orders 集合更新成功"
else
  echo "orders 集合更新失败: $PATCH_RES"
  exit 1
fi

echo ""
echo "[4/4] 更新 dishes 集合 API 规则..."

DISHES_JSON=$(curl -s "${PB_URL}/api/collections/dishes" -H "Authorization: Bearer ${TOKEN}")
DISHES_ID=$(echo "$DISHES_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))")

if [ -n "$DISHES_ID" ]; then
  TMP_DISHES_JSON=$(mktemp)
  cat > "$TMP_DISHES_JSON" << 'JSONEOF'
{
  "listRule": "",
  "viewRule": "",
  "createRule": "@request.auth.id != ''",
  "updateRule": "@request.auth.id != ''",
  "deleteRule": "@request.auth.id != ''"
}
JSONEOF
  curl -s -X PATCH "${PB_URL}/api/collections/${DISHES_ID}" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "@$TMP_DISHES_JSON" > /dev/null
  rm -f "$TMP_DISHES_JSON"
  echo "dishes 集合更新成功"
else
  echo "无法获取 dishes 集合信息，跳过"
fi

echo ""
echo "=========================================="
echo "配置完成！"
echo "=========================================="
echo ""
echo "你现在可以："
echo "1. 打开系统设置 -> 桌号管理 -> 下载点餐二维码"
echo "2. 用手机扫码测试顾客点餐功能"
echo "3. 在订单列表/详情页使用「清台」功能"
echo ""
echo "⚠️ 安全提醒：orders 和 table_status 当前 updateRule 为公开。"
echo "   请在 PocketBase 后台为以下字段设置『仅管理员可更新』："
echo "   orders.totalAmount, orders.finalAmount, orders.discount, orders.status"
echo ""
