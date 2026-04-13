# 贡献指南 (Contributing Guide)

## 开发流程

### 分支策略

- `main`：生产分支，只接受 `develop` 或 hotfix 分支的合并。
- `develop`：日常开发分支，功能完成后合并至此。
- `feature/*`：新功能分支，从 `develop` 切出。
- `fix/*`：Bug 修复分支，从 `develop` 切出。
- `hotfix/*`：紧急生产修复，从 `main` 切出，修复后同时合并回 `main` 和 `develop`。

### 提交规范

- 类型: `feat` / `fix` / `docs` / `style` / `refactor` / `test` / `chore`
- 示例: `feat(orders): 增加订单筛选功能`

### PR 检查清单

创建 PR 前请确认：

- [ ] 代码已通过 `npm run type-check` 和 `npm run test:unit`
- [ ] 所有 Playwright E2E 测试通过（核心流程）
- [ ] 没有引入新的 `console.log` 或调试代码
- [ ] 涉及 UI 的修改已在本地通过视觉检查
- [ ] PR 描述中说明了修改原因和影响范围

### Code Review

- 所有 PR 至少需要 **1 人审批**
- 审批人需检查：业务逻辑正确性、TypeScript 类型安全、重复代码、异常处理
