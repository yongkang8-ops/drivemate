# Packing List v0 Dashboard 状态与首票表单错误恢复设计

## 1. 背景与证据

Production Deployment `dpl_FfkMZKTrMy62kFa4Yusqr6gRM8fK` 的机器验收确认：Shipment `AJG-YJ-GWM-202608-01-PACKING` 尚无 `confirmed` Packing List revision，Warehouse 与 Pre-arrival 正确保持锁定，但 Operations Dashboard 将其显示为 `Packing List v0 is ready for label preparation`，并计入 `Confirmed Packing Lists in view` 与 `Print confirmation required`。

同一轮验收还确认：首票工作副本可打开和取消；空白表单会向服务端发送请求并收到 HTTP 400，但页面仅显示通用错误，未提供字段级恢复指引，取消后旧错误仍残留。

## 2. 目标

1. 未确认 Packing List 的 Shipment 在所有页面拥有一致、明确的业务状态。
2. Dashboard 继续显示该 Shipment，保留合伙人对到港前工作的可见性。
3. 未确认 Shipment 不得提前进入标签、收货或上架阶段。
4. 首票表单在客户端拦截明显无效输入，并把服务端结构化错误映射到可恢复的字段提示。
5. 移除当前已不适用的 `Phase 1 / Sample data only` 运营文案。

## 3. 非目标

- 不创建或确认真实 Packing List。
- 不修改 Production Supabase schema、RLS、库存、订单、客户或员工数据。
- 不改变 confirmed Packing List、标签打印、收货、暂存、上架和历史的既有成功流程。
- 不在本次 Hotfix 中重做 Partner/Admin 身份标签、导航结构或整体视觉系统。
- 不修改 GST、支付、SMTP、DNS 或 Vercel 环境变量。

## 4. 领域状态模型

### 4.1 Dashboard source

`PartnerDashboardShipmentSource` 增加显式字段：

```ts
packingListConfirmed: boolean;
```

`packingListVersion` 继续保留用于展示已确认版本，但不能再承担状态判断。无 confirmed revision 时可继续返回 `0` 作为兼容展示值，业务分支必须读取 `packingListConfirmed`。

### 4.2 Worklist 状态优先级

`worklistStatus()` 首先检查 `packingListConfirmed`。若为 `false`，返回：

```ts
{
  stage: "packing_list_required",
  stageLabel: "Packing List required",
  labelStatus: "not_ready",
  receiptStatus: "blocked",
  putawayStatus: "blocked",
  nextAction: "Open pre-arrival",
}
```

只有 `packingListConfirmed === true` 才继续进入既有 label、receipt、staging、located 判断。

## 5. Dashboard 呈现规则

### 5.1 统计科目

- `Active inbound shipments / Confirmed Packing Lists in view`：只统计 `packingListConfirmed === true`。
- `Print confirmation required`：只统计已确认 Packing List 且 label 尚未确认打印的 Shipment。
- 未确认 Shipment 仍保留在 Worklist，但不进入上述两项数量。
- Warehouse position、receipt exception 与 history 继续基于已保存的真实事件计算。

### 5.2 Shipment worklist

未确认 Shipment 显示：

- `Packing List not confirmed`
- `Source structure required`
- `Receipt blocked`
- `Putaway blocked`
- 唯一下一步：`Open pre-arrival`

不得显示：

- `Label required`
- `Labels pending`
- `Prepare labels`
- `Packing List v0 is ready for label preparation`

### 5.3 Attention queue

`PartnerDashboardAttention.type` 增加 `packing_list_required`。未确认 Shipment 生成：

- Title：`Packing List confirmation required`
- Detail：`Create and confirm the first Packing List before label preparation.`
- Target：`/prearrival?shipmentId=<id>`

只有 confirmed Shipment 才可生成 `print_gate`。

## 6. 首票表单错误恢复

### 6.1 客户端提交前校验

确认前校验当前工作副本的每一层：

- Pallet number：必填，去除首尾空格后不能为空。
- Carton number：必填，去除首尾空格后不能为空。
- SKU：必填，必须是系统可识别 SKU。
- Expected quantity：必须为正整数。
- 每个 carton 必须属于一个 pallet，并至少包含一条有效 SKU line。

若客户端校验失败：

- 不发送 POST 请求。
- 在表单顶部显示简短错误摘要。
- 在对应字段附近显示具体错误。
- 将焦点移到第一项错误字段。
- 保留操作员已经填写的其他内容。

### 6.2 服务端错误映射

若服务端返回 HTTP 400：

- 优先读取结构化 `error.fieldErrors` 或 Zod flatten 结果。
- 可映射字段显示字段级错误。
- 无法映射时显示 `Review the highlighted Packing List fields and try again.`。
- 不显示含糊的 `Packing-list revision could not be created.` 作为唯一信息。

### 6.3 状态清理

以下操作必须清除旧错误：

- `Create first Packing List`
- `Open working copy`
- `Cancel working copy`
- 切换 Shipment
- 任一错误字段被操作员修改后，清除该字段对应错误

取消工作副本后恢复首票空状态，不残留失败提示。

## 7. 文案与视觉边界

- 删除侧栏底部 `Phase 1 / Sample data only`。
- 用真实运营边界替换为：
  - Label printing remains locked until Packing List confirmation.
  - Warehouse receipt remains locked until product-label print confirmation.
- 沿用现有 DriveMate teal、warning amber、输入框和按钮样式，不引入新的设计系统。
- 错误摘要使用现有错误色和语义 `role="alert"`；字段错误与输入通过 `aria-describedby` 关联。
- 本次只做状态清晰度与错误恢复，不扩大布局重设计范围。

## 8. 数据流

```text
Supabase shipment + revisions
        |
        v
loadPartnerDashboardSource
        | explicit packingListConfirmed
        v
buildPartnerDashboard
        | source-required / print / receipt / putaway states
        v
PartnerDashboard UI

Prearrival working copy
        |
        +--> client validation fails --> field errors, no POST
        |
        +--> client validation passes --> POST revision
                                      |
                                      +--> 400 structured errors --> map to fields
                                      +--> success --> existing immutable confirmation flow
```

## 9. 测试设计

### 9.1 Unit tests

1. 无 confirmed revision 的 source 输出 `packingListConfirmed: false`。
2. v0 Shipment 状态为 `packing_list_required`。
3. v0 不计入 confirmed 或 print-confirmation totals。
4. v0 Attention 为 `Packing List confirmation required`，不生成 `print_gate`。
5. confirmed v1/v2 Shipment 保持既有状态与统计结果。

### 9.2 Component / browser tests

1. Dashboard 对 v0 仅显示 `Open pre-arrival`。
2. Dashboard 不出现 `Prepare labels` 或 `ready for label preparation`。
3. 空白首票表单不发出 POST，并显示字段级错误。
4. 修改字段可清除该字段错误。
5. Cancel 清除所有错误并返回空状态。
6. 服务端 400 结构化错误可映射到字段。
7. `Phase 1 / Sample data only` 不再出现。

### 9.3 Regression

- 全量 Vitest。
- TypeScript typecheck。
- Next.js production build。
- 既有 Warehouse、Staff、MFA 和 Pre-arrival Playwright 测试。

## 10. 发布与回滚

1. 在当前 Hotfix 分支完成 TDD 和本地 QA。
2. 推送 GitHub 后创建 Production Deployment，使用现有 Production 环境变量。
3. 只读健康检查确认 `ready: true`。
4. 使用已登录管理员会话重新执行 Warehouse → Pre-arrival → Dashboard。
5. 若出现严重回归，回滚到 `dpl_FfkMZKTrMy62kFa4Yusqr6gRM8fK`。

## 11. 验收标准

- Warehouse、Pre-arrival 与 Dashboard 对无 confirmed Packing List 的状态完全一致。
- v0 不得出现标签准备入口。
- Dashboard 仍可见未确认 Shipment，并引导到 Pre-arrival。
- 空值表单不产生网络提交。
- 错误可定位、可修复、取消后无残留。
- 没有产生真实 Packing List、库存、订单、客户或员工数据。
