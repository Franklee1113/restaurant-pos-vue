# 订单餐具功能 - 部署说明

## 功能概述

新增订单餐具选择和计费功能：
- 按人数自动配置餐具数量
- 支持收费餐具（¥2/套）或免费餐具切换
- 支持手动修改餐具数量
- 打印账单显示餐具明细

## 部署步骤

### 1. 部署前端代码

```bash
cd /var/www/restaurant-pos-vue

# 构建项目
npm run build

# 重启 Nginx
sudo systemctl restart nginx
```

### 2. 数据库迁移

将迁移文件复制到 PocketBase 目录：

```bash
# 复制迁移文件
sudo cp pb_migrations/1778270400_add_cutlery_to_orders.js /opt/pocketbase/pb_migrations/

# 重启 PocketBase 服务
sudo systemctl restart pocketbase

# 检查日志确认迁移成功
sudo journalctl -u pocketbase -n 50 | grep Migration
```

预期输出：
```
[Migration] Added 'cutlery' field to orders collection
```

### 3. 功能验证

#### 3.1 新建订单测试
1. 打开「新建订单」页面
2. 选择桌号，输入人数
3. 观察餐具配置区域：
   - 默认显示「收费餐具 ¥2」
   - 数量默认等于人数
   - 显示预计费用
4. 切换为「免费餐具」，观察费用变化
5. 手动修改餐具数量，观察费用计算
6. 提交订单，检查金额是否正确

#### 3.2 编辑订单测试
1. 进入「订单列表」
2. 选择已有订单（含餐具的），点击「编辑」
3. 验证餐具配置正确回填
4. 修改餐具数量或类型
5. 保存，验证修改生效

#### 3.3 打印账单测试
1. 进入订单详情
2. 点击「打印账单」
3. 检查账单是否包含：
   - 餐具明细行（收费餐具显示金额，免费显示"-"）
   - 餐具费用汇总（如有）
   - 正确的合计金额

#### 3.4 后厨单测试
1. 进入订单详情
2. 点击「打印后厨单」
3. 检查是否显示餐具数量

### 4. 回滚方案

如需回滚：

```bash
# 1. 停止 PocketBase
sudo systemctl stop pocketbase

# 2. 删除迁移文件
sudo rm /opt/pocketbase/pb_migrations/1778270400_add_cutlery_to_orders.js

# 3. 恢复前端代码（使用 git 回滚或备份）
cd /var/www/restaurant-pos-vue
git checkout HEAD~1  # 或从备份恢复

# 4. 重新构建
npm run build

# 5. 重启服务
sudo systemctl start pocketbase
sudo systemctl restart nginx
```

## 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `src/schemas/order.schema.ts` | 修改 | 添加 `cutleryConfigSchema` 和 `CutleryType` 枚举 |
| `src/views/OrderFormView.vue` | 修改 | 添加餐具选择 UI 和计算逻辑 |
| `src/utils/printBill.ts` | 修改 | 账单和后厨单显示餐具信息 |
| `pb_migrations/1778270400_add_cutlery_to_orders.js` | 新增 | PocketBase 数据库迁移文件 |

## 数据结构

### 新增字段: `cutlery` (JSON)

```typescript
{
  type: 'free' | 'charged',  // 餐具类型
  quantity: number,          // 数量
  unitPrice: number,         // 单价（分/元）
  totalPrice: number         // 总价
}
```

### 示例数据

```json
{
  "type": "charged",
  "quantity": 4,
  "unitPrice": 2,
  "totalPrice": 8
}
```

## 注意事项

1. **兼容性**: 旧订单没有 `cutlery` 字段，编辑时会自动按人数初始化
2. **金额计算**: 折扣只应用于菜品金额，不应用于餐具费
3. **默认值**: 新建订单默认收费餐具，数量等于人数
4. **权限**: 迁移文件执行需要 PocketBase 管理员权限

## 故障排查

| 问题 | 可能原因 | 解决方案 |
|------|----------|----------|
| 餐具配置不显示 | 迁移文件未执行 | 检查 `/opt/pocketbase/pb_migrations/` 是否有迁移文件，重启 PocketBase |
| 金额计算错误 | 未包含餐具费 | 检查 `orderSummary` computed 是否正确计算 |
| 编辑时餐具数量错误 | 旧数据兼容问题 | 检查加载逻辑是否有 `order.cutlery?.quantity \|\| guests` 兜底 |
| 打印账单无餐具 | printBill.ts 未更新 | 检查 `generateBillHTML` 是否包含餐具逻辑 |

## 联系

如有问题，请联系开发团队。

---

**部署日期**: 2026-04-14  
**版本**: v1.2.0  
**作者**: Kimi
