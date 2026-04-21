# 检查点 — 2026-04-21 18:05 CST

## 当前会话摘要

本次会话完成了 E2E 测试修复、文档更新和生产部署。

---

## 修改文件清单

### 新增文件
| 文件 | 说明 |
|------|------|
| `AGENTS.md` | AI 助手项目指南（构建、测试、部署流程） |

### 修改文件
| 文件 | 修改内容 |
|------|----------|
| `README.md` | 全面重写：更新技术栈、补充顾客端/KDS/沽清功能、新增部署说明和架构图 |
| `src/views/CustomerOrderView.vue` | **BUG 修复**：恢复已有订单时未关闭人数选择弹窗（添加 `showGuestSetup.value = false`） |
| `src/composables/__tests__/useClearTable.spec.ts` | 修复 `mockResolvedValue(undefined)` 类型不匹配（4处） |
| `src/views/__tests__/OrderFormView.spec.ts` | 修复 `useRoute` mock 返回值缺少字段 |
| `e2e/customer-order-flow.spec.ts` | 修复 test4：订单状态流转到 dining（非 completed）后顾客追加菜品 |
| `e2e/dish-management.spec.ts` | 修复 hidden 元素和 strict mode 定位问题 |
| `e2e/kitchen-display.spec.ts` | 修复 `text=制作中` strict mode violation |
| `e2e/login.spec.ts` | 错误提示从"失败"改为"Failed"（PocketBase 返回英文） |
| `e2e/order-detail.spec.ts` | 返回按钮测试改为从真实订单列表进入 |
| `e2e/order-flow.spec.ts` | 修复多处 CSS 选择器、路由匹配、添加 `beforeAll` 桌台清理 |
| `e2e/settings.spec.ts` | 修复 strict mode：菜品分类 heading 和添加按钮定位 |
| `e2e/helpers/api-client.ts` | 新增 `getAllTableStatuses()` 方法 |

### 未修改但相关的文件
- `server/src/services/dish.service.ts` → `server/dist/services/dish.service.js`（前期已修复 soldOut 字段缺失并 rebuild）
- `src/config/dish.config.ts`（前期已添加"汤"分类）

---

## E2E 测试状态

```
总用例: 29 (含 1 setup)
通过: 27 ✅
跳过: 2 ⏭️（条件跳过：无订单/无菜品时）
失败: 0 ❌
总耗时: ~58 秒 (chromium, workers=1)
```

### 各文件通过情况
| 测试文件 | 用例数 | 状态 |
|----------|--------|------|
| `auth.setup.ts` | 1 | ✅ |
| `clear-table-integration.spec.ts` | 5 | ✅ |
| `customer-order-flow.spec.ts` | 4 | ✅ |
| `dish-management.spec.ts` | 3 | ✅ |
| `kitchen-display.spec.ts` | 3 | ✅ |
| `login.spec.ts` | 3 | ✅ |
| `order-detail.spec.ts` | 3 | 2 skip, 1 pass |
| `order-flow.spec.ts` | 2 | ✅ |
| `settings.spec.ts` | 2 | ✅ |
| `sold-out-sync.spec.ts` | 3 | ✅ |

---

## 生产部署状态

### 部署时间
2026-04-21 18:04 CST

### 部署内容
- 前端构建产物同步到 `/var/www/restaurant-pos/`
- 后端 `server/dist/` 已重新编译
- Public API 服务已重启（PID 37631）

### 备份位置
```
/var/www/restaurant-pos-backup-20260421-180452
```

### 服务健康检查
| 服务 | 端点 | 状态 |
|------|------|------|
| Nginx | http://127.0.0.1/ | HTTP 200 ✅ |
| Public API | http://127.0.0.1:3000/health | HTTP 200 ✅ |
| PocketBase | http://127.0.0.1:8090/api/health | HTTP 200 ✅ |
| 菜品接口 | /api/public/dishes | HTTP 200 ✅ |

### 运行进程
```
nginx: master + 4 workers (PID 4066240)
pocketbase serve --http=127.0.0.1:8090 (PID 4090425)
node dist/index.js (PID 37631, /var/www/restaurant-pos-vue/server)
```

---

## 已知问题 / 待办

### E2E 测试缺口（低优先级）
1. **数据统计页未覆盖 E2E**：`/statistics` 路由无测试（营业额图表、订单统计）
2. **编辑订单未覆盖 E2E**：`/edit-order/:id` 无端到端测试
3. **蓝牙打印未覆盖**：`useBluetoothPrinter` 未在 E2E 中测试

### 中风险优化项（已制定方案，待执行）
详见 `docs/OPTIMIZATION_PLAN_20250421.md`

4. **CI 中 ESLint 被注释**：`.github/workflows/ci.yml` 第 49-51 行 ESLint 步骤被注释，代码风格无 CI 门禁。需修复 `eslint.config.js` 的 `pb_hooks/` 和 `public/sw.js` 全局变量配置后恢复。
5. **`views/` 单元测试覆盖率偏低**：分支 66.71%，函数 63.14%。顾客端支付/加菜、订单列表筛选/清台/打印、表单搜索/预览等路径未覆盖。
6. **缺少覆盖率阈值门禁**：`vitest.config.ts` 无 `coverage.thresholds`，覆盖率可下滑。建议 thresholds: statements 80, branches 70, functions 70, lines 85。
7. **`api/` 分支覆盖率 72.41%**：`pocketbase.ts` 网络异常（HTTP 500/403/超时）和 SSE 降级分支未覆盖。

### 前端类型检查
8. **前端类型检查残留**：`vue-tsc` 已通过（本次修复了测试文件类型错误）

---

## 回滚命令

```bash
# 前端回滚
sudo rsync -av --delete /var/www/restaurant-pos-backup-20260421-180452/ /var/www/restaurant-pos/
sudo systemctl reload nginx

# 后端回滚（如需要重建旧版 server/dist）
# git checkout HEAD~1 -- server/src/
# cd server && npm run build
```

---

## Git 状态

```
当前 commit: b2e566c
docs: 文档治理 + E2E 测试补全 + README 重写（2026-04-21）

修改: README.md, playwright/.auth/user.json,
      src/composables/__tests__/useClearTable.spec.ts,
      src/views/__tests__/OrderFormView.spec.ts

未跟踪: AGENTS.md
```

---

*检查点由 Kimi Code CLI 生成 — 2026-04-21 18:05 CST*
