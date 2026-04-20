# 智能点菜系统 - 代码检查清单

> **使用说明**: 在开发各阶段对照检查，确保不重复出现已知缺陷
> 
> 🟥 必须检查（阻塞性问题） | 🟨 建议检查（技术债务） | 🟩 可选优化

---

## 一、编码前准备

### 🟥 安全规范
- [ ] 熟悉 `utils/security.js` 中的转义函数使用方法
- [ ] 了解当前页面的用户输入点（表单、URL参数、API返回）
- [ ] 确认数据库权限规则已配置（`@request.auth.id != ''`）

### 🟨 架构规范
- [ ] 检查是否已有类似功能的工具函数（避免重复代码）
- [ ] 确认常量定义在 `constants/` 目录，避免魔法字符串
- [ ] 状态管理：确认数据应该放在组件还是全局 Store

---

## 二、编码中检查

### 🟥 安全类 - 绝对禁止

#### XSS 防护
```javascript
// ❌ 禁止 - 直接插入用户输入
element.innerHTML = `<div>${userInput}</div>`;
document.write(userContent);

// ✅ 必须 - 使用转义函数
import { escapeHtml } from '../utils/security.js';
element.innerHTML = `<div>${escapeHtml(userInput)}</div>`;

// ✅ 或 - 使用 textContent（纯文本场景）
element.textContent = userInput;
```
- [ ] 所有用户输入数据插入 DOM 前都经过 `escapeHtml()` 处理
- [ ] 使用 `textContent` 代替 `innerHTML`（纯文本场景）
- [ ] 属性值使用模板字符串时也需转义：`data-id="${escapeHtml(id)}"`

#### 数据库权限
- [ ] 新集合必须配置访问规则（`@request.auth.id != ''`）
- [ ] 迁移文件放在 `/opt/pocketbase/pb_migrations/`
- [ ] 敏感操作（删除、修改他人数据）需额外权限校验

---

### 🟥 稳定性类 - 必须遵守

#### 内存泄漏防护
```javascript
class MyComponent {
  constructor() {
    this.abortController = null;
  }

  // ✅ 必须：提供 cleanup 方法
  cleanup() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  render() {
    this.cleanup(); // ✅ 必须：render 前先清理
    this.abortController = new AbortController();
    const { signal } = this.abortController;
    
    // 所有事件监听必须传入 signal
    element.addEventListener('click', handler, { signal });
    element.addEventListener('change', handler, { signal });
  }
}
```
- [ ] 组件类必须有 `cleanup()` 方法
- [ ] `render()` / `init()` 开头必须调用 `cleanup()`
- [ ] 所有 `addEventListener` 必须传入 `{ signal }` 选项
- [ ] `setInterval` / `setTimeout` 必须在 `cleanup()` 中清除

#### API 错误处理
```javascript
// ❌ 禁止 - 不检查响应状态
const data = await fetch(url).then(r => r.json());

// ✅ 必须 - 统一错误处理
try {
  const response = await fetch(url, options);
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new APIError(errorData.message, response.status, errorData);
  }
  
  return await response.json();
} catch (error) {
  console.error('API Error:', error);
  showToast(error.message, 'error');
  throw error; // 继续抛出供上层处理
}
```
- [ ] 所有 `fetch` 调用必须检查 `response.ok`
- [ ] 错误必须有用户提示（Toast/Modal）
- [ ] 网络超时必须处理（使用 `fetchWithTimeout`）

---

### 🟥 精度类 - 金额计算

```javascript
// ❌ 禁止 - 浮点数直接计算
const total = items.reduce((sum, item) => 
  sum + item.price * item.quantity, 0);
// 结果可能是 0.30000000000000004

// ✅ 必须 - 使用 MoneyCalculator
import { MoneyCalculator } from '../utils/security.js';
const result = MoneyCalculator.calculate(items, discount);
// 或使用整数分计算
const totalCents = items.reduce((sum, item) => 
  sum + Math.round(item.price * 100) * item.quantity, 0);
const total = totalCents / 100; // 精确结果
```
- [ ] 所有金额计算必须使用 `MoneyCalculator`
- [ ] 数据库存储金额统一用 `分` 为单位
- [ ] 显示时转换为元，保留 2 位小数

---

### 🟨 代码质量类 - 建议遵守

#### 避免魔法字符串
```javascript
// ❌ 不好 - 魔法字符串
if (status === 'cooking') { ... }

// ✅ 好 - 使用常量
import { OrderStatus } from '../constants/orderStatus.js';
if (status === OrderStatus.COOKING) { ... }
```
- [ ] 状态值使用 `OrderStatus` 枚举
- [ ] API 路径使用配置文件 `config/api.js`
- [ ] 错误码统一在 `constants/errors.js` 定义

#### 工具函数复用
```javascript
// ❌ 不好 - 每个页面重复实现
showToast(message, type) {
  const toast = document.createElement('div');
  // ... 重复代码
}

// ✅ 好 - 使用统一工具
import { showToast } from '../utils/toast.js';
showToast('操作成功', 'success');
```
- [ ] Toast 提示使用 `utils/toast.js`
- [ ] API 调用使用 `api/pocketbase.js` 封装方法
- [ ] 防抖/节流使用 `utils/debounce.js`

#### 输入验证
```javascript
// ✅ 必须 - 表单提交前验证
function validateOrder(order) {
  if (!order.tableNo?.trim()) {
    throw new ValidationError('桌号不能为空');
  }
  if (!order.items?.length) {
    throw new ValidationError('订单不能为空');
  }
  if (order.discount < 0 || order.discount > 10000) {
    throw new ValidationError('折扣金额无效');
  }
  return true;
}
```
- [ ] 表单提交前必须有验证
- [ ] 验证失败必须有明确的错误提示
- [ ] 服务端也需做同样的验证（不信任前端）

---

## 三、自测检查

### 🟥 功能测试
- [ ] 正常流程可完成（如：创建订单 → 查看列表 → 修改状态）
- [ ] 边界条件处理（空数据、超大金额、特殊字符）
- [ ] 错误场景有提示（网络断开、权限不足、数据不存在）

### 🟥 安全测试
- [ ] XSS 测试：输入 `<img src=x onerror=alert(1)>` 不会执行
- [ ] SQL 注入测试：输入 `' OR 1=1 --` 不会异常
- [ ] 权限测试：未登录无法访问数据，普通用户无法删除他人订单

### 🟥 性能测试
- [ ] 快速切换页面 10 次，内存无持续增长（Chrome DevTools Memory）
- [ ] 列表页快速翻页，无卡顿
- [ ] 表单提交有 Loading 状态，防止重复提交

---

## 四、提交前检查

### 🟥 代码检查
```bash
# 1. 搜索危险代码（在项目根目录执行）
grep -r "innerHTML.*\${" --include="*.js" src/ || echo "✅ 无危险 innerHTML"
grep -r "\.addEventListener" --include="*.js" src/ | grep -v "signal" | grep -v "removeEventListener" || echo "✅ 事件监听都有 signal"

# 2. 检查魔法字符串
grep -r "=== 'pending'" --include="*.js" src/ || echo "✅ 无魔法字符串 pending"
grep -r "=== 'cooking'" --include="*.js" src/ || echo "✅ 无魔法字符串 cooking"

# 3. 检查金额计算
grep -r "\.reduce.*price.*\*" --include="*.js" src/ || echo "✅ 使用 MoneyCalculator"
```
- [ ] 运行上述命令检查危险代码
- [ ] 无 `console.log` 调试代码（生产环境）
- [ ] 无注释掉的死代码

### 🟥 文件检查
- [ ] 新增文件在正确目录（页面放 `pages/`，工具放 `utils/`）
- [ ] 敏感配置未提交（API 密钥、数据库密码）
- [ ] 数据库迁移文件已创建（如修改了集合结构）

---

## 五、Code Review 检查清单

### Reviewer 必须检查项

| 检查项 | 优先级 | 检查方法 |
|--------|--------|----------|
| XSS 风险 | 🟥 P0 | 搜索 `innerHTML`、`document.write` |
| 内存泄漏 | 🟥 P0 | 检查 `addEventListener` 是否有 `signal` |
| 错误处理 | 🟥 P0 | 检查 `fetch` 是否有 `response.ok` 判断 |
| 金额精度 | 🟥 P0 | 检查是否使用 `MoneyCalculator` |
| 数据库变更 | 🟥 P0 | Schema 变更是否有对应迁移文件 |
| 数据一致性 | 🟥 P0 | 编辑时是否正确回填所有字段（含新字段） |
| 魔法字符串 | 🟨 P1 | 检查状态值是否使用常量枚举 |
| 代码重复 | 🟨 P1 | 类似功能是否已存在工具函数 |
| 边界处理 | 🟨 P1 | 空数据、异常输入的处理 |
| 打印模板 | 🟨 P1 | 新费用项是否在账单中显示 |
| 命名规范 | 🟩 P2 | 函数/变量命名是否清晰 |

### Review 意见模板
```markdown
## Review 结果

### 🟥 必须修复（阻塞合并）
- [ ] 第 X 行：`innerHTML` 未转义，需使用 `escapeHtml()`
- [ ] 第 X 行：事件监听缺少 `{ signal }`

### 🟨 建议优化（非阻塞，可后续处理）
- [ ] 第 X 行：建议使用 `OrderStatus.PENDING` 代替 `'pending'`
- [ ] 第 X 行：该功能已有 `utils/toast.js` 封装

### ✅ 好评
- 错误处理完善，用户体验好
- 组件结构清晰，易于维护
```

---

## 六、快速参考卡

### 常用安全导入
```javascript
// 安全工具
import { escapeHtml, MoneyCalculator, sanitizeInput } from '../utils/security.js';

// 常量
import { OrderStatus, PaymentStatus } from '../constants/orderStatus.js';
import { CutleryType } from '../schemas/order.schema.js';  // 餐具类型
import { API_BASE } from '../config/api.js';

// 工具
import { showToast, showLoading, hideLoading } from '../utils/toast.js';
import { debounce, throttle } from '../utils/debounce.js';
import { fetchWithTimeout, APIError } from '../api/pocketbase.js';
```

### 组件模板
```javascript
import { escapeHtml } from '../utils/security.js';

export class MyComponent {
  constructor() {
    this.abortController = null;
    this.container = null;
  }

  cleanup() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  async render(container) {
    this.cleanup();
    this.container = container;
    this.abortController = new AbortController();
    const { signal } = this.abortController;

    try {
      // 渲染逻辑
    } catch (error) {
      console.error('Render error:', error);
      showToast('渲染失败', 'error');
    }
  }
}
```

---

## 七、常见错误速查

| 错误现象 | 可能原因 | 解决方案 |
|----------|----------|----------|
| 页面越用越卡 | 内存泄漏 | 检查 `addEventListener` 是否清理 |
| 弹窗显示 `<img>` 代码 | XSS 未转义 | 使用 `escapeHtml()` |
| 金额 19.99 显示为 19.98 | 浮点精度 | 使用 `MoneyCalculator` |
| API 报错无提示 | 未处理 `response.ok` | 添加错误处理和 Toast |
| 状态判断失效 | 魔法字符串拼写错误 | 使用 `OrderStatus` 常量 |
| 快速点击重复提交 | 无 Loading/防抖 | 添加 `showLoading` 或 `debounce` |
| 页面闪一下就消失 | 路由参数丢失，hash 与参数不一致 | `navigate()` 设置 hash 时必须携带参数 |
| 编辑/查看按钮跳转后回退 | `hashchange` 解析不到 orderId | 确保 URL hash 和事件参数一致 |
| ECharts 图表空白不渲染 | Vue 模板 ref 绑定对象嵌套属性 | 模板 ref 必须是独立变量，不支持 `ref="obj.prop"` |
| 弹窗/Toast 样式突兀 | 使用原生 `alert/confirm` | 统一使用 `useToast()` + `useConfirm()` |
| 轮询导致内存泄漏 | `setInterval` 未在 unmount 清理 | 组件销毁时必须 `clearInterval` |
| 厨房大屏无提示音 | Web Audio API 兼容性问题 | 使用 `AudioContext || webkitAudioContext` 兜底 |
| 订单金额缺少餐具费 | 未包含附加费用计算 | 使用 `orderSummary` 汇总所有费用项 |
| 编辑订单餐具数量错误 | 未正确处理旧订单数据兼容 | 加载时检查字段是否存在：`order.cutlery?.quantity \|\| guests` |
| 打印账单不显示餐具 | 打印模板未读取 cutlery 字段 | 更新 `generateBillHTML()` 包含餐具明细 |

---

**清单版本**: v1.2  
**最后更新**: 2026-04-14  
**适用范围**: 智能点菜系统前端开发

---

## 八、版本历史与更新规范

> **原则**: 每次出现生产环境缺陷或 Bug 修复后，必须更新此清单，防止重复踩坑

### 更新流程

```
发现 Bug / 生产缺陷
        │
        ▼
┌─────────────────┐
│ 1. 修复 Bug      │
└─────────────────┘
        │
        ▼
┌─────────────────┐
│ 2. 根因分析      │ ◄── 为什么会发生？如何预防？
└─────────────────┘
        │
        ▼
┌─────────────────┐
│ 3. 更新检查清单   │ ◄── 添加新的检查项和案例
└─────────────────┘
        │
        ▼
┌─────────────────┐
│ 4. 团队同步      │ ◄── 在站会/群聊中告知更新内容
└─────────────────┘
```

### 更新模板

发现新问题时，按以下格式添加到对应章节：

```markdown
#### 🟥 BUG-XXX: [问题简述]
**发现日期**: YYYY-MM-DD  
**发现人**: XXX  
**根因**: [为什么发生]  
**修复方案**: [如何解决]  
**检查方法**: [如何验证]

```javascript
// ❌ 错误代码（导致问题的代码）
...

// ✅ 正确代码（修复后的代码）
...
```

- [ ] 检查项 1
- [ ] 检查项 2
```

---

### 更新记录

| 版本 | 日期 | 更新人 | 更新内容 |
|------|------|--------|----------|
| v1.6 | 2026-04-20 | Kimi | P0 修复：KDS 过滤条件、桌台重复开台、状态回退非法流转、按钮文案优化、自动刷新、部署健壮性 |
| v1.5 | 2026-04-19 | 架构师 | P0 安全漏洞集中修复：Filter 注入、XSS 绕过、金额篡改、竞态条件、折扣 0 值、统计截断 |
| v1.4 | 2026-04-17 | 架构师 | 新增餐具费定价改造检查项：单价必须从菜品维护读取，前端不展示餐具选择 UI |
| v1.3 | 2026-04-17 | 架构师 | 新增业务逻辑后端托管检查项，P0 修复：金额计算、状态机、table_status 同步迁后端 |
| v1.2 | 2026-04-14 | Kimi | 新增餐具功能检查项，支持订单餐具选择和计费 |
| v1.1 | 2026-04-13 | Kimi | 新增路由参数一致性检查项，修复编辑订单页面闪退问题 |
| v1.0 | 2026-04-13 | 架构师 | 初始版本，汇总 7 个安全问题、3 个严重代码缺陷 |

### 详细更新日志

#### v1.4 (2026-04-17) - 餐具费定价改造
**背景**: 员工端餐具单价写死为 ¥2/套，与菜品维护不同步；顾客端将餐具混入 `items` 数组，前后端逻辑不统一；前端展示了餐具配置导致顾客可感知系统自动加餐具的行为。

**新增检查项**:
1. **餐具单价必须从菜品维护读取**：`dishes` 集合中 `category === '餐具'` 的菜品 `price` 即为餐具单价，禁止前端写死任何定价
2. **前端不得展示餐具选择 UI**：员工端删除 `CutleryConfigPanel` 和折叠配置面板；顾客端购物车中不得出现餐具 item
3. **餐具数据统一使用 `cutlery` 字段**：禁止将餐具作为普通菜品混入 `items` 数组传入后端
4. **后端金额计算必须包含 `cutlery.totalPrice`**：`pb_hooks/orders.pb.js` 在计算订单总金额时，需将 `cutlery.totalPrice` 加入 `totalAmount`

**涉及文件**:
- `src/views/OrderFormView.vue` - 删除餐具配置面板，单价从 dishes 读取
- `src/views/CustomerOrderView.vue` - 购物车不再展示餐具，提交时以 `cutlery` 字段传入

---

#### v1.3 (2026-04-17) - 业务逻辑后端托管 (P0 修复)
**背景**: 经架构评审发现，订单状态流转、金额计算、table_status 同步等关键业务逻辑全部托管在前端，存在严重并发覆盖风险（两个浏览器同时操作同一订单会导致数据不一致）。

**新增检查项**:
1. **核心金额计算必须在后端执行**：前端可计算用于展示，但后端 `onRecordBeforeCreateRequest` / `onRecordBeforeUpdateRequest` 必须重新计算并覆盖 `totalAmount` / `discount` / `finalAmount`
2. **状态机必须由后端维护**：`orders` collection 的 update hook 必须根据 `items` 的 `status` 变化自动推断整体订单状态，并校验状态流转合法性
3. **table_status 不得由前端直接同步**：订单创建后自动开台、订单完成后自动清台，必须通过 `onRecordAfterCreateRequest` / `onRecordAfterUpdateRequest` 实现
4. **前端不再做分布式事务**：禁止前端 `GET -> 修改 -> PATCH` 的模式来处理业务状态

**涉及文件**:
- `pb_hooks/orders.pb.js` - 后端核心钩子（金额、状态机、table_status 同步）
- `src/api/pocketbase.ts` - 简化 `updateOrderItemStatus` / `appendOrderItems`
- `src/views/CustomerOrderView.vue` - 移除手动同步 table_status 的冗余代码

---

#### v1.2 (2026-04-14) - 订单餐具功能
**背景**: 新增订单餐具选择功能，支持按人数默认配置餐具，可选择免费/收费餐具

**新增检查项**:
1. 新功能涉及数据库 Schema 变更时，必须创建 PocketBase 迁移文件
2. 订单金额计算必须包含餐具费用（如选择收费餐具）
3. 打印账单必须显示餐具明细
4. 编辑订单时必须正确回填餐具配置

**数据库变更**:
- orders 集合新增 `cutlery` JSON 字段，结构：`{ type, quantity, unitPrice, totalPrice }`
- 迁移文件：`pb_migrations/1778270400_add_cutlery_to_orders.js`

**涉及文件**:
- `src/schemas/order.schema.ts` - 添加餐具配置 Schema
- `src/views/OrderFormView.vue` - 餐具选择 UI 和计算逻辑
- `src/utils/printBill.ts` - 账单打印显示餐具信息

---

#### v1.1 (2026-04-13) - 路由参数一致性
**背景**: 订单列表点击「编辑」按钮后页面闪退，根因是路由导航时未将参数同步到 URL hash

**新增检查项**:
1. 路由导航时必须同步参数到 URL hash
2. `hashchange` 监听必须与 `navigate()` 的 hash 设置逻辑保持一致

**参考修复**:
- `app.js` `Router.navigate()` 中设置 hash 时携带参数：`window.location.hash = \`${page}/${params.orderId}\``

---

#### v1.0 (2026-04-13) - 初始版本
**背景**: 安全修复和代码评审后，总结历史问题形成检查清单

**新增检查项**:
1. XSS 防护 - `innerHTML` 必须转义
2. 内存泄漏 - `addEventListener` 必须带 `signal`
3. API 错误处理 - 必须检查 `response.ok`
4. 金额精度 - 必须使用 `MoneyCalculator`
5. 魔法字符串 - 必须使用常量枚举
6. 数据库权限 - 新集合必须配置规则

**参考文档**:
- 安全修复报告.md
- 技术选型与代码评审报告.md
- 权限诊断报告.md

---

## 九、Bug 根因分析库

> 记录每个生产环境 Bug 的详细分析，用于复盘和学习

### 模板

```markdown
### BUG-XXX: [标题]
- **发现时间**: 
- **发现人**: 
- **影响范围**: 
- **严重程度**: 🔴 P0 / 🟡 P1 / 🟢 P2

#### 问题描述
[发生了什么]

#### 复现步骤
1. 
2. 
3. 

#### 根因分析
[为什么会发生 - 技术原因 + 流程原因]

#### 修复方案
[如何解决]

#### 预防措施
[检查清单中添加的项]

#### 相关提交
- 修复 PR: #XXX
- 检查清单更新: #XXX
```

### 历史 Bug 库（示例）

#### BUG-001: XSS 漏洞 - 菜品名称可执行脚本
- **发现时间**: 2026-04-10
- **发现人**: 架构师
- **影响范围**: 订单列表、创建订单页面
- **严重程度**: 🔴 P0

#### 问题描述
用户输入的菜品名称如果包含 `<img src=x onerror=alert(1)>`，会直接执行脚本，可窃取用户 Cookie 或进行钓鱼攻击。

#### 根因分析
1. **技术原因**: 使用 `innerHTML` 直接拼接用户输入数据，未做转义
2. **流程原因**: 缺乏代码审查清单，开发者不清楚安全规范
3. **知识盲区**: 团队成员对 XSS 攻击方式了解不足

#### 修复方案
1. 创建 `utils/security.js`，实现 `escapeHtml()` 函数
2. 所有 `innerHTML` 替换为转义后的内容
3. 纯文本场景使用 `textContent` 替代

#### 预防措施
- 在检查清单中添加「🟥 安全类 - XSS 防护」章节
- 提交前运行 `grep -r "innerHTML.*\${"` 检查危险代码
- 新成员入职时进行安全培训

#### 相关提交
- 修复 PR: #security-patch-1
- 检查清单更新: v1.0

---

#### BUG-002: 内存泄漏 - 页面切换后内存持续增长
- **发现时间**: 2026-04-10
- **发现人**: 架构师
- **影响范围**: 所有页面组件
- **严重程度**: 🔴 P0

#### 问题描述
用户在订单列表和新建订单页面之间反复切换，内存持续增长，长时间使用后页面卡顿甚至崩溃。

#### 根因分析
1. **技术原因**: 组件 `init()` 时绑定事件监听器，但页面切换时未清理
2. **架构原因**: 没有统一的组件生命周期管理
3. **测试盲区**: 性能测试未覆盖长时间使用场景

#### 修复方案
1. 使用 `AbortController` 管理事件监听生命周期
2. 在组件中添加 `cleanup()` 方法
3. `render()` 前先调用 `cleanup()` 清理旧监听

#### 预防措施
- 在检查清单中添加「🟥 稳定性类 - 内存泄漏防护」章节
- 自测时必须检查「快速切换页面 10 次，内存无持续增长」
- Code Review 时检查 `addEventListener` 是否有 `signal`

#### 相关提交
- 修复 PR: #security-patch-1
- 检查清单更新: v1.0

---

#### BUG-003: 金额计算精度误差 - 订单金额显示错误
- **发现时间**: 2026-04-10
- **发现人**: 架构师
- **影响范围**: 订单金额计算
- **严重程度**: 🟡 P1

#### 问题描述
订单中某些金额的合计会出现 0.01 元的误差，如：3 个 0.1 元的菜品合计显示为 0.30000000000000004 元。

#### 根因分析
1. **技术原因**: JavaScript 浮点数精度问题，0.1 + 0.2 !== 0.3
2. **知识盲区**: 开发者不了解金融计算应使用整数分
3. **缺乏规范**: 没有统一的金额计算工具

#### 修复方案
1. 创建 `MoneyCalculator` 类，使用整数分计算
2. 数据库和计算使用分，展示时转换为元
3. 所有金额计算统一使用该工具

#### 预防措施
- 在检查清单中添加「🟥 精度类 - 金额计算」章节
- 提交前运行 `grep -r "\.reduce.*price.*\*"` 检查直接计算
- 添加金额边界测试用例

#### 相关提交
- 修复 PR: #security-patch-1
- 检查清单更新: v1.0

---

#### BUG-004: API 路径不一致 - 开发/生产环境行为不同
- **发现时间**: 2026-04-10
- **发现人**: 架构师
- **影响范围**: 所有 API 调用
- **严重程度**: 🔴 P0

#### 问题描述
开发环境 API 路径为 `/api`，生产环境为 `/api/api`，导致部分功能在开发环境正常但生产环境报错 404。

#### 根因分析
1. **技术原因**: Nginx 配置有 rewrite 规则，但前端代码路径硬编码
2. **环境问题**: 开发和生产环境配置不一致
3. **测试盲区**: 只在开发环境测试，未在类生产环境验证

#### 修复方案
1. 统一 API 基础路径为 `/api`
2. 更新 Nginx 配置，移除双重 API 路径 rewrite
3. 使用环境变量配置 API 基础路径

#### 预防措施
- 在检查清单中添加「API 路径统一」检查项
- 添加环境配置验证脚本
- 部署前必须在预发布环境测试

#### 相关提交
- 修复 PR: #security-patch-1
- 检查清单更新: v1.0

---

#### BUG-005: 路由参数丢失 - 编辑/查看订单页面闪退
- **发现时间**: 2026-04-13
- **发现人**: Kimi
- **影响范围**: 订单列表「编辑」按钮、订单详情「编辑」按钮
- **严重程度**: 🔴 P0

#### 问题描述
在订单列表页点击「编辑」按钮，页面刚显示就闪一下消失，自动跳转回订单列表。同样的现象也出现在订单详情页的编辑操作。

#### 复现步骤
1. 进入「订单管理」页面
2. 点击任意订单的「编辑」按钮
3. 编辑页面刚渲染就消失，URL 变回 `#orderList`

#### 根因分析
1. **技术原因**: `app.js` 中 `Router.navigate('editOrder', { orderId: 'xxx' })` 在设置 URL hash 时只写了 `window.location.hash = 'editOrder'`，没有携带 `orderId`
2. **连锁反应**: 设置 hash 后立即触发 `hashchange` 事件，`hashchange` 从 URL 中解析参数，发现没有 `orderId`，路由判断「编辑订单缺少 orderId」，自动重定向回订单列表
3. **代码一致性**: `navigate()` 方法内部设置 hash 的逻辑与 `hashchange` 事件解析 hash 的逻辑不一致

#### 修复方案
```javascript
// ❌ 错误 - 设置 hash 时丢失参数
window.location.hash = page;

// ✅ 正确 - 设置 hash 时携带参数
if (params.orderId) {
  window.location.hash = `${page}/${params.orderId}`;
} else {
  window.location.hash = page;
}
```

#### 预防措施
- 在检查清单「常见错误速查表」中添加「页面闪一下就消失 → 路由参数丢失」
- 新增路由代码 Review 检查项：「navigate 设置 hash 时必须与 hashchange 解析逻辑保持一致」
- 修改路由代码后必须手动测试「编辑」「查看详情」等带参数的页面跳转

#### 相关提交
- 修复 PR: #fix-router-hash-param
- 检查清单更新: v1.1

---

#### BUG-006: ECharts 图表空白 - Vue ref 绑定对象嵌套属性失效
- **发现时间**: 2026-04-13
- **发现人**: Kimi
- **影响范围**: StatisticsView.vue（营业数据统计页的 4 个图表）
- **严重程度**: 🟡 P1

#### 问题描述
数据统计页的销售趋势、24小时分布、热门菜品、订单状态分布四个 ECharts 图表区域全部显示为空白，无报错但无渲染。

#### 复现步骤
1. 进入「数据统计」页面
2. 页面加载完成后，4 个图表容器均为空白

#### 根因分析
1. **技术原因**: Vue 3 模板中的 `ref` 绑定不支持对象嵌套属性。代码中使用了 `<div ref="chartRefs.trend">`，而 `chartRefs.trend` 是一个 `ref<HTMLDivElement>` 对象，Vue 实际接收到的是整个 `chartRefs` 对象，而非 `.trend` 属性
2. **结果**: `echarts.init(chartRefs.trend.value)` 实际传入的是 `undefined`，ECharts 初始化失败
3. **知识盲区**: Vue 文档明确说明模板 ref 必须是独立的响应式引用，不能是对象属性路径

#### 修复方案
```vue
<!-- ❌ 错误 - Vue 3 不支持对象嵌套 ref 绑定 -->
<div ref="chartRefs.trend"></div>

<!-- ✅ 正确 - 使用独立的 ref 变量 -->
<div ref="trendChartRef"></div>
```

```typescript
// ❌ 错误
const chartRefs = {
  trend: ref<HTMLDivElement | null>(null),
}

// ✅ 正确
const trendChartRef = ref<HTMLDivElement | null>(null)
```

#### 预防措施
- 在检查清单「常见错误速查表」中添加「ECharts 图表空白 → Vue ref 绑定规范」
- Code Review 时检查模板中的 `ref="xxx"` 是否为独立变量
- 组件挂载后立即断言 DOM ref 是否存在：`if (!trendChartRef.value) return`

#### 相关提交
- 修复 PR: #fix-echarts-ref-binding
- 检查清单更新: v1.2

---

#### BUG-007: E2E 测试超时 - CI 环境 Vite dev server 启动过慢
- **发现时间**: 2026-04-13
- **发现人**: Kimi
- **影响范围**: Playwright E2E 测试在 GitHub Actions CI 中运行
- **严重程度**: 🟡 P1

#### 问题描述
本地运行 `npm run test:e2e` 正常，但 CI 环境中 Playwright 因等待 Vite dev server 启动超时而失败（120s/180s timeout）。

#### 根因分析
1. **环境差异**: `playwright.config.ts` 默认使用 `npm run dev` 启动 webServer，CI 环境中 `npm ci` 后首次启动 Vite 需要编译依赖、生成缓存，耗时超过默认 120s
2. **配置单一**: 本地和 CI 共用同一套 webServer 配置，未针对 CI 做优化
3. **最佳实践缺失**: CI 环境应使用 `npm run preview`（基于生产构建）而非 dev server

#### 修复方案
```typescript
// playwright.config.ts
webServer: {
  command: process.env.CI ? 'npm run preview' : 'npm run dev',
  port: process.env.CI ? 4173 : 5173,
  reuseExistingServer: !process.env.CI,
}
```

#### 预防措施
- E2E CI 工作流独立为 `.github/workflows/e2e.yml`
- 本地手动 E2E 测试时建议先 `npm run dev` 再 `npx playwright test`
- 新增检查项：CI 环境中 E2E 必须走 preview 模式

#### 相关提交
- 修复 PR: #fix-playwright-ci-timeout
- 检查清单更新: v1.2

---

#### FEATURE-001: 订单餐具功能开发总结
- **开发时间**: 2026-04-14
- **开发人**: Kimi
- **功能范围**: 订单餐具选择（新建、编辑、打印账单）

#### 功能需求
1. 新建订单时，按人数自动配置餐具数量
2. 支持切换收费餐具（¥2/套）或免费餐具
3. 支持手动修改餐具数量
4. 编辑订单时正确回填餐具配置
5. 打印账单显示餐具明细

#### 技术实现要点

**1. 数据模型设计**
```typescript
// schemas/order.schema.ts
export const CutleryType = {
  FREE: 'free',      // 免费餐具
  CHARGED: 'charged', // 收费餐具
} as const

export const cutleryConfigSchema = z.object({
  type: z.enum([CutleryType.FREE, CutleryType.CHARGED]),
  quantity: z.number().int().nonnegative(),
  unitPrice: z.number().nonnegative(),
  totalPrice: z.number().nonnegative(),
})
```

**2. 金额计算逻辑**
```typescript
// 订单总金额 = 菜品金额 + 餐具费 - 折扣
const orderSummary = computed(() => {
  const dishSummary = cartSummary.value
  const cutleryPrice = cutleryConfig.value.totalPrice
  return {
    dishesTotal: dishSummary.total,
    cutleryTotal: cutleryPrice,
    subtotal: dishSummary.total + cutleryPrice,
    discount: dishSummary.discount,
    final: dishSummary.final + cutleryPrice,
  }
})
```

**3. 数据库迁移**
- 新增 `cutlery` JSON 字段到 orders 集合
- 迁移文件：`pb_migrations/1778270400_add_cutlery_to_orders.js`

#### 开发注意事项

**✅ 最佳实践**
1. 使用 `watch` 监听人数变化，自动同步餐具数量（除非手动修改过）
2. 使用 computed 计算餐具配置对象，确保数据一致性
3. 打印账单时单独列出餐具明细，便于顾客核对
4. Schema 验证确保数据完整性

**⚠️ 踩坑记录**
1. **默认值设置**：新建订单时需要初始化餐具数量，否则为 0
2. **编辑回填**：加载订单数据时必须检查 cutlery 字段是否存在（兼容旧订单）
3. **金额计算**：折扣只应用于菜品金额，不应用于餐具费（业务规则）

#### 相关文件
- `src/schemas/order.schema.ts` - 数据模型
- `src/views/OrderFormView.vue` - UI 和逻辑
- `src/utils/printBill.ts` - 打印功能
- `pb_migrations/1778270400_add_cutlery_to_orders.js` - 数据库迁移

#### 检查清单更新
- 新增「数据库 Schema 变更必须创建迁移文件」检查项
- 新增「订单金额计算必须包含附加费用」检查项

---

#### BUG-008~013: P0 安全与业务漏洞集中修复
- **发现时间**: 2026-04-19
- **发现人**: 架构师（代码审计）
- **影响范围**: API 层、安全工具、后端 Hook、统计视图
- **严重程度**: 🔴 P0（6 个）

##### 问题清单

| 编号 | 问题 | 影响 |
|------|------|------|
| BUG-008 | `escapePbString` 仅转义单引号，Filter 注入风险 | 攻击者可绕过查询条件读取/篡改他人订单 |
| BUG-009 | `sessionExpired` 模块级锁导致竞态条件 | 并行 401 时 token 清理不一致，状态混乱 |
| BUG-010 | `setSafeHtml` 正则可被绕过，XSS 风险 | `<div onclick="alert(1)">` 可通过白名单 |
| BUG-011 | 折扣值 `0` 被逻辑或运算符吞掉 | 前端无法取消折扣，始终回退到旧值 |
| BUG-012 | `cutlery.totalPrice` 直接信任前端输入 | 攻击者可构造恶意请求篡改订单总额 |
| BUG-013 | 统计页硬编码 500 条上限 | 年度统计只取前 500 单，经营指标严重失真 |

##### 根因分析
1. **安全函数自研但未经充分审计**：`escapePbString`、`setSafeHtml` 均为团队自行实现，未引入社区验证的库（如 DOMPurify）
2. **JavaScript 真假值陷阱**：后端 Hook 中滥用 `||` 回退，未区分 `0` 与 `undefined`
3. **信任边界不清**：后端 Hook 虽以「不信任前端」为原则，但 `cutlery.totalPrice` 仍直接累加
4. **前端聚合反模式**：统计功能将大数据量聚合推到浏览器，导致性能瓶颈和数据截断

##### 修复方案
1. `escapePbString` 增加对 `||` `&&` `#` 等操作符的过滤防御
2. 移除 `sessionExpired` 模块级锁，401 时统一清理并 `window.location.replace('/login')`
3. `setSafeHtml` 改为拒绝任何带属性的 HTML 标签，防止 `onclick` / `onerror` / `style` 注入
4. 后端 Hook 中折扣值判断改为 `!== undefined && !== null`，精确区分 `0`
5. 后端新增 `getCutleryUnitPrice()` 从 `dishes` 集合读取单价，`recalculateCutlery()` 根据 `quantity × unitPrice` 重算总额
6. `StatisticsView.vue` 改为循环分页拉取，上限 5000 条，消除静默截断

##### 预防措施
- 检查清单新增「🟥 安全类 - 输入过滤」：禁止自研安全函数处理用户输入，优先使用 DOMPurify 或框架原生转义
- 检查清单新增「🟥 精度类 - 逻辑或陷阱」：后端 Hook 中使用 `??` 或显式 `!== undefined` 判断，禁止用 `||` 做数值回退
- 检查清单新增「🟥 安全类 - 金额计算」：任何金额字段必须由后端根据原始数量/单价重算，不得信任前端传入的合计值
- 检查清单新增「🟨 性能类 - 大数据聚合」：超过 100 条的数据统计必须走后端聚合，禁止前端全量拉取

##### 相关提交
- 修复 PR: #p0-security-fix-20260419
- 检查清单更新: v1.5

---

#### BUG-014: KDS 未完成菜品消失 - 过滤条件过于严格
- **发现时间**: 2026-04-20
- **发现人**: 测试（生产环境验证）
- **影响范围**: 厨房大屏（KDS）
- **严重程度**: 🔴 P0

##### 问题描述
服务员将订单标记为 `serving`（开始上菜）后，该订单从 KDS 厨房大屏消失。但订单中仍有未制作完成的菜品，厨师无法继续操作这些菜品。

##### 复现步骤
1. 创建订单（含多个菜品）
2. 厨师在 KDS 点击部分菜品的「开始制作」
3. 服务员在订单详情页点击「开始上菜」
4. 订单状态变为 `serving`
5. KDS 上该订单完全消失，剩余未制作菜品无法操作

##### 根因分析
1. **技术原因**：`KitchenDisplayView.vue` 的 `loadData()` 过滤条件为 `status='pending' || status='cooking'`，只拉取这两种状态的订单。`serving` 和 `dining` 状态的订单被排除
2. **设计原因**：状态机设计时假设 `serving` 表示所有菜品已制作完成，但实际上服务员可能在部分菜品未制作完成时就点击「开始上菜」
3. **测试盲区**：KDS 测试用例只覆盖 `pending` 和 `cooking` 状态的订单展示

##### 修复方案
1. KDS 过滤条件从「只拉取 pending/cooking」改为「排除终态订单」：`status!='completed' && status!='settled' && status!='cancelled'`
2. 前端 `computed` 按单品状态（`pending`/`cooking`/`cooked`）分组展示，不依赖订单整体状态
3. 测试同步更新断言

##### 预防措施
- 检查清单新增「🟥 KDS 过滤条件」：KDS 必须展示所有含未完成菜品的订单，不能仅按订单整体状态过滤
- KDS 测试增加 `serving`/`dining` 状态订单的场景覆盖

##### 相关提交
- 修复 PR: #kds-filter-fix-20260420
- 检查清单更新: v1.6

---

#### BUG-015: 桌台重复开台 - 创建前无占用检查
- **发现时间**: 2026-04-20
- **发现人**: 测试（业务验收）
- **影响范围**: 订单创建、桌台管理
- **严重程度**: 🔴 P0

##### 问题描述
某桌订单还未清台（`table_status` 为 `dining`，`currentOrderId` 有值），但员工端可以通过「新建订单」创建该桌的新订单，没有任何报错。导致一桌多订单，财务混乱。

##### 复现步骤
1. 为 A1 桌创建订单
2. 订单未结账/未清台
3. 进入「新建订单」页面，选择 A1 桌
4. 提交订单，成功创建，无任何提示

##### 根因分析
1. **技术原因**：后端 `onRecordAfterCreateRequest` 中虽有占用检查，但**检查在订单创建后执行**，此时订单已写入数据库；且错误被 `try/catch` 静默吞掉，订单不会回滚
2. **前端原因**：`OrderFormView.vue` 提交前未查询 `table_status`
3. **流程原因**：桌台占用校验应在创建前完成，而非创建后兜底

##### 修复方案
1. 后端 `onRecordBeforeCreateRequest` 新增桌台占用检查：`dining` + `currentOrderId` 存在时直接抛出错误，阻止订单入库
2. 前端 `OrderFormView.vue` 提交前调用 `TableStatusAPI.getTableStatus()`，占用时 Toast 阻断
3. 后端 `onRecordAfterCreateRequest` 保留原检查作为安全兜底

##### 预防措施
- 检查清单新增「🟥 业务规则校验必须在创建前」：任何业务规则阻断（如桌台占用、库存不足）必须在 `onRecordBeforeCreateRequest` 中执行，不能依赖 `onRecordAfterCreateRequest`
- 检查清单新增「🟨 前端二次校验」：涉及资源占用的操作，前端提交前应做前置校验，提供即时反馈

##### 相关提交
- 修复 PR: #table-occupancy-fix-20260420
- 检查清单更新: v1.6

---

#### BUG-016: KDS 单品状态更新导致订单整体状态回退 - 非法状态流转
- **发现时间**: 2026-04-20
- **发现人**: 测试（生产环境验证）
- **影响范围**: 厨房大屏（KDS）、订单状态机
- **严重程度**: 🔴 P0

##### 问题描述
订单状态为 `serving`，但仍有 `pending` 菜品。厨师在 KDS 点击「开始制作」后，前端报错：`操作失败: Something went wrong while processing your request.`。该菜品无法更新状态。

##### 复现步骤
1. 创建订单（含多个菜品）
2. 厨师在 KDS 完成部分菜品的制作
3. 服务员点击「开始上菜」，订单状态变为 `serving`
4. 厨师在 KDS 点击剩余 `pending` 菜品的「开始制作」
5. 报错，操作失败

##### 根因分析
1. **技术原因**：后端 `onRecordBeforeUpdateRequest` 的自动推断逻辑：`anyCooking = true` → `inferred = 'cooking'`。然后检查流转合法性：`flow['serving']` 不包含 `'cooking'` → 抛出非法流转错误
2. **设计原因**：自动推断逻辑假设单品状态更新会推动订单整体状态前进，但未考虑订单已被手动推进到更高级别状态的情况
3. **状态机设计缺陷**：`serving` 状态表示「开始上菜」，允许部分菜品已上、部分菜品未制作。此时单品状态变化不应导致订单整体状态回退

##### 修复方案
1. 在自动推断逻辑中增加状态优先级检查：`pending(0) < cooking(1) < serving(2) < dining(3) < completed(4) < settled(5)`
2. 推断出的状态优先级低于当前状态时，保持当前状态不变，不再抛出错误
3. 单品状态更新只推动订单状态前进，不回退

##### 预防措施
- 检查清单新增「🟥 状态机回退防护」：后端自动推断订单整体状态时，必须增加优先级/方向检查，禁止状态回退
- 状态流转测试增加「手动推进到高级状态后单品继续操作」的场景

##### 相关提交
- 修复 PR: #status-rollback-fix-20260420
- 检查清单更新: v1.6

---

#### BUG-017: OrderListView 沽空加载为空 - onMounted 遗漏 API 调用
- **发现时间**: 2026-04-20
- **发现人**: 测试（回归验证）
- **影响范围**: 订单列表页「今日沽空」抽屉
- **严重程度**: 🟡 P1

##### 问题描述
订单列表页点击「今日沽空」按钮，抽屉打开后菜品列表为空。刷新页面后依然为空。

##### 根因分析
1. **技术原因**：`OrderListView.vue` 的 `onMounted` 中调用了 `fetchOrders()` 和 `settingsStore.fetchSettings()`，但遗漏了 `fetchAllDishes()`（加载 `allDishes` 数据）
2. **代码审查盲区**：`SoldOutDrawer` 组件依赖 `allDishes`，但父组件未保证数据加载
3. **测试覆盖不足**：`OrderListView` 测试未覆盖「今日沽空」抽屉打开后的数据加载

##### 修复方案
1. `OrderListView.vue` 的 `onMounted` 中补充 `fetchAllDishes()` 调用
2. `fetchAllDishes()` 内部静默处理错误，避免阻塞主流程
3. 补充 `OrderListView.spec.ts` 测试用例（11 个），覆盖数据加载、SoldOutDrawer、编辑阻断、删除

##### 预防措施
- 检查清单已有项强化：「页面挂载时，所有需要的数据源都已加载」——增加反例说明：SoldOutDrawer 用了 `allDishes` 但 `onMounted` 没调 `DishAPI.getDishes()`

##### 相关提交
- 修复 PR: #soldout-drawer-fix-20260420
- 检查清单更新: v1.6

---

## 十、快速更新指南

### 发现新 Bug 后，按以下步骤更新：

#### Step 1: 确定 Bug 类型
- 🔴 安全/稳定性问题 → 添加到「🟥 必须检查」章节
- 🟡 代码质量问题 → 添加到「🟨 建议检查」章节
- 🟢 优化建议 → 添加到「🟩 可选优化」章节或记录为建议

#### Step 2: 编写检查项
包含以下要素：
1. **问题简述** - 一句话描述
2. **错误代码示例** - ❌ 标记的代码
3. **正确代码示例** - ✅ 标记的代码
4. **检查方法** - 如何验证是否修复/遵守

#### Step 3: 更新版本历史
在「更新记录」表格中添加一行：
```markdown
| v1.1 | 2026-04-20 | 张三 | 新增 XX 检查项，修复 XX Bug |
```

#### Step 4: 记录到根因分析库
按照「Bug 根因分析库」模板，详细记录：
- 问题描述和复现步骤
- 根因分析（技术 + 流程）
- 修复方案
- 预防措施

#### Step 5: 团队同步
- 在站会上分享更新内容
- 发送更新摘要到团队群聊
- 如果是严重问题，组织专题分享

---

### 更新示例

假设今天发现了一个新 Bug：

**Bug**: 订单搜索无防抖，快速输入导致频繁请求

**更新步骤**:

1. 在「🟨 代码质量类」下新增检查项：
```markdown
#### 请求防抖
```javascript
// ❌ 不好 - 每次输入都触发请求
input.addEventListener('input', (e) => {
  searchAPI(e.target.value); // 频繁触发！
});

// ✅ 好 - 使用防抖
import { debounce } from '../utils/debounce.js';
input.addEventListener('input', debounce((e) => {
  searchAPI(e.target.value);
}, 300));
```
- [ ] 搜索/筛选输入框必须使用防抖（debounce）
- [ ] 按钮提交必须使用防抖或 Loading 状态
```

2. 在「常见错误速查表」中添加：
```markdown
| 快速输入导致卡顿 | 无防抖 | 使用 `debounce(fn, 300)` |
```

3. 更新版本记录：
```markdown
| v1.1 | 2026-04-20 | 李四 | 新增防抖检查项，修复搜索频繁请求问题 |
```

4. 在「Bug 根因分析库」中添加 BUG-005

---

## 十一、团队约定

1. **谁发现，谁更新** - 发现 Bug 的人负责更新检查清单（或指定人跟进）
2. **24小时内更新** - Bug 修复后 24 小时内必须完成清单更新
3. **代码与文档同步** - **每次代码变更必须同步更新 `智能点菜系统-详细设计说明书.md` 和/或 `CODE_CHECKLIST.md`**。提交前 pre-commit hook 会自动检查；CI 也会拦截未同步文档的 PR
4. **站会同步** - 每周站会回顾本周清单更新内容
5. **新人必读** - 新成员入职第一周必须通读此清单
6. **定期回顾** - 每月月底回顾清单有效性，删除过时项

---

**记住：这个检查清单的价值在于持续更新。每次更新都是在保护团队不再踩同样的坑！**


---

## 附录：Checklist 使用流程图

```
开始开发
    │
    ▼
┌─────────────────┐
│ 1. 编码前准备    │ ◄── 检查安全规范、架构规范
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ 2. 编码中检查    │ ◄── 边写边检查（安全、稳定性、精度）
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ 3. 自测         │ ◄── 功能、安全、性能测试
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ 4. 提交前检查    │ ◄── 运行检查命令，确保无危险代码
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ 5. Code Review   │ ◄── 对照 Review 清单
└─────────────────┘
    │
    ▼
  合并提交
```

---

## 附录：已实施的架构优化 (2026-04-19)

以下优化已全部完成并通过 171 个单元测试 + 类型检查验证：

### API 层
- [x] `handleResponse<T>()` 返回 `T | null`，消除 `null as T` 类型欺骗
- [x] JWT `exp` 字段校验 (`isTokenExpired`)
- [x] 严格 DTO：`CreateOrderPayload` / `UpdateOrderPayload`
- [x] 401/403/408 错误标准化处理
- [x] 非 Abort 网络错误统一包装为 `APIError`
- [x] Sentry 前端监控集成（生产环境自动上报）

### 业务逻辑
- [x] `OrderStatusValue` 联合类型替代 `string`
- [x] `StatusFlow` 移除非法状态流转（如 `serving → cancelled`）
- [x] `useClearTable` 共享 composable 统一清台规则
- [x] `discountValue = 0` 精确判断（避免 `\|\|` 吞零）

### 后端 Hook
- [x] `itemsAppended` 比较 `dishId+quantity` 替代数组长度
- [x] `serving` 状态纳入结束订单拦截
- [x] `cutlery.totalPrice` 后端根据 `dishes` 集合重算
- [x] `table_status` 错误处理硬化（`console.error`）

### 精度与打印
- [x] `printBill.ts` 浮点运算改用 `MoneyCalculator.toCents`
- [x] `generateBillHTML` 支持 58mm/80mm 纸张宽度

### 测试覆盖
- [x] API 层 15 个新测试（`src/api/__tests__/pocketbase.spec.ts`）
- [x] `security.ts` 测试补充（`setSafeHtml` / `setSafeAttribute` / `MoneyCalculator` 分支）
- [x] `orderStatus.ts` 流转边界测试
- [x] `printBill.ts` 58mm 分支测试
- [x] `settings.store.ts` / `auth.store.ts` 边缘测试
- [x] `useClearTable` 4 个新测试

### 性能
- [x] 统计页后端聚合路由 `/api/stats`（SQLite 原生聚合 + json_each）
- [x] 前端优先后端聚合，404 降级到客户端分页循环
- [x] `DishAPI.getDishes()` / `SettingsAPI.getSettings()` MemoryCache TTL 缓存
- [x] `KitchenDisplayView` 轮询改 PocketBase SSE Realtime（降级回轮询）

### P3 体验优化（2026-04-19 追加）
- [x] PWA 离线化：`manifest.json` + Service Worker + 离线提示
- [x] 蓝牙打印机：ESC/POS 指令生成器 + Web Bluetooth 封装 + 订单详情页蓝牙打印按钮

### 运维与发布（2026-04-19 追加）
- [x] 数据库自动备份：每日 3:00 SQLite 热备份 + storage + hooks，保留 30 天
- [x] CI/CD 自动化部署：GitHub Actions → SCP 上传 → SSH 执行部署脚本
- [x] 部署用户最小权限：deploy 用户 + sudoers 专用脚本白名单
- [x] 部署回滚机制：每次部署自动备份 frontend + hooks

### P2 代码质量（2026-04-19 追加）
- [x] 魔法字符串完整提取到 `src/constants/index.ts`
- [x] `console.log` 统一改为 `console.error`
- [x] `parseJSONField()` 提取，消除 6 处重复 JSON 解析
- [x] `StatusBadgeClass` 提取到 `orderStatus.ts`
- [x] `DISH_RULES` / `HOT_DISHES` / `CATEGORY_ORDER` / `CATEGORY_META` 提取到 `src/config/dish.config.ts`
- [x] `filteredDishes` 排序缓存（`sortedDishes` computed 分离）
- [x] `KitchenDisplayView` `onUnmounted` 显式清理
- [x] `StatisticsView` 卸载竞态防护
- [x] `useAutoRefresh` 页面失焦暂停
- [x] `CustomerOrderView` `setTimeout` 引用清理
