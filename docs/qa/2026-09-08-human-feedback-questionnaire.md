# DriveMate 候选界面人工反馈问卷

版本日期：2026-09-08

用途：配合《2026-09-08-human-acceptance-guide.md》记录人工体验与业务判断。

安全提醒：不填写或上传密码、验证码、一次性密码、MFA二维码/密钥、恢复token；所有URL和截图先移除认证秘密。

> 当前候选尚未部署，本地自动化结果见同日期最终报告。请不要将机器结果预填为人工“通过”。没有执行的项目选“未测”，受权限、设备或真实数据限制的项目选“阻塞”。

## 一、基本信息

```text
验收人：
部门/角色：Admin / Partner / Warehouse staff / Trade / 业务负责人 / 其他
日期与时间：
候选版本/提交：
运行地址：本地 / Staging / 其他（禁止擅自使用 Production）
浏览器与版本：
操作系统：
设备/屏幕尺寸：
缩放比例：
测试账号角色：
Shipment A：
Shipment B：
是否使用 119 SKU / 706 件基线：是 / 否
```

## 二、授权与数据影响确认

```text
本次只读/本地界面验收已确认：是 / 否

是否获准进行真实写入：否 / 是
若是：
  授权人：
  授权时间：
  允许写入的环境：
  允许写入的具体对象/动作：
  禁止动作：
  写入前快照/核对方式：
  写入后核对/回滚方式：

是否获准现场打印/扫码：否 / 是
若是：
  打印机/扫描器：
  纸张与尺寸：
  获准 shipment/scope：
  现场负责人：
```

确认：浏览器 print dialog 或模拟 `window.print` 不等于 `Printed`。

验收人签名/缩写：__________

## 三、结果标记

- `[通过]`：实际执行且有证据，结果符合说明书。
- `[失败]`：实际执行，结果不符合。
- `[未测]`：未执行，不能视为通过。
- `[阻塞]`：缺角色、数据、设备、授权或外部条件。
- 数据影响填写：`R / L / W / P / C`。

## 四、官网、登录与角色

| 编号 | 检查项 | 结果 | 数据影响 | 证据/备注 |
|---|---|---|---|---|
| A01 | 官网品牌、主导航、页脚政策链接可用 |  | R |  |
| A02 | 首页搜索进入 Catalogue，Back 正确返回 |  | R |  |
| A03 | Staff login 进入 `/staff/login` |  | R/Auth |  |
| A04 | 登录网络失败后表单和输入仍可恢复 |  | L/Auth |  |
| A05 | Admin 默认进入 `/partner` |  | R/Auth |  |
| A06 | Partner 默认进入 `/partner` |  | R/Auth |  |
| A07 | Warehouse staff 默认进入 `/warehouse` |  | R/Auth |  |
| A08 | Trade 默认进入 `/portal` |  | R/Auth |  |
| A09 | 获准同源深链接登录后保留目标 |  | R/Auth |  |
| A10 | 外域/循环/未授权深链接被安全拒绝 |  | R/Auth |  |
| A11 | Password setup 后 URL 不残留 token/hash |  | W/Auth |  |

登录/路由最需要改进的地方：

```text

```

## 五、Admin

| 编号 | 检查项 | 结果 | 数据影响 | 证据/备注 |
|---|---|---|---|---|
| B01 | `/admin` 默认只显示 Overview |  | R |  |
| B02 | 八个业务分区名称、内容和 Back/Forward 正确 |  | R/L |  |
| B03 | 首次加载失败显示错误与 Retry，不显示假 0/空数据 |  | R |  |
| B04 | 成功加载后的 refresh 失败保留原数据并提示过期 |  | R |  |
| B05 | Purchasing 更换文件立即清除旧 preview/token |  | L |  |
| B06 | Preview 数量/匹配数来自当前响应，不写死 119/706 |  | R/L |  |
| B07 | Products/Fitment 分页 25/50/100 完整 |  | R/L |  |
| B08 | SKU/master/fitment 草稿切换分区后保留 |  | L |  |
| B09 | 创建新 SKU 不覆盖无关脏草稿 |  | W/C |  |
| B10 | Fitment 缺必填字段时聚焦且不请求 |  | L |  |
| B11 | Bulk SKU/Fitment 本地解析和错误提示清楚 |  | L |  |
| B12 | Costs/Accounts/RMA 消息互不串区 |  | L/W/C |  |
| B13 | 写入 pending 禁重复；未知结果要求先查记录 |  | W/C |  |
| B14 | Staff drawer 键盘、焦点、Esc、返回焦点正确 |  | R/L |  |
| B15 | Partner Staff view 只读，其他角色不可越权 |  | R/C |  |
| B16 | Staff 创建/状态/密码/角色动作符合独立授权 |  | W/C |  |

Admin 最难理解的三个位置：

```text
1.
2.
3.
```

## 六、Partner Dashboard 与 Pre-arrival

| 编号 | 检查项 | 结果 | 数据影响 | 证据/备注 |
|---|---|---|---|---|
| C01 | Dashboard 时区、筛选、分页可恢复 |  | R/L |  |
| C02 | 两个 shipment 切换时数据不混合 |  | R/L |  |
| C03 | 延迟旧响应不覆盖新 shipment |  | R |  |
| C04 | Pre-arrival 当前 shipment/revision 清楚 |  | R/L |  |
| C05 | 脏草稿离开确认：Cancel 保留，确认后才放弃 |  | L |  |
| C06 | 保存/confirm 失败保留输入并提供恢复路径 |  | W/C |  |
| C07 | 119 SKU / 706 件行数和合计一致 |  | R |  |
| C08 | 未授权时没有保存或确认真实 revision |  | W/C |  |

发现的 shipment/scope 混淆风险：

```text

```

## 七、Warehouse 标签、收货、上架与历史

| 编号 | 检查项 | 结果 | 数据影响 | 证据/备注 |
|---|---|---|---|---|
| D01 | Label/Receive/Put away/History 视图切换正确 |  | R/L |  |
| D02 | 当前 shipment 和 source scope 始终清楚 |  | R/L |  |
| D03 | shipment 改变后旧 scope/旧响应不残留 |  | R/L |  |
| D04 | pallet/carton/group lookup 与 Full shipment 正确 |  | R/L |  |
| D05 | 无效/混合 scope 阻止打印和收货 |  | L/C |  |
| D06 | Preview labels 不创建 job、不解锁 receipt |  | L |  |
| D07 | 119/706 标签范围无遗漏、重复、跨 shipment |  | R/L |  |
| D08 | 浏览器打印关闭后没有自动变为 `Printed` |  | W/P/C |  |
| D09 | 实际纸张尺寸、文字、barcode 可用 |  | P/C |  |
| D10 | Cancel/Confirm printed 与实际结果一致 |  | W/P/C |  |
| D11 | Reprint 有真实原因并保留原 artwork/audit |  | W/P/C |  |
| D12 | 未 Printed 时 Confirm receipt 保持禁用 |  | R/C |  |
| D13 | 真实扫码识别 `products.barcode` |  | P/L |  |
| D14 | scope 外/未知 barcode 被明确拒绝 |  | L |  |
| D15 | Counted/scan 数量校验阻止超收或冲突 |  | L |  |
| D16 | Confirm receipt 后 staging/history 一致 |  | W/P/C |  |
| D17 | Putaway 目标 location、数量和 history 一致 |  | W/P/C |  |
| D18 | History 读取失败不显示假“无记录” |  | R |  |

现场打印记录：

```text
是否真实打印：否 / 是
Print job ID：
纸张实际尺寸：
可读性：
Barcode 扫描结果：
是否点击 Confirm printed：否 / 是
依据：
```

现场收货/上架记录：

```text
是否有真实写入授权：否 / 是
Shipment：
Scope：
Expected：
Received：
Receipt ID：
Staging 变化：
Putaway location：
Movement/history ID：
```

## 八、Inventory & locations

| 编号 | 检查项 | 结果 | 数据影响 | 证据/备注 |
|---|---|---|---|---|
| E01 | Location 筛选、分页、刷新、Back/Forward 可恢复 |  | R/L |  |
| E02 | 脏编辑关闭/离开确认正确 |  | L |  |
| E03 | 读取错误与真实空列表区分 |  | R |  |
| E04 | Create/Edit 验证重复 code 和缺字段 |  | W/C |  |
| E05 | Location label preview 不等于 Printed |  | L/P |  |
| E06 | 100 × 50 mm、DMLOC barcode、长 code 可用 |  | P/C |  |

## 九、Trade 与公共页面

| 编号 | 检查项 | 结果 | 数据影响 | 证据/备注 |
|---|---|---|---|---|
| F01 | Trade 查件结果/无结果/错误可区分 |  | R/W/C |  |
| F02 | 旧查件响应不覆盖新查询 |  | R |  |
| F03 | Order pad 本地数量与 PO/job 草稿清楚 |  | L |  |
| F04 | Submit/Cancel 订单防重复且状态同步 |  | W/C |  |
| F05 | Documents 只显示当前 tenant，缺 URL 有错误 |  | R |  |
| F06 | RMA 只接受真实 dispatched order/行项目 |  | W/C |  |
| F07 | Catalogue 结果/空/服务错误与 Try again 正确 |  | R |  |
| F08 | Open account consent/Turnstile/错误恢复清楚 |  | L/W/C |  |
| F09 | Privacy/Terms/Trade terms/Delivery 页面可读 |  | R |  |
| F10 | 法务/业务负责人已单独批准公开文案 |  | C |  |

## 十、横向体验

| 编号 | 检查项 | 结果 | 证据/备注 |
|---|---|---|---|
| G01 | 读取 loading/empty/offline/500/malformed 清楚 |  |  |
| G02 | 写入 slow/repeated/denied/unknown 不丢输入 |  |  |
| G03 | 不自动重试未知写入 |  |  |
| G04 | Back/Forward/刷新保留正确上下文 |  |  |
| G05 | 筛选改变后页码合理重置并可恢复 |  |  |
| G06 | 375/390 px 手机无页面级横向溢出 |  |  |
| G07 | 701/768/880 px 平板布局可用 |  |  |
| G08 | 1280/1440 px 桌面布局清楚 |  |  |
| G09 | 手机横屏与 200% zoom 可用 |  |  |
| G10 | 宽表只在带标签内部区域滚动 |  |  |
| G11 | 全键盘 Tab/Shift+Tab/Enter/Space/Esc 可用 |  |  |
| G12 | 焦点可见、错误与字段关联、关闭后焦点返回 |  |  |

最影响工作效率的问题：

```text

```

最容易造成错误写入的问题：

```text

```

希望优先优化的三个项目：

```text
1.
2.
3.
```

## 十一、缺陷记录（每个问题复制一份）

```text
缺陷编号：
严重度：阻断 / 高 / 中 / 低
验收项编号：
角色：
脱敏 URL（移除认证参数）：
Shipment / Scope / Account：
浏览器/设备/宽度/缩放：
操作前状态：
复现步骤：
实际结果及提示原文：
期望结果：
数据影响：R / L / W / P / C
写入结果：未写入 / 已确认写入 / 未知
已核对记录/history：
截图/视频：
是否可稳定复现：
临时规避方式：
```

## 十二、最终意见

```text
本次人工验收结论：
[ ] 建议继续本地修复
[ ] 建议进入下一轮集成 QA
[ ] 因缺真实数据/设备/授权，部分阻塞
[ ] 不建议进入发布评审
[ ] 其他：

未测或阻塞项目：

已确认真实写入及记录 ID：

已确认现场打印/扫码项目：

必须修复后才能继续的事项：

验收人签名/缩写：
业务负责人复核：
复核日期：
```

当前预设结论：**未验收；候选尚未部署；完整集成 QA 未完成；Production 发布未授权。**
