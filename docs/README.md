# 智能点菜系统 - 文档索引

> **最后更新**: 2026-04-21  
> **维护规则**: 新增/删除/重命名文档后，必须同步更新本索引

---

## 快速导航

| 我想了解... | 推荐阅读 |
|-------------|---------|
| 项目背景、当前状态、待办事项 | [project-notes.md](project-notes.md) |
| 系统架构、接口规范、数据库设计 | [智能点菜系统-详细设计说明书.md](智能点菜系统-详细设计说明书.md) |
| 部署操作与运维 | [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) |
| 安全基线配置 | [SECURITY.md](SECURITY.md) |
| 版本变更历史 | [CHANGELOG.md](CHANGELOG.md) |
| 开发规范与贡献流程 | [CONTRIBUTING.md](CONTRIBUTING.md) + [AGENTS.md](AGENTS.md) |
| 代码审查与 Bug 根因 | [CODE_CHECKLIST.md](CODE_CHECKLIST.md) |
| 架构优化路线 | [ARCHITECTURE_ROADMAP_20250421.md](ARCHITECTURE_ROADMAP_20250421.md) |

---

## 文档分类

### 📋 项目治理

| 文档 | 用途 | 更新频率 |
|------|------|---------|
| [project-notes.md](project-notes.md) | 项目上下文摘要、断点恢复卡、Agent 协作看板 | 每次重大变更 |
| [AGENTS.md](AGENTS.md) | Agent 行为规范（文档同步强制规则） | 规范变更时 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 开发流程、分支策略、PR 规范 | 流程变更时 |
| [CHANGELOG.md](CHANGELOG.md) | 版本变更记录 | 每次发版 |

### 🏗️ 架构设计

| 文档 | 用途 | 更新频率 |
|------|------|---------|
| [智能点菜系统-详细设计说明书.md](智能点菜系统-详细设计说明书.md) | 系统架构、API 接口、数据库设计、部署架构 | 架构/接口/数据库变更时 |
| [ARCHITECTURE_ROADMAP_20250421.md](ARCHITECTURE_ROADMAP_20250421.md) | 架构优化路线图（P0-P3 优先级） | 每季度评审 |
| [ARCHITECTURE_REVIEW.md](ARCHITECTURE_REVIEW.md) | 模块深度架构洞察 | 架构评审后 |
| [ARCHITECTURE_PROPOSAL_P0-3.md](ARCHITECTURE_PROPOSAL_P0-3.md) | 架构提案（P0-P3 改造方案） | 提案变更时 |

### 💼 业务逻辑

| 文档 | 用途 | 更新频率 |
|------|------|---------|
| [BUSINESS_LOGIC_GOVERNANCE.md](BUSINESS_LOGIC_GOVERNANCE.md) | 业务逻辑治理方案、Bug 根因库 | Bug 治理后 |
| [BUSINESS_PROCESS_FLOW.md](BUSINESS_PROCESS_FLOW.md) | 业务流程图与规则说明 | 业务流程变更时 |

### 🔒 安全与运维

| 文档 | 用途 | 更新频率 |
|------|------|---------|
| [SECURITY.md](SECURITY.md) | 安全基线、认证机制、Nginx 安全配置 | 安全策略变更时 |
| [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) | 部署操作手册、回滚指南 | 部署流程变更时 |
| [RETIREMENT_PLAN.md](RETIREMENT_PLAN.md) | 旧系统下线与归档计划 | 下线里程碑时 |

### 🧪 质量保障

| 文档 | 用途 | 更新频率 |
|------|------|---------|
| [CODE_CHECKLIST.md](CODE_CHECKLIST.md) | 代码检查清单与 Bug 根因库 | 每次 Bug 修复后 |
| [feature-checklist.md](feature-checklist.md) | 功能开发完成自检清单 | 新增检查项时 |
| [CODE_AUDIT_REPORT.md](CODE_AUDIT_REPORT.md) | 全系统代码审核报告（最新版） | 审计后 |
| [TEST_CASE_MINDMAP.md](TEST_CASE_MINDMAP.md) | 测试案例思维导图 | 测试策略变更时 |
| [TEST_COVERAGE_REPORT.md](TEST_COVERAGE_REPORT.md) | 测试覆盖率报告 | 每次补测后 |

### 🍲 功能方案

| 文档 | 用途 | 更新频率 |
|------|------|---------|
| [sold-out-feature.md](sold-out-feature.md) | 沽清功能方案设计说明书 + 架构审查结论（已合并） | 功能变更时 |

---

## 文档命名规范

为保持索引一致性，所有文档遵循以下命名规则：

- **项目治理类**: 小写英文，中划线连接（如 `project-notes.md`）
- **架构类**: 大写英文，中划线连接（如 `ARCHITECTURE_ROADMAP_20250421.md`）
- **功能方案类**: 英文小写，中划线连接（如 `sold-out-feature.md`）
- **报告类**: 大写英文 + 日期后缀（如 `CODE_AUDIT_REPORT.md`，旧版归档删除）

---

## 变更记录

| 日期 | 变更内容 |
|------|---------|
| 2026-04-21 | 初始版本，整理 21 个文档，建立分类索引 |
| 2026-04-21 | 文档整理方案A执行：根目录文件移入docs/；删除过时文档；重命名CHECKLIST.md；创建索引 |
| 2026-04-21 | 沽清功能文档合并：`SOLD_OUT_FEATURE_SPEC.md` + `沽清功能方案设计说明书.md` + `沽清功能架构审查报告.md` → `sold-out-feature.md` |
