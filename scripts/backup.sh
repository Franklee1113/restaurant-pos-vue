#!/bin/bash
# =============================================================================
# 智能点菜系统 - PocketBase 数据自动备份脚本
# 用法:
#   手动: ./backup.sh
#   定时: crontab -e
#         0 2 * * * /var/www/restaurant-pos-vue/scripts/backup.sh >> /var/log/pb-backup.log 2>&1
# =============================================================================

set -e

PB_DATA_DIR="/opt/pocketbase/pb_data"
BACKUP_BASE_DIR="/opt/backups/pocketbase"
DATE_STR=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="$BACKUP_BASE_DIR/$DATE_STR"
RETENTION_DAYS=7

# 创建备份目录
mkdir -p "$BACKUP_DIR"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 开始备份 PocketBase 数据..."

# 停止 PocketBase（确保数据一致性，可选；如果数据量大建议用 pb 的 backup API）
# 这里采用热备份：直接复制 pb_data 目录
sudo cp -r "$PB_DATA_DIR" "$BACKUP_DIR/"

# 压缩备份
cd "$BACKUP_BASE_DIR"
tar -czf "${DATE_STR}.tar.gz" "$DATE_STR"
rm -rf "$DATE_STR"

# 计算备份大小
BACKUP_SIZE=$(du -h "${DATE_STR}.tar.gz" | cut -f1)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ 备份完成: ${DATE_STR}.tar.gz (大小: $BACKUP_SIZE)"

# 清理旧备份（保留最近 $RETENTION_DAYS 天）
DELETED=$(find "$BACKUP_BASE_DIR" -name "*.tar.gz" -mtime +$RETENTION_DAYS -print)
if [ -n "$DELETED" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] 🗑️  清理旧备份:"
  echo "$DELETED"
  find "$BACKUP_BASE_DIR" -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete
fi

# 保留最近的 10 个备份（双重保险）
BACKUP_COUNT=$(find "$BACKUP_BASE_DIR" -name "*.tar.gz" | wc -l)
if [ "$BACKUP_COUNT" -gt 10 ]; then
  find "$BACKUP_BASE_DIR" -name "*.tar.gz" -printf '%T@ %p\n' | sort -n | head -n -10 | cut -d' ' -f2- | xargs -r rm -f
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] 🗑️  已保留最新的 10 个备份"
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 备份任务结束"
