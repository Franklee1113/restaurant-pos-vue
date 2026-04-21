# 智能点菜系统 - 业务流程全景图

> **文档用途**: 全面梳理实际用餐业务场景中的核心流程，消除业务逻辑处理混乱  
> **目标读者**: 架构师、开发工程师、测试工程师、产品经理  
> **更新日期**: 2026-04-21  
> **版本**: v1.0

---

## 阅读指南

本文档使用 **Mermaid** 语法绘制流程图，支持在以下工具中渲染：
- GitHub / GitLab Markdown 预览
- VS Code + Markdown Preview Mermaid Support 插件
- 在线编辑器: https://mermaid.live

---

## 1. 订单状态机总图

### 1.1 订单整体状态（Order Status）

```mermaid
stateDiagram-v2
    [*] --> pending: 新建订单
    pending --> cooking: 开始制作
    pending --> cancelled: 取消订单
    cooking --> serving: 开始上菜
    cooking --> cancelled: 取消订单
    serving --> dining: 全部上齐
    serving --> cancelled: 取消订单
    dining --> completed: 结账完成
    dining --> cancelled: 取消订单
    completed --> settled: 清台完成
    settled --> [*]: 终态
    cancelled --> [*]: 终态

    note right of pending
        桌台状态: dining (占用)
        可编辑: ✅ 可删除: ✅ 可清台: ❌
    end note

    note right of completed
        桌台状态: dining (占用)
        可编辑: ❌ 可清台: ✅ (手动)
    end note

    note right of settled
        桌台状态: idle (空闲)
        自动清台触发
    end note

    note left of cancelled
        桌台状态: idle (空闲)
        自动清台触发
    end note
```

### 1.2 菜品单品状态（Item Status）

```mermaid
stateDiagram-v2
    [*] --> pending: 下单
    pending --> cooking: 厨房点击"开始制作"
    cooking --> cooked: 厨房点击"已完成"
    cooked --> served: 服务员确认"已上菜"
    served --> [*]: 终态

    note right of pending
        出现在 KDS "新订单"栏
    end note

    note right of cooking
        出现在 KDS "制作中"栏
        超过15分钟显示超时预警
    end note
```

### 1.3 订单状态自动推断规则

```mermaid
flowchart TD
    A[订单更新<br/>检测 items 变化] --> B{所有单品状态}
    B -->|全部 served| C[推断为 dining]
    B -->|全部 cooked 或 served<br/>但未全部 served| D[推断为 serving]
    B -->|任一 cooking| E[推断为 cooking]
    B -->|其他| F[保持 pending]
    C --> G{优先级检查}
    D --> G
    E --> G
    F --> G
    G -->|新状态优先级 ≥ 旧状态| H[允许更新]
    G -->|新状态优先级 < 旧状态| I[静默忽略<br/>防回退]
    H --> J{流转合法性检查}
    J -->|在允许列表中| K[更新订单状态]
    J -->|非法流转| L[抛出异常<br/>阻断操作]
```

---

## 2. 员工端核心业务流程

### 2.1 新建订单完整流程

```mermaid
flowchart TD
    Start([员工打开<br/>新建订单页]) --> Load[加载系统设置<br/>加载全部菜品]
    Load --> Init[初始化:<br/>guests=4, cutleryQty=4<br/>购物车为空]
    Init --> SSE[建立 SSE 连接<br/>实时同步菜品沽清]

    SSE --> SelectTable[选择桌号]
    SelectTable --> SelectGuests[选择用餐人数]
    SelectGuests --> Browse[浏览菜品分类]

    Browse --> AddDish{添加菜品}
    AddDish -->|铁锅鱼/铁锅炖鱼| AutoPot{锅底是否沽清}
    AutoPot -->|否| AddPot[自动加入锅底 1份]
    AutoPot -->|是| WarnPot[toast.warning<br/>锅底沽清无法自动添加]
    AddPot --> CartUpdate[更新购物车]
    WarnPot --> CartUpdate
    AddDish -->|普通菜品| CheckSoldOut{菜品沽清}
    CheckSoldOut -->|已沽清| BlockAdd[toast.warning<br/>拦截添加]
    CheckSoldOut -->|未沽清| CartUpdate
    BlockAdd --> Browse

    CartUpdate --> CartOp[购物车操作:<br/>±数量 / 改备注 / 删除]
    CartOp --> Discount[配置折扣:<br/>百分比(如8折) / 固定减免]
    Discount --> Cutlery[餐具配置:<br/>收费/免费, 数量默认=guests]

    CartOp --> Submit{点击提交}
    Discount --> Submit
    Cutlery --> Submit

    Submit --> PreCheck1[前置校验1:<br/>购物车沽清检查]
    PreCheck1 -->|含 soldOut| Err1[toast.error<br/>列出沽清菜品<br/>阻断提交]
    Err1 --> CartOp

    PreCheck1 -->|全部可售| PreCheck2[前置校验2:<br/>表单合法性<br/>桌号/人数/至少1道菜]
    PreCheck2 -->|不通过| Err2[toast.error<br/>阻断提交]
    Err2 --> CartOp

    PreCheck2 -->|通过| PreCheck3[前置校验3:<br/>桌台占用检查]
    PreCheck3 -->|status=dining<br/>且 currentOrderId 存在| Err3[toast.error<br/>桌台已被占用]
    Err3 --> SelectTable

    PreCheck3 -->|桌台可用| Build[构造订单数据:<br/>orderNo / status=pending<br/>items / cutlery / 金额]
    Build --> API1[API: createOrder]
    API1 --> Hook1[后端 Hook:<br/>1. 校验 soldOut<br/>2. 校验桌台占用<br/>3. 重算金额<br/>4. 自动开台]
    Hook1 -->|校验失败| Err4[返回 400/409<br/>toast.error]
    Err4 --> CartOp
    Hook1 -->|成功| Success1[创建成功]
    Success1 --> ClearCart[清空购物车]
    ClearCart --> Jump[跳转订单列表]
    Jump --> End1([结束])
```

### 2.2 编辑订单完整流程

```mermaid
flowchart TD
    Start2([员工点击编辑]) --> PermCheck{订单状态}
    PermCheck -->|completed / settled| BlockEdit[toast.error<br/>已结账/已清台订单不可编辑]
    BlockEdit --> End2([结束])
    PermCheck -->|pending ~ dining| AllowEdit[允许进入编辑页]

    AllowEdit --> LoadOrder[加载订单详情<br/>回填桌号/人数/折扣/备注]
    LoadOrder --> LoadItems[购物车回填:<br/>保留原有单品 status]
    LoadItems --> EditMode[进入编辑模式]

    EditMode --> EditOps[可执行操作:<br/>增/删/改菜品<br/>改人数/折扣/备注]
    EditOps --> AddNew{新增菜品}
    AddNew -->|原订单 dining/serving| ResetStatus[后端 Hook:<br/>新增菜品 status = pending<br/>订单整体状态保持不变]
    AddNew -->|原订单 pending/cooking| NormalUpdate[正常更新]

    EditOps --> RemoveDish{删除/减少菜品}
    RemoveDish -->|已制作/已上菜| NoBackendCheck[⚠️ 后端无校验<br/>允许删除已制作菜品]
    NoBackendCheck --> Recalc[Hook 重算金额]
    NormalUpdate --> Recalc
    ResetStatus --> Recalc

    Recalc --> Save[调用 updateOrder]
    Save --> Success2[保存成功<br/>跳转订单列表]
    Success2 --> End2
```

### 2.3 订单详情页操作权限矩阵

```mermaid
flowchart LR
    subgraph 状态判断
        S1[pending] --> OP1
        S2[cooking] --> OP2
        S3[serving] --> OP3
        S4[dining] --> OP4
        S5[completed] --> OP5
        S6[settled] --> OP6
        S7[cancelled] --> OP7
    end

    subgraph 可操作
        OP1[编辑✅ 删除✅ 打印✅<br/>状态流转→cooking  →cancelled<br/>修改单品✅ 清台按钮❌]
        OP2[编辑✅ 删除✅ 打印✅<br/>状态流转→serving  →cancelled<br/>修改单品✅ 清台按钮❌]
        OP3[编辑✅ 删除✅ 打印✅<br/>状态流转→dining  →cancelled<br/>修改单品✅ 清台按钮❌]
        OP4[编辑✅ 删除✅ 打印✅<br/>状态流转→completed  →cancelled<br/>修改单品✅ 清台按钮❌]
        OP5[编辑❌ 删除✅ 打印✅<br/>状态流转→settled<br/>修改单品❌ 清台按钮✅]
        OP6[编辑❌ 删除✅ 打印✅<br/>无流转按钮<br/>修改单品❌ 清台按钮❌]
        OP7[编辑❌ 删除✅ 打印✅<br/>无流转按钮<br/>修改单品❌ 清台按钮❌]
    end
```

### 2.4 手动清台完整流程

```mermaid
flowchart TD
    Start3([点击清台按钮]) --> Check1[校验1:<br/>table_status.status === idle]
    Check1 -->|是| ErrA[提示:<br/>已是空闲状态<br/>无需重复清台]
    ErrA --> End3([结束])

    Check1 -->|否| Check2[校验2:<br/>查询该桌未完成订单<br/>status != settled && != cancelled]
    Check2 -->|存在未完成订单| ErrB[提示:<br/>还有未完成订单<br/>请先处理完毕]
    ErrB --> End3

    Check2 -->|无未完成订单| Check3[校验3:<br/>查询当前绑定订单]
    Check3 -->|status === dining| ErrC[提示:<br/>客人还在用餐中<br/>尚未结账，无法清台]
    ErrC --> End3

    Check3 -->|status === completed| Sync[先更新订单状态<br/>completed → settled]
    Check3 -->|订单查询失败| ErrD[提示:<br/>无法确认订单状态<br/>请检查网络后重试]
    Check3 -->|无绑定订单| Direct[直接清台]

    Sync -->|更新失败| ErrE[提示:<br/>订单状态更新失败<br/>请稍后重试]
    Sync -->|更新成功| Direct
    ErrD --> End3
    ErrE --> End3

    Direct --> Confirm[弹窗二次确认:<br/>确认此桌已结账完毕？]
    Confirm -->|取消| End3
    Confirm -->|确认| Exec[执行清台:<br/>status → idle<br/>currentOrderId → '']
    Exec --> Toast[toast.success<br/>清台成功]
    Toast --> End3
```

---

## 3. 顾客端业务流程

### 3.1 首次扫码点餐流程

```mermaid
flowchart TD
    CStart([顾客扫码<br/>带 tableNo 参数]) --> CCheck{tableNo 是否存在}
    CCheck -->|为空| CErr1[toast.error<br/>无效桌号]
    CErr1 --> CEnd([结束])

    CCheck -->|有效| CLoad[并行加载:<br/>菜品列表 + 桌台状态]
    CLoad --> CSession[检查 sessionStorage<br/> customer_order_id + token]
    CSession -->|有有效会话<br/>订单非终态| CRestore[恢复已有订单<br/>进入加菜模式]
    CSession -->|无会话或已结束| CDetect[检测桌台:<br/>ts.currentOrderId?]

    CDetect -->|存在未完成订单| CJoin[自动加入订单<br/>创建新会话<br/>进入加菜模式]
    CDetect -->|上一单已结束| CInfo[toast.info<br/>请开始新点餐]
    CDetect -->|无历史订单| CSetup[强制弹出人数选择<br/>默认 guests=1]

    CInfo --> CSetup
    CSetup --> CBrowse[浏览菜品分类<br/>排除"餐具"分类]

    CBrowse --> CAdd{添加菜品}
    CAdd -->|铁锅鱼| CAutoPot[自动加锅底<br/>⚠️ 不检查锅底沽清]
    CAutoPot --> CCart[加入购物车]
    CAdd -->|普通菜品| CCart

    CCart --> CViewCart[打开购物车面板]
    CViewCart --> CShow1[展示已下单菜品<br/>只读 + 状态标签]
    CShow1 --> CShow2[展示新加菜品<br/>可编辑数量/删除]
    CShow2 --> CRemark[整单口味偏好]
    CRemark --> CSubmit{点击提交}

    CSubmit --> CPreCheck[前置校验:<br/>cart 非空]
    CPreCheck -->|为空| CErr2[阻断]
    CErr2 --> CViewCart

    CPreCheck -->|非空| CSoldOut[检查 cart 中 soldOut 项]
    CSoldOut -->|存在 soldOut| CRemove[自动移除 soldOut 菜品<br/>toast.error 提示]
    CRemove --> CViewCart

    CSoldOut -->|全部可售| CCreate[调用 public API<br/>createOrder]
    CCreate --> CHook[后端处理:<br/>校验 soldOut<br/>重算金额<br/>自动开台]
    CHook -->|失败| CErr3[toast.error]
    CErr3 --> CViewCart
    CHook -->|成功| CToken[返回 accessToken]
    CToken --> CSave[持久化会话<br/>sessionStorage]
    CSave --> CSuccess[显示成功页<br/>2秒后关闭购物车]
    CSuccess --> CClear[clearCart]
    CClear --> CReload[reloadData]
    CReload --> CEnd
```

### 3.2 顾客端追加菜品流程

```mermaid
flowchart TD
    AStart([顾客扫码<br/>已有未完成订单]) --> ALoad[加载订单 + 菜品]
    ALoad --> ALock[人数锁定<br/>禁用修改]
    ALock --> AHint[底部提示:<br/>新菜品将追加到 xxx]

    AHint --> ABrowse[浏览菜品]
    ABrowse --> AAdd[添加菜品到购物车]
    AAdd --> AView[打开购物车面板]
    AView --> AShow1[已下单菜品<br/>"再来一份"按钮]
    AShow1 --> AAgain[点击再来一份<br/>quantity=1 加入新 cart]

    AView --> ASubmit{确认追加}
    ASubmit --> ASoldOut[检查 soldOut<br/>自动移除]
    ASoldOut -->|有移除| AReturn[返回购物车]
    AReturn --> AView
    ASoldOut -->|全部可售| ACall[调用 appendOrderItems]

    ACall --> AMerge[后端 mergeOrderItems:<br/>相同 dishId quantity 累加<br/>原状态非 pending 则重置为 pending]
    AMerge --> AOK[toast.success<br/>已追加]
    AOK --> AClose[2秒后关闭购物车]
    AClose --> AEnd([结束])
```

---

## 4. KDS 厨房端业务流程

### 4.1 厨房作业流程

```mermaid
flowchart TD
    KStart([打开厨房大屏]) --> KLoad[加载订单:<br/>排除 completed/settled/cancelled]
    KLoad --> KSSE[建立 SSE 连接<br/>失败则降级 10s 轮询]
    KSSE --> KSound[新 pending 菜品增加时<br/>播放"叮咚叮"提示音]

    KSound --> KView1[第一栏: 新订单<br/>按创建时间升序]
    KView1 --> KCard1[卡片内容:<br/>桌号(大号) / 顾客标签<br/>下单时间 / 仅 pending 菜品<br/>整单备注(红色高亮)]

    KCard1 --> KAction1[点击"开始制作"]
    KAction1 --> KUpdate1[API: updateOrderItemStatus<br/>pending → cooking]
    KUpdate1 --> KHook1[后端 Hook:<br/>推断订单状态 → cooking]
    KHook1 --> KRefresh1[卡片移至第二栏]

    KRefresh1 --> KView2[第二栏: 制作中<br/>显示已制作时长]
    KView2 --> KOver15{时长 > 15分钟}
    KOver15 -->|是| KWarn[橙色卡片<br/>边框闪烁 🔥]
    KOver15 -->|否| KNormal[正常显示]

    KNormal --> KAction2[点击"已完成"]
    KWarn --> KAction2
    KAction2 --> KUpdate2[API: updateOrderItemStatus<br/>cooking → cooked]
    KUpdate2 --> KHook2[后端 Hook:<br/>推断订单状态 → serving/dining]
    KHook2 --> KDisappear[该菜品从 KDS 消失<br/>等待服务员上菜]
    KDisappear --> KEnd([结束])
```

---

## 5. 跨端协同流程

### 5.1 桌台状态同步时序图

```mermaid
sequenceDiagram
    actor 员工
    actor 顾客
    participant 前端 as Vue 前端
    participant 顾客端 as 顾客端 H5
    participant PB as PocketBase
    participant NodeAPI as Node.js 公共API
    participant DB as SQLite

    %% 新建订单 - 员工端
    员工->>前端: 新建订单
    前端->>PB: createOrder(items, tableNo)
    PB->>DB: INSERT orders
    PB->>DB: SELECT table_status WHERE tableNo=?
    alt 记录存在
        PB->>DB: UPDATE table_status<br/>status=dining, currentOrderId=orderId
    else 记录不存在
        PB->>DB: INSERT table_status<br/>status=dining, currentOrderId=orderId
    end
    PB-->>前端: 订单创建成功

    %% 新建订单 - 顾客端
    顾客->>顾客端: 扫码点餐
    顾客端->>NodeAPI: POST /public/orders
    NodeAPI->>DB: isTableAvailable?
    alt 可用
        NodeAPI->>DB: INSERT orders
        NodeAPI->>DB: UPSERT table_status<br/>status=dining
        NodeAPI-->>顾客端: 订单 + accessToken
    else 被占用
        NodeAPI-->>顾客端: 409 Conflict
    end

    %% 状态变更 - 自动清台
    员工->>前端: 点击"结账完成"
    前端->>PB: updateOrder status=completed
    PB->>DB: UPDATE orders
    Note over PB,DB: completed 不清台

    员工->>前端: 点击"清台"
    前端->>PB: updateOrder status=settled
    PB->>DB: UPDATE orders
    PB->>DB: UPDATE table_status<br/>status=idle, currentOrderId=''
    PB-->>前端: 成功

    %% 取消订单
    员工->>前端: 取消订单
    前端->>PB: updateOrder status=cancelled
    PB->>DB: UPDATE orders
    PB->>DB: UPDATE table_status<br/>status=idle, currentOrderId=''
```

### 5.2 沽清多端同步时序图

```mermaid
sequenceDiagram
    actor 员工A
    actor 员工B
    actor 顾客
    participant 员工端 as Vue 员工端
    participant 顾客端 as 顾客端 H5
    participant PB as PocketBase
    participant SSE as SSE 连接

    员工A->>员工端: 长按菜品 → 标记沽清
    员工端->>PB: PATCH dishes soldOut=true
    PB->>DB: UPDATE dishes
    PB->>SSE: 推送变更事件

    SSE->>员工端: 菜品 soldOut 变更
    员工端->>员工A: UI 变灰 + 红色"已沽清"标签
    alt 员工A 购物车中有该菜品
        员工端->>员工A: toast.warning 建议移除
    end

    SSE->>员工端: 菜品 soldOut 变更
    员工端->>员工B: UI 同步更新<br/>实时感知沽清

    Note over 顾客端: 顾客端无 SSE 连接<br/>仅订单轮询 15s
    顾客->>顾客端: 浏览菜品
    顾客端->>顾客: 展示旧状态<br/>可能看到未沽清
    顾客->>顾客端: 点击添加已沽清菜品
    顾客端->>顾客: 允许加入购物车
    顾客->>顾客端: 提交订单
    顾客端->>PB: createOrder
    PB->>PB: validateItemsSoldOut<br/>发现 soldOut 菜品
    PB-->>顾客端: 400/409 错误
    顾客端->>顾客: toast.error<br/>自动移除 soldOut 菜品
```

### 5.3 金额计算双保险时序图

```mermaid
sequenceDiagram
    actor 员工
    participant 前端 as OrderFormView
    participant MC as MoneyCalculator
    participant API as pocketbase.ts
    participant PB as PocketBase Hook

    员工->>前端: 调整购物车
    前端->>MC: calculateWithDiscount(items, discount)
    MC->>MC: 转分 → 累加 → 折扣 → 边界处理
    MC-->>前端: { total, discount, final }
    前端->>前端: 实时展示金额

    员工->>前端: 点击提交
    前端->>API: createOrder(orderData)
    API->>PB: POST /collections/orders/records

    PB->>PB: 解析 items / cutlery JSON
    PB->>PB: validateItemsSoldOut
    PB->>PB: 查询餐具单价
    PB->>PB: 以分为单位重算:<br/>Σ(price×100×qty) + 餐具费×100
    PB->>PB: 折扣计算<br/>(percent: total - total×discount/10)<br/>(amount: 固定值)
    PB->>PB: discount = min(discount, total)<br/>final = max(0, total - discount)
    PB->>PB: 强制覆盖前端传入金额
    PB->>DB: INSERT orders
    PB-->>API: 订单记录
    API-->>前端: 创建成功
```

---

## 6. 后台管理流程

### 6.1 菜品维护与沽清管理

```mermaid
flowchart TD
    MStart([进入菜品维护]) --> MLoad[加载全部菜品]
    MLoad --> MDisplay[按分类展示<br/>热门菜品优先排序]

    MDisplay --> MCRUD[CRUD 操作]
    MCRUD --> MAdd[新增菜品:<br/>名称/分类/价格/描述]
    MCRUD --> MEdit[编辑菜品]
    MCRUD --> MDel[删除菜品]

    MDisplay --> MSoldOut[沽清管理]
    MSoldOut --> MLongPress[长按/右键菜品<br/>弹出 ActionSheet]
    MLongPress --> MMark[标记为已沽清<br/>可输入备注]
    MMark --> MOptimistic[前端乐观更新<br/>UI 立即变灰]
    MOptimistic --> MAPI[API: PATCH soldOut=true]
    MAPI -->|失败| MRollback[回滚 UI<br/>恢复 soldOut=false]
    MAPI -->|成功| MToast[toast.success<br/>10秒内可撤销]
    MToast --> MUndo[点击撤销]<br/>|超时| MKeep[保持沽清]
    MUndo --> MAPI2[PATCH soldOut=false]

    MSoldOut --> MBatch[批量管理抽屉]
    MBatch --> MSearch[搜索/分类筛选]
    MSearch --> MToggle[单个标记/恢复]
    MBatch --> MClearAll[一键清空所有沽清]

    MSoldOut --> MAuto[每日 04:00<br/>定时任务自动重置<br/>所有 soldOut=true]
```

---

## 7. 异常与边界流程

### 7.1 网络异常处理

```mermaid
flowchart TD
    NetStart[网络请求] --> NetCheck{网络状态}
    NetCheck -->|在线| NetNormal[正常请求]
    NetCheck -->|离线| NetQueue[PWA 请求队列<br/>Service Worker 缓存]
    NetQueue --> NetRetry[网络恢复后自动重试]

    NetNormal --> NetTimeout{超时?}
    NetTimeout -->|是(>10s)| NetErr1[toast.error<br/>网络超时，请稍后重试]
    NetTimeout -->|否| NetResp{响应状态}

    NetResp -->|400| NetErr2[toast.error<br/>参数错误 / 业务校验失败]
    NetResp -->|401| NetErr3[清除 Token<br/>跳转登录页]
    NetResp -->|403| NetErr4[toast.error<br/>权限不足]
    NetResp -->|404| NetErr5[toast.error<br/>资源不存在]
    NetResp -->|409| NetErr6[toast.error<br/>业务冲突<br/>如 soldOut 菜品提交]
    NetResp -->|408| NetErr7[toast.error<br/>请求超时]
    NetResp -->|500| NetErr8[toast.error<br/>服务器错误<br/>Sentry 自动上报]
    NetResp -->|200/204| NetSuccess[正常处理]
```

### 7.2 订单编辑时的状态竞争

```mermaid
flowchart TD
    RaceStart[员工A 打开编辑页] --> RaceLoad[加载订单状态: pending]
    RaceLoad --> RaceEdit[开始编辑菜品]

    RaceEdit --> RaceParallel[同时]<br/>员工B 在详情页操作
    RaceParallel --> RaceB[员工B 点击<br/>"开始制作"]
    RaceB --> RaceHook[后端 Hook:<br/>状态 → cooking]
    RaceHook --> RaceDone[员工B 操作完成]

    RaceEdit --> RaceSubmit[员工A 提交编辑]
    RaceSubmit --> RaceNewItems[items 变化<br/>后端检测 itemsAppended]
    RaceNewItems --> RaceInfer[自动推断状态]
    RaceInfer -->|pending 优先级 < cooking| RaceSilent[静默保持 cooking<br/>不降级]
    RaceSilent --> RaceSave[保存成功<br/>状态仍为 cooking]
    RaceSave --> RaceEnd([结束])
```

---

## 附录：核心业务规则速查表

| 规则域 | 规则内容 |
|--------|---------|
| **状态流转** | pending → cooking → serving → dining → completed → settled；cancelled 可在 pending~dining 任意阶段触发 |
| **自动清台** | 仅 settled / cancelled 触发自动清台；completed 保持 dining 不清台 |
| **手动清台** | 三重校验: idle 阻断 / 未完成订单阻断 / dining 阻断；completed 清台时先转 settled |
| **金额安全** | 后端 Hook 以分为单位强制重算，不信任前端金额；折扣仅作用于菜品，不含餐具费 |
| **编辑权限** | completed / settled 禁止编辑；cancelled 可编辑 |
| **加菜状态** | dining/serving 状态追加菜品 → 订单状态保持原状，新增菜品 status = pending |
| **沽清拦截** | 员工端: 多层硬拦截(UI禁用+添加拦截+提交拦截)；顾客端: Stepper 置灰禁用 + 购物车标红 + 提交时自动移除 |
| **桌台占用** | 前后端双重校验；数据库唯一索引兜底 |
| **铁锅鱼规则** | 点铁锅鱼/铁锅炖鱼自动加锅底 1份；员工端与顾客端统一检查锅底沽清 |
| **餐具费** | 单价从 dishes 集合 category='餐具' 读取；员工端可选收费/免费，顾客端强制收费 |
