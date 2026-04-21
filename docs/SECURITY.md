# 智能点菜系统 - 安全配置说明

> **版本**: v1.0  
> **更新日期**: 2026-04-13  
> **适用范围**: PocketBase BaaS + Nginx 反向代理

---

## 1. 数据库访问权限规则

PocketBase 集合已配置基于认证的访问控制，迁移文件位置：
`/opt/pocketbase/pb_migrations/1775650000_security_rules.js`

### 1.1 规则总览

| 集合 | listRule | viewRule | createRule | updateRule | deleteRule |
|------|----------|----------|------------|------------|------------|
| `orders` | `@request.auth.id != ''` | `@request.auth.id != ''` | `@request.auth.id != ''` | `@request.auth.id != ''` | `@request.auth.id != ''` |
| `dishes` | `@request.auth.id != ''` | `@request.auth.id != ''` | `@request.auth.id != ''` | `@request.auth.id != ''` | `@request.auth.id != ''` |
| `settings` | `@request.auth.id != ''` | `@request.auth.id != ''` | `@request.auth.id != ''` | `@request.auth.id != ''` | `@request.auth.id != ''` |
| `users` | `id = @request.auth.id` | `id = @request.auth.id` | — | `id = @request.auth.id` | `id = @request.auth.id` |

### 1.2 规则说明

- **orders / dishes / settings**：仅允许已登录用户进行全操作。当前系统为单店内部使用，所有登录员工拥有同等数据权限。
- **users**：用户只能查看和修改自己的账户信息，防止用户枚举其他用户数据。

### 1.3 如何验证

```bash
# 连接 PocketBase 数据库查看规则
sqlite3 /opt/pocketbase/pb_data/data.db \
  "SELECT name, listRule, viewRule, createRule, updateRule, deleteRule FROM _collections;"
```

---

## 2. Nginx 安全响应头

当前生产环境 Nginx 配置已包含以下安全头：

| 响应头 | 值 | 作用 |
|--------|-----|------|
| `X-Frame-Options` | `SAMEORIGIN` | 防止点击劫持 |
| `X-Content-Type-Options` | `nosniff` | 防止 MIME 嗅探 |
| `X-XSS-Protection` | `1; mode=block` | 浏览器 XSS 过滤 |
| `Cache-Control` | `no-cache, no-store, must-revalidate` | 防止敏感数据缓存 |

---

## 3. 前端安全策略

### 3.1 XSS 防护
- 所有动态内容通过 Vue 模板自动转义，禁止直接操作 `innerHTML` 插入用户输入。
- `utils/security.ts` 提供 `escapeHtml()` 作为兜底方案。

### 3.2 认证安全
- JWT Token 存储于 `localStorage`，通过 Bearer Token 发送。
- 路由守卫 (`router.beforeEach`) 拦截未认证访问。
- API 层统一检查 401 状态，自动跳转登录页。

### 3.3 金额安全
- `MoneyCalculator` 使用定点数计算，避免浮点精度问题。

---

## 4. 已知安全缺陷（待修复）

### 4.1 后端 Filter 注入风险（🔴 P0）

`server/src/services/*.ts` 中存在多处 PocketBase filter 字符串拼接，未对参数进行转义：

```typescript
// dish.service.ts:40
const filter = ids.map((id) => `id='${id}'`).join(' || ')
// table-status.service.ts:19
filter: `tableNo='${tableNo}'`
```

**风险**：攻击者可构造恶意参数绕过查询条件，读取全量数据。  
**修复方案**：所有 filter 拼接必须使用 `escapePbString()` 转义，或改用参数化查询。

### 4.2 公共 API Admin Token 无自动刷新（🟡 P1）

`server/src/plugins/pocketbase.ts` 中的 `adminToken` 在服务启动后永久保存。PocketBase Token 默认 14 天过期，过期后所有公共 API 调用将持续失败，需手动重启服务恢复。

**修复方案**：增加定时刷新机制或过期前主动续约。

### 4.3 生产环境 HTTP 明文传输（🔴 P0）

生产环境当前使用 HTTP 明文传输，JWT Token、订单数据、支付二维码全部暴露。

**修复方案**：申请 Let's Encrypt 证书，Nginx 强制 80→443 跳转。

## 5. 后续安全待办

- [ ] 启用 HTTPS（SSL/TLS 证书）
- [ ] 清理历史 commit 中的明文密码（BFG Repo-Cleaner）
- [ ] PocketBase Admin 面板限制 IP 访问（`/_/`）
- [ ] 定期轮换管理员密码
- [ ] 引入角色权限模型（admin / waiter / kitchen）
- [ ] 考虑为 `settings` 集合增加管理员角色限制
