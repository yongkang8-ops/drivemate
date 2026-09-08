# DriveMate 候选界面人工验收说明书

版本日期：2026-09-08

适用对象：业务负责人、管理员、仓库操作员、Trade 用户、验收记录人

候选分支：`feature/experience-stability-20260908`

运行代码快照：`01d91e5`。最终发布提交由候选分支HEAD确定，勿直接套用到仍运行旧版本的Production。

> 本说明书针对当前本地候选界面。本地自动化结果见同日期最终验收报告；候选尚未部署，本文不代表人工/现场验收通过，也不构成 Production 发布授权。请在独立发布及正式环境只读复验完成后，再按获批范围执行。

## 1. 验收边界与安全门

### 1.1 数据影响标记

- **R — 只读**：浏览、搜索、筛选、分页、打开详情、前进/后退，不应改变业务数据。
- **L — 本地界面状态**：输入草稿、选择范围、切换标签页；离开前可能出现放弃更改确认，但尚未写入后台。
- **W — 真实写入**：创建、确认、取消、调整、收货、上架、修改 Staff 等，会改变持久化业务或账号数据。
- **P — 现场动作**：实际打印、扫码、清点、搬运；必须使用指定设备和真实货物。
- **C — 条件能力**：需要特定角色、业务状态、MFA、已确认 Packing List、已打印标签或其他前置条件。

### 1.2 本轮允许范围

默认先执行 R/L 项。以下行为必须在开始前取得一次明确、针对本次验收的独立授权，并记录授权人、时间、目标数据和回滚/核对方式：

- 提交真实 Trade Account application；
- 创建或修改 Staff、密码、角色、状态；
- 确认 Packing List revision；
- 创建或提交订单、退货、成本、账户调整、SKU、fitment 或采购导入；
- 确认收货、上架或库存调整；
- 创建打印 job、确认 `Printed`、取消或重印；
- 使用 Production、真实邮件、真实 MFA、真实客户或真实仓库数据。

没有独立授权时，写入项只能检查控件、提示、禁用状态和本地草稿保护，不点击最终提交。

记录安全：截图、录像、反馈和链接不得包含密码、一次性密码、验证码、MFA二维码/密钥、恢复token或完整认证链接。记录URL前移除认证参数；账号交付页面只记录操作结果，不拍摄秘密内容。

### 1.3 现场打印与扫码门

- 浏览器出现打印预览或系统打印对话框，只能说明“已打开打印流程”，不能记录为 `Printed`。
- 只有标签从指定打印机实际输出、尺寸/内容可读，并由操作员确认后，才可点击 `Confirm printed`。
- 关闭或取消打印对话框必须保持 job 为待确认或取消状态，不得解锁收货。
- 扫码验收必须使用真实扫描器和实际标签；键盘输入模拟只能记录为界面输入测试。
- `Confirm receipt` 与 putaway 会产生真实库存影响；必须使用获批验收批次并先核对当前 shipment、scope、数量和目标库位。

### 1.4 119 SKU / 706 件基线

本票基线仅用于以下核对：

- SKU/PN 唯一行数应为 119；
- 总件数应为 706；
- 各 pallet、source carton/group 和 SKU 数量合计应与权威 Packing List 一致；
- 分页或打印范围不能漏行、重复行或跨 shipment 混入数据。

除非另有真实收货授权，不得因此创建 `Printed`、receipt、putaway 或库存记录。发现 119/706 不一致时停止后续动作，保存截图和当前 shipment/scope，不自行补数。

## 2. 验收准备

1. 记录候选版本、运行地址、浏览器、操作系统、屏幕宽度和缩放比例。
2. 准备四种测试身份：Admin、Partner、Warehouse staff、Trade。不要共享密码或 MFA。
3. 准备两个内容不同的 shipment，确认各自权威 Packing List 和可识别的 pallet/carton/SKU。
4. 如需 W/P 项，先填写“真实写入授权记录”；否则保持只读。
5. 打开浏览器开发环境后，从公开首页开始；不要直接沿用未知旧会话。
6. 每项记录 `通过 / 失败 / 未测 / 阻塞`。失败时保留 URL、角色、shipment、scope、输入、提示文字和截图。

## 3. 官网、Staff 登录与角色入口

### A01 — 官网公开入口（R）

步骤：

1. 打开 `/`。
2. 检查品牌、Catalogue、Delivery、Account Support、Trade Login、Open Trade Account 和页脚政策链接。
3. 使用首页搜索框输入一个已知 PN，再返回首页。

期望：

- 页面无需登录即可显示，链接名称清楚且可键盘聚焦。
- 搜索进入 `/catalogue`，浏览器 Back 返回原页面。
- 不产生业务写入。

### A02 — Staff login 与失败恢复（R/Auth）

步骤：

1. 从官网点击 `Staff login`，确认进入 `/staff/login`。
2. 尝试空字段、错误凭据、网络失败，再恢复网络。
3. 使用获批测试身份登录；首次密码用户另测 `/password-setup`。

期望：

- 错误不会暴露密码、token、MFA secret 或受保护页面。
- 网络失败后登录表单和输入仍可用，并提供明确重试方式。
- 登录按钮 pending 时不能重复提交。
- 密码 setup 完成后 URL 不残留 recovery token/hash。

### A03 — 角色默认入口（R/Auth）

分别登录并记录最终路径：

- Admin → `/partner`；
- Partner → `/partner`；
- Warehouse staff → `/warehouse`；
- Trade → `/portal`。

期望：角色只看到获准 workspace；Warehouse/Trade 不出现 Administration 或 Staff management。

### A04 — 安全深链接（R/Auth）

步骤：先打开本角色获准的同源深链接再登录，例如 `/admin#products`、`/warehouse?view=receive`、`/inventory`。

期望：

- 获准角色登录后回到正确页面/分区/视图。
- 外域 URL、登录循环或未授权目标被拒绝并回到安全默认入口。
- Back/Forward 不绕过角色门。

## 4. Admin 工作区

### B01 — 默认 Overview 与业务分区（R/L）

步骤：打开 `/admin`，依次访问 Overview、Purchasing、Products & fitment、Shipment costs、Accounts、Orders & returns、Pricing & compliance、Reports；测试旧 `#products` 等深链接和 Back/Forward。

期望：

- 默认只展示 Overview，不同时暴露全部写入表单。
- 每个导航项只显示对应业务区域；未保存输入在分区切换后仍保留。
- 首次 admin state 失败时显示明确错误和 `Retry admin state`，不能用 0 指标/空行冒充真实空数据。
- 已成功加载后刷新失败，原数据保留并提示可能过期。

### B02 — Purchasing preview（L/R；Commit 为 W/C）

步骤：选择权威 PI 与可选 packing JSON，执行 Preview；随后更换任一文件。

期望：

- Preview 本身不写业务数据。
- 更换任一文件立即清除旧 preview/token，旧的延迟响应不能重新启用 Commit。
- 行数、数量、金额、risk 和 packing matched 使用服务器/preview 实际值，不写死 119/706。
- 未经独立授权不点击 `Commit approved preview`。

如获授权提交：重复点击只产生一个请求；结果未知时先检查 saved records，再决定是否手动重试。

### B03 — Products、fitment 与 bulk import（L；Save/Create/Import 为 W/C）

步骤：

1. 编辑现有 SKU master 的一个非关键字段但不保存。
2. 修改新 SKU 和 fitment 草稿，切换分区、分页、Back/Forward 后返回。
3. 检查 Products、Fitment rules、Purchase batches 等分页 25/50/100。
4. 检查 Bulk SKU / Bulk fitment CSV 的本地解析错误与必填字段聚焦。

期望：

- 切换/刷新前对脏草稿给出清晰的保留或放弃确认。
- 创建新 SKU 成功不能覆盖无关的 master/fitment 草稿。
- Fitment 缺少 SKU、Make、Model、Year from 时不发请求，聚焦第一个错误字段。
- 写后刷新失败显示“已保存，但列表刷新失败”，不伪装全部同步完成。

### B04 — Costs、Accounts、Orders/RMA（L；提交为 W/C）

步骤：检查 Shipment ID、Trade account ID、RMA ID 为空时的提示；填写草稿后模拟网络失败。

期望：

- 各分区状态独立，不把 RMA 消息显示到账户或成本操作。
- 缺少 ID 不发送请求，错误与字段关联并聚焦。
- pending 期间相关按钮禁用；失败后输入保留。
- 网络或响应无法解析时提示：`Result could not be confirmed. Check saved records before retrying.`
- 只有服务器明确拒绝时才显示明确失败原因。

### B05 — Staff management（R；账号动作 W/C）

步骤：打开 `/admin/staff`，筛选、分页、打开/关闭抽屉，用 Tab、Shift+Tab、Esc 测试；Partner 身份只读复测。

期望：

- Admin 可见获准动作；Partner 只能查看；其他角色不可进入。
- 抽屉打开后焦点进入，关闭后回到触发按钮；背景不可误操作。
- 筛选/分页可经 URL、刷新、Back/Forward 恢复。
- 创建/Disable/Enable/Reset password/Change role 均需独立真实写入授权。
- one-time password 只在规定时机短暂显示，不进入 URL、日志或持久状态。

## 5. Partner Dashboard 与 Pre-arrival

### C01 — Dashboard 列表、shipment 与时区（R/L）

步骤：打开 `/partner`，切换时区、筛选、分页；在两个不同 shipment 间切换，并用 Back/Forward/刷新恢复。

期望：选择与 URL 一致；延迟旧响应不能覆盖新 shipment；两个 shipment 内容不混合；空、错误、加载中状态可区分。

### C02 — Pre-arrival revision 草稿（L；保存/确认为 W/C）

步骤：打开 `/prearrival`，选择 shipment，展开 revision，编辑 shipment/pallet/carton/SKU 草稿；尝试离开、Back 和切换 shipment。

期望：

- 脏草稿离开前确认；Cancel 保留输入，确认放弃后才离开。
- 失败后输入与当前 shipment 保留；重新选择/重试路径明确。
- revision 历史不可被静默覆盖。
- 119/706 只核对行数、总数量和 scope 合计；未经授权不保存/confirm。

## 6. Warehouse：标签、收货、暂存、上架与历史

### D01 — Shipment 与 source scope（R/L）

步骤：打开 `/warehouse`，分别进入 Label print、Receive stock、Put away、Receipt history；切换两个 shipment，选择 pallet/source scope、Full shipment，并用 carton/group lookup。

期望：

- 页面始终清楚显示当前 shipment 和 scope。
- shipment 改变后旧 scope 被清除或重新验证，旧响应不能覆盖新选择。
- 无效/混合 scope 显示可恢复错误并禁用打印/收货。
- Back/Forward/刷新恢复有效且不会跨 shipment 混入选择。

### D02 — 标签 preview 与 job（Preview 为 L；Print/Outcome 为 W/P/C）

步骤：先执行 `Preview labels`，核对样例、PN/SKU、barcode、数量、shipment/scope；现场授权后才执行 Print。

期望：

- Preview 不创建 job，不改变 receipt gate。
- 119/706 全批核对时页数、SKU 数量、barcode payload 无遗漏/重复。
- `Print labels` 创建 job 并打开打印流程，但关闭窗口后仍不能自动成为 `Printed`。
- 只有实际纸张确认可用后才点击 `Confirm printed`；打印失败/取消使用 `Cancel print`。
- Reprint 必须填写真实原因并保留原 artwork/audit。

### D03 — 收货与暂存（L；Confirm receipt 为 W/P/C）

步骤：在已获授权且已真实打印确认的 scope 中，分别检查 `Scan each unit` 与 `Counted quantity`；使用实际商品标签扫码。

期望：

- 未满足 Printed gate 时 `Confirm receipt` 不可用。
- 扫码只识别 `products.barcode`，未知或 scope 外 barcode 不被替代匹配。
- 数量超出、缺失或冲突时阻止提交并聚焦问题。
- 提交后记录进入 staging/receipt history；结果未知时先查 history，禁止盲目重试。
- 没有真实收货授权时停在输入/校验前，不创建 receipt。

### D04 — Put away（L；确认移动为 W/P/C）

步骤：选择已收货 staging 行，扫描/输入目标 location，填写移动数量。

期望：目标库位可解析、数量不超过 staging、提交一次；成功后 staging 与 location 数量同步，history 可追溯。无真实货物/库位授权时不确认。

### D05 — Receipt/history（R）

步骤：筛选、分页、打开历史详情，核对 shipment、scope、SKU、数量、操作者、时间和状态。

期望：长列表不截断；筛选和页码可恢复；失败时显示读取错误而不是“无记录”。

## 7. Inventory & locations

### E01 — 列表、筛选与详情（R/L）

打开 `/inventory`，筛选 location、分页 25/50/100，编辑 notes/status 后尝试关闭或导航。

期望：筛选/页码恢复；脏编辑关闭前确认；Cancel 保留输入；读取失败不显示假空列表。

### E02 — 创建/编辑 location（W/C）

需真实写入授权。核对 code/type/description，重复 code 或缺失字段应阻止提交；网络结果未知时先查 location 列表。

### E03 — Location label（W/P/C）

Preview、Print、Cancel、Confirm printed、Reprint 的判定与 D02 相同。浏览器模拟打印不能记为 Printed；现场验证 100 × 50 mm、DMLOC barcode、长库位码可读。

## 8. Trade Portal

### F01 — 查件（R/W/C）

打开 `/portal`，输入真实获批 Rego/VIN/关键词；检查结果、无结果、网络失败和恢复。

期望：请求归属当前 Trade account；旧响应不覆盖新查询；无结果与读取错误分开；不得用虚构 Rego/VIN 形成真实业务记录。

### F02 — Order pad 与订单（L；Submit/Cancel 为 W/C）

添加已释放商品、修改数量、输入 PO/job number。未经授权不提交。获授权后检查重复点击、订单 ID、reservation、Orders 列表与 Cancel；结果未知先查订单，不能盲重发。

### F03 — Documents（R/download）

仅当前账户文档可见；缺失 URL、无权限、弹窗受阻和网络失败应有明确提示，不能下载其他 tenant 文档。

### F04 — RMA（L；Submit 为 W/C）

只对真实 dispatched order 和真实退货事实填写原因/SKU/数量。成功后显示可追踪 RMA；网络未知时先查账户/Admin RMA，不重复创建。

## 9. 公共页面

依次检查 `/catalogue`、`/open-account`、`/privacy`、`/terms`、`/trade-terms`、`/delivery-returns-warranty`：

- 内容与链接可读、无登录要求、页脚一致；
- Catalogue 区分结果/无结果/服务错误并可 Try again；
- Open account 的 Privacy/Trade Terms consent 与 Turnstile 清楚；未经授权不提交真实申请；
- 法务/业务文案需由对应负责人单独确认，技术显示正常不等于内容获批。

## 10. 横向体验验收

### G01 — 失败与恢复

对主要读取测试 loading、empty、offline、500、malformed response；对写入测试慢响应、重复点击、明确拒绝和未知结果。期望：不自动重试写入、不丢输入、不把错误当空数据。

### G02 — Back/Forward、筛选与分页

在 Admin、Partner、Warehouse、Inventory、Staff、Trade 中执行筛选 → 下一页 → 打开详情/分区 → Back → Forward → 刷新。期望 URL、页码、筛选、shipment/scope 和安全草稿按设计恢复；未保存数据离开前仅出现一次有效确认。

### G03 — 手机、平板与缩放

至少检查 375、390、701、768、880、1280、1440 px；手机横屏；桌面 200% zoom。期望：无页面级横向溢出，宽表只在带标签的内部区域滚动，按钮/标题/长 ID 不遮挡。

### G04 — 键盘与辅助操作

仅键盘完成导航、表单、分页、drawer/dialog：Tab 顺序合理，焦点可见，Enter/Space 不重复提交，Esc 只关闭可关闭层，关闭后焦点返回来源；错误摘要与字段有关联。

## 11. 失败记录与停止条件

出现以下任一情况立即停止相关写入链：

- 当前角色、shipment、scope、Trade account 或 location 不明确；
- 数量与 119/706 权威基线不一致；
- 请求结果未知且无法从记录/历史确认；
- 打印未实际输出却出现 `Printed` 或 receipt gate 解锁；
- 跨 shipment/tenant 数据混入；
- 密码、token、MFA secret 出现在 URL/日志；
- 重复点击产生重复写入。

记录模板：

```text
用例编号：
结果：失败 / 阻塞
时间与验收人：
角色：
脱敏 URL（不含认证参数）：
Shipment / Scope / Account：
操作前状态：
操作步骤：
实际提示（原文）：
预期：
数据是否可能已写入：否 / 是 / 未知
核对过的记录或历史：
截图/视频路径：
后续处理：
```

## 12. 完成判定

只有全部适用用例有证据、所有失败已解释、角色/多浏览器/两 shipment/119-706 回归完成，并由业务负责人批准所需真实写入和现场步骤后，才能形成人工验收结论。当前状态：**本地自动化报告已出具；待独立发布、正式只读复验及人工/现场验收。**真实浏览器缓存恢复、原生200%缩放和软键盘不能用模拟结果替代。
