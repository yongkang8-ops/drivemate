# Navigation / Edit / History Layout Hotfix — 本地验收报告

日期：2026-09-06

状态：本地实现与 QA 已通过用户确认；本轮仅形成独立本地版本，未推送、未部署。

## 结论

已完成本轮确认的三项修复：导航目标、编辑定位、History 平板布局。产品标签输出与 History 筛选补丁没有并入本分支。所有模拟业务操作仅在本地内存环境执行，没有连接或写入 Production Supabase。

- 分支：`hotfix/navigation-edit-history-p1-20260906`
- 代码基线：`e6a32cb11cdd8a6fc2eccba1d320004d62edad18`
- 工作区：`C:/Users/yongk/.config/superpowers/worktrees/drivemate-web/navigation-edit-history-hotfix-20260906`
- 新增回归测试：`tests/navigation-edit-history.spec.ts`，15 项。
- 构建：60/60 静态页面生成通过，命令退出码 0。
- 未新增依赖、数据库迁移或服务端 API 改动。

## 修复内容与验证

| 项目 | 根因与处理 | 验收结果 |
| --- | --- | --- |
| Pre-arrival 导航 | Dashboard / Inventory 原来跳往本票局部区块。现分别进入 /partner、/inventory；本票概览、Packing List 内容、修订记录单独分组。 | 实际点击目标正确，进入 Warehouse 时保留 Shipment。 |
| Dashboard 的 History / Put away 入口 | 原来仅进入 Warehouse 默认标签页。现通过 view 参数指定操作区。 | 直达正确操作区，刷新与浏览器后退保持视图。 |
| Warehouse 导航 | 增加工作区出口，将全局入口与当前操作区分组；模块切换记录 URL，兼容原 History hash。 | 桌面、平板、移动端入口可见且未超出导航容器；移动端点击后定位并聚焦目标标题。 |
| Administration 导航 | Inventory 改为真实库位页面；为现有 Orders、Accounts、Pricing 区块补齐缺失定位目标。 | 逐一点击现有模块，所有目标存在且进入可视区域。 |
| 角色与入口 | 复用 AuthPanel 已取得的角色，仅作为导航呈现信息传递。仓库员工不显示合伙人管理入口；Staff 中仅管理员显示 Administration。 | 角色页面测试通过；未修改角色、MFA 或 API 授权判断，也未增加会话查询。 |
| 库位 Edit | 原来只填充位于长列表下方的表单。现定位编辑区、聚焦 Physical description；Close editor 返回原行按钮。 | 30 个本地模拟库位，1440 / 768 / 375px 下验证通过，不自动保存。 |
| 产品 Edit | 原来只更新 SKU 表单状态。现定位 SKU master data 并聚焦 Barcode，所选 SKU 保持正确。 | 119 行模拟目录测试通过；初次加载不自动跳转，点击 Edit 不发出保存请求。 |
| History 平板 | 原六列最小宽度超过平板内容区。使用内容区宽度判断，窄内容区改为双列字段卡片，筛选区换行。 | 375 / 701 / 768 / 880 / 1024 / 1440px 均通过；所有字段保留。 |
| History 长内容 | 长邮箱在桌面列内也可能溢出。所有记录字段允许完整换行。 | UUID、长邮箱、较长 Outcome 在六种宽度均无单元格横向溢出。 |
| 收货 / 上架前置条件 | 页面可打开，缺少实印确认或待上架库存时展示前置条件，不能创建库存写入。 | 未确认标签时无法确认收货；未收货时无法确认上架。 |
| 最后一批上架结果 | 新空状态不得替换已成功的上架结果。 | 本地模拟 18 件全部上架后保留成功结果，继续确认按钮不可用；无剩余数量时引导查历史，不提示重复收货。 |

## 测试结果

| 检查 | 结果 | 说明 |
| --- | --- | --- |
| 单元测试 `npm.cmd test` | 289 通过，1 跳过 | 59 个测试文件通过。既有跳过项为未提供 PI 路径时的权威采购文件端到端检查。 |
| 专项浏览器测试 | 15 通过 | 包含导航、角色入口、编辑、长字段、响应式与最后一批上架结果；已包含在下方默认浏览器套件内，不重复累计。 |
| 默认浏览器套件 | 107 通过，11 跳过 | 118 项；既有 Trading / GST 开关相关条件测试保持跳过，本轮未开启这些开关。 |
| 独立登录与角色套件 | 15 通过 | 覆盖管理员、合伙人、仓库员工、Trade、首次改密、停用/重新登录提示及登录布局。使用本地模拟会话响应。 |
| 类型检查 `npm.cmd run typecheck` | 通过 | 构建后再次检查，退出码 0。 |
| 优化构建 `npm.cmd run build` | 通过 | 60/60 静态页面生成，退出码 0。 |
| `git diff --check` | 通过 | 无补丁空白错误。Windows CRLF 转换提示属于行尾配置提示。 |

构建/浏览器运行中有既有 NO_COLOR / FORCE_COLOR 提示，无构建失败。以上属于本地代码与页面验证，不等同于正式环境管理员验收、真实邮件投递验收或物理打印/扫码验收。

### 失败到通过的证据

- 修复前，点击 Dashboard 得到 `/prearrival?...#shipment-overview`，未进入 /partner。
- 修复前，History / Put away 深链接不显示目标标题。
- 修复前，库位和产品 Edit 后输入框均为 inactive，焦点留在行按钮。
- 修复前，768px History 面板 clientWidth 为 516px、scrollWidth 为 868px。
- 长邮箱补充测试曾发现桌面 Operator 单元格宽 177px、内容宽 256px；补齐换行后通过。
- 最后一批本地上架测试曾发现成功消息被空状态替换；保留当前上架结果后通过。
- 移动端导航测试曾发现目标标题 viewport ratio 为 0；增加定位/聚焦后通过。

## 截图验收

所有截图均为本地模拟环境，截图中的 QA SKU、库位、账号、日期和参考号不能作为真实库存或生产审计凭证。截图中的 N 图标为 Next.js 本地开发工具，不属于 Production 界面。

### History：平板长字段

![History 768px](<D:/AI HUB/Codex agent/Australia car parts project/deliverables/2026-09-06-navigation-edit-history-qa/history-long-768.png>)

[手机 375px](<D:/AI HUB/Codex agent/Australia car parts project/deliverables/2026-09-06-navigation-edit-history-qa/history-long-375.png>) · [桌面 1440px](<D:/AI HUB/Codex agent/Australia car parts project/deliverables/2026-09-06-navigation-edit-history-qa/history-long-1440.png>)

### 导航：全局与本票区块

![Pre-arrival 768px](<D:/AI HUB/Codex agent/Australia car parts project/deliverables/2026-09-06-navigation-edit-history-qa/prearrival-768.png>)

[Warehouse 手机导航](<D:/AI HUB/Codex agent/Australia car parts project/deliverables/2026-09-06-navigation-edit-history-qa/warehouse-375.png>) · [Warehouse 桌面导航](<D:/AI HUB/Codex agent/Australia car parts project/deliverables/2026-09-06-navigation-edit-history-qa/warehouse-1440.png>)

### 编辑：点击后直接定位

[产品编辑（手机）](<D:/AI HUB/Codex agent/Australia car parts project/deliverables/2026-09-06-navigation-edit-history-qa/product-editor-375.png>) · [产品编辑（桌面）](<D:/AI HUB/Codex agent/Australia car parts project/deliverables/2026-09-06-navigation-edit-history-qa/product-editor-1440.png>) · [库位编辑（平板）](<D:/AI HUB/Codex agent/Australia car parts project/deliverables/2026-09-06-navigation-edit-history-qa/location-editor-768.png>)

其余六种宽度与页面截图保存在本报告所在的 deliverables 目录，共 30 张。

## 代码范围与独立性

- 导航：`app/admin/page.tsx`、`PartnerDashboard`、`PrearrivalShipmentPanel`、`PartnerInboundWorkspace`、`InventoryLocationPanel`、`StaffManagementPage`。
- 编辑定位：`AdminDashboard`、`InventoryLocationPanel`。
- 角色显示信息：`AuthPanel` 回调附带现有角色、`RoleGate` 提供只读呈现上下文。原 hasAccess 计算不变。
- 布局：`app/globals.css`。没有修改 `ReceiptHistoryPanel.tsx` 或 History API。
- 4 个既有浏览器测试从“页面链接必须禁用”更新为“页面可打开、写入确认仍不可用”；新增测试同时覆盖前置条件满足后的正常流程。
- Next.js 生成的未跟踪 `AGENTS.md` / `CLAUDE.md` 不属于业务补丁。
- 产品标签补丁仍留在 `hotfix/product-label-batch-output-20260905`；History 筛选补丁仍留在 `hotfix/history-filter-p1-20260906`。本轮没有改动这两个工作区。

## 下一步

1. 用户已查看本轮交付并确认继续。
2. 本轮单独提交导航、编辑定位、History 布局及对应测试与 QA 报告；保留工作区，不包含自动生成的 AGENTS.md / CLAUDE.md。
3. 发布时明确选择三个独立补丁的集成范围，复核共享文件合并并重新 QA，取得单独的 GitHub / 全新 Production 部署授权。无需再次把 Preview 登录作为默认前置条件。
4. 正式部署后只读复验。实体标签打印、澳洲真实收货与上架按实际货物操作推进；本轮不会提前制造真实库存。

本轮遵循 systematic-debugging、test-driven-development、using-git-worktrees 与 verification-before-completion；同时按 React best-practices 复核事件清理、只读角色呈现及渲染后焦点处理。没有新增大规模页面外壳或编辑抽屉。
