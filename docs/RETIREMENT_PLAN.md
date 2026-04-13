# 智能点菜系统 - 旧系统下线与归档计划

> **原系统**: `/var/www/restaurant-pos` (原生 JavaScript SPA)  
> **新系统**: `/var/www/restaurant-pos-vue` (Vue 3 + Vite)  
> **日期**: 2026-04-13

---

## 一、下线标准（必须全部满足）

- [x] 新系统所有页面功能开发完成
- [ ] 新系统内部试用 3 天无 P0/P1 级 Bug
- [ ] E2E 测试覆盖核心流程（登录→建单→改状态→打印）
- [ ] 生产环境部署并稳定运行 7 天
- [ ] 团队全员熟悉新系统的基本运维操作

---

## 二、下线检查清单

### 数据层面
- [ ] 确认新系统与旧系统共用同一个 PocketBase 数据库
- [ ] 确认下线旧系统不会导致任何数据丢失
- [ ] 确认旧系统的 `.bak` 文件已清理（已在新项目 baseline 时完成）

### 部署层面
- [ ] 确认 Nginx 已指向新系统的 `dist/` 构建产物
- [ ] 确认旧系统最终备份已生成：`/var/www/restaurant-pos-legacy-v2.0.tar.gz`
- [ ] 确认回滚方案文档已同步给运维人员

### 代码层面
- [ ] 确认旧系统 Git 仓库 `main` 分支有完整的最终版本标签：`v2.0-legacy-final`
- [ ] 确认新系统 Git 仓库已推送到远程（GitHub/GitLab）
- [ ] 确认 CI/CD 流程已切换为新项目

---

## 三、归档操作步骤

```bash
# 1. 创建旧系统最终归档包
cd /var/www
sudo tar -czf restaurant-pos-legacy-v2.0.tar.gz \
  --exclude='node_modules' \
  --exclude='coverage' \
  restaurant-pos/

# 2. 移动到归档目录
sudo mkdir -p /opt/archives
sudo mv restaurant-pos-legacy-v2.0.tar.gz /opt/archives/

# 3. 给旧系统代码打最终标签
cd /var/www/restaurant-pos
git tag -a v2.0-legacy-final -m "旧系统最终版本 - 下线归档"

# 4. 保留旧系统目录（只读），或直接删除源码保留归档包
# 推荐做法：保留目录但设置为只读，防止误修改
sudo chmod -R 555 /var/www/restaurant-pos
# 或：如果磁盘紧张，可删除旧源码只保留 tar.gz
# sudo rm -rf /var/www/restaurant-pos
```

---

## 四、回滚能力保留

即使旧系统下线，也必须保留**72 小时内**的回滚能力：

```bash
# 回滚命令（保存到运维手册中）
sudo systemctl stop nginx
sudo rm -rf /var/www/restaurant-pos
cd /var/www
sudo tar -xzf /opt/archives/restaurant-pos-legacy-v2.0.tar.gz
sudo mv restaurant-pos restaurant-pos-rollback
sudo cp -r restaurant-pos-rollback /var/www/restaurant-pos
sudo systemctl start nginx
```

---

## 五、后续维护策略

| 事项 | 处理方式 |
|------|----------|
| 新功能开发 | 只在新系统 `restaurant-pos-vue` 中进行 |
| Bug 修复 | 紧急 Bug 双版本评估，优先在新系统修复 |
| 安全补丁 | 必须在新系统修复并部署 |
| 代码审查 | 所有修改走 `feature/*` → `develop` → `main` PR 流程 |

---

## 六、责任人

- **技术负责人**: 审批下线计划，确认回滚方案
- **前端开发**: 确保新系统功能 100% 对齐旧系统
- **运维人员**: 执行部署和归档操作，验证 Nginx 配置

---

**只有当上方的所有检查项都勾选完成后，才能执行旧系统的最终下线操作。**
