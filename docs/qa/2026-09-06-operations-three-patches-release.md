# DriveMate 三补丁发布组合与集成回归

日期：2026-09-06

状态：本地集成回归通过；发布候选待单独的 GitHub / Vercel Production 授权。没有推送、部署或 Production 数据写入。

## 1. 发布组合

采用“一次发布、三个独立补丁提交”的组合，原分支保留。

| 补丁 | 原分支及原提交 | 集成分支内提交 |
| --- | --- | --- |
| 完整产品标签批量输出 | hotfix/product-label-batch-output-20260905 · 07e00000c357fc065a5cab66f62b79e9a6a2a02b | a6aef8883f85dee27c7e2a9c72e538fa8f7b993f |
| History 筛选与请求范围 | hotfix/history-filter-p1-20260906 · 7ab0a6739d900162b37a2cffc0fd2097a61f0854 | f220f6cd8e254e32e7601567bed1b592e764a796 |
| 导航、编辑定位、History 响应式 | hotfix/navigation-edit-history-p1-20260906 · 93fe9cefd73ffb9085ddb84ae943bb0e19be73c4 | 93fe9cefd73ffb9085ddb84ae943bb0e19be73c4 |

- 集成分支：`integration/operations-three-patches-20260906`
- 共同基线：`e6a32cb11cdd8a6fc2eccba1d320004d62edad18`
- 集成工作区：`C:/Users/yongk/.config/superpowers/worktrees/drivemate-web/operations-three-patches-20260906`
- 应用实现基线：`f220f6c`；后续收尾提交只包含本文和集成测试。
- 准确发布候选 SHA 记录在交付目录的 `release-candidate.json`，上线时须逐字核对。

三个补丁先各自经过复验，再合并到独立集成分支。标签与导航重叠的 `app/globals.css`、`PartnerInboundWorkspace.tsx` 自动三向合并成功；核对后，完整打印文档、导航 URL / 焦点、打印结果确认与收货门槛均保留。没有通过覆盖整文件丢弃另一补丁。

## 2. 本次集成专门处理的内容

1. 新增 `tests/operations-release-integration.spec.ts`，覆盖三个补丁共同作用的真实本地 UI/API 链路。
2. 原 History 筛选测试保留在其独立分支。在集成分支取消 768px 布局豁免，扩大为 375 / 701 / 768 / 880 / 1024 / 1440px 严格断言。
3. 不新增应用功能、不改变业务规则。三份已验收补丁之外的应用实现没有追加改动。
4. 原独立 QA 文档保留为历史记录；其中“未提交”“平板待修复”等旧状态，由本文的集成结果更新。

### 交叉链路

`Full shipment → 输出42张混合SKU标签 → History → C002筛选 + 日期 + 时区 → 浏览器后退 → 取消原打印任务 → History审计 → 刷新 → 检查收货门槛`

验证结果：

- 创建的本地打印任务保存 42 个不可变 item，打印调用获得 42 张标签。
- 切到 History 后没有残留可打印标签文档；筛选第二个来源范围不会跳回第一个。
- 返回标签页面后，原任务仍有结果确认操作，且没有自动再次打印。
- 取消后状态保持 Cancelled，保存的 item 数量和任务数量不变。
- 一个多来源任务不会因范围交集而重复显示审计行。
- 清除筛选保留父级来源范围及显示时区；刷新后仍进入 History。
- 取消前后库存与库存流水逐项相同，未解锁收货。

上述写操作仅作用于本地内存仓库，不是本票 Production 审计记录。

## 3. 集成回归结果

| 检查 | 结果 |
| --- | --- |
| 集成前导航基线 | 289 单元测试通过，1 既有跳过 |
| 产品标签独立复验 | 305 单元测试通过；10 打印相关浏览器测试通过；构建通过 |
| History 筛选独立复验 | 292 单元测试通过；7 浏览器测试通过；构建通过 |
| 集成单元测试 | 62 个文件，308 通过，1 既有跳过 |
| 集成专项测试 | 28 通过，已包含在默认浏览器套件中，不重复累计 |
| 默认全量浏览器测试 | 131 项：120 通过，11 条件跳过，0 失败，0 flaky |
| 独立登录与角色浏览器测试 | 15 通过 |
| 追加“返回不重复打印”断言 | 交叉测试单独复跑通过 |
| 最终优化构建 | 60/60 静态页面生成，退出码 0 |
| 最终类型检查 | 通过，退出码 0 |
| 补丁空白检查 | 通过 |

浏览器合计 **135 项通过**。默认套件的 11 项既有跳过受 Trading / GST 开关约束；未为测试开启这些开关。单元测试的 1 项跳过需要额外提供采购 PI 路径。本地角色/认证页面使用模拟会话，不等同于正式 Supabase Auth 或 SMTP 验收。

所有浏览器运行使用 127.0.0.1 和内存仓库。未复制任何 Production 密钥文件到集成工作区；仅存在仓库自带的 .env.example。NO_COLOR / FORCE_COLOR、Windows LF/CRLF 提示不属于测试断言或构建失败。

## 4. 标签 PDF 验证

以仓库内已批准的 v3 入库行 CSV 和条码回填 CSV 构造本地外部接口 fixture，没有创建 Production 打印任务：

- 119 个 SKU，706 页，逐 SKU / 条码数量一致。
- 每页 70 × 50 mm；没有空白尾页或额外页面。
- 每页都有矢量条码条和完整文本，文本边界未超出纸张。
- 两个箱组各自的数量按 10 件输出，没有乘以实体箱数。
- 首张、末张及箱组样本按 203 dpi 渲染并进行视觉检查。
- 当前标签内容仍为已确认的基础产品标签；没有在此补丁增加 OEM、产品描述或模板编辑模块。

PDF 文件名为 `full-shipment-706-labels-QA-only.pdf`，仅供机器 QA 对照，不能作为已实体打印、已收货或已上架的证明。PDF 数量、尺寸、图形验证不代表真实打印机走纸和实体扫码可靠性。

### 合并后的 History 平板状态

![Combined cancellation history](<D:/AI HUB/Codex agent/Australia car parts project/deliverables/2026-09-06-operations-release-integration/combined-cancel-history-768.png>)

## 5. 未改动范围

没有数据库迁移、环境变量、SMTP、DNS、GST、支付配置、订单、客户或员工数据变更；没有 Production 登录、打印任务、Printed 确认、收货、上架或库存移动。

本轮只把原本未提交的两份补丁分别固化为本地提交，并组成独立发布候选。未执行 GitHub push，未创建 Preview 或 Production Deployment。原分支、工作区及无关文件均保留；自动生成的 AGENTS.md / CLAUDE.md 不纳入业务提交。

## 6. 后续上线方式与回退

取得单独授权后：

1. 只读确认 drivemate-parts 当前 Production Deployment 的实际 ID 与提交，记录为本次回退点。不要直接沿用历史对话中的旧回退 ID。
2. 推送经过验证的集成分支和准确候选 SHA。
3. 从该提交创建全新的 Vercel Production Deployment，使用已有 Production 环境变量，不 Promote 旧 Preview，不修改变量值。
4. 核对正式域名、部署提交、健康状态、构建/运行日志，并用管理员会话执行只读导航与页面复验。
5. 遇到严重问题，按授权回退至第 1 步记录的完整 Production Deployment。回退部署不会删除已存在的业务数据。
6. 如需撤回单一补丁，先在本地执行受控 revert 并重新集成 QA，再发布；不要未经回归在线拆散本次组合。

**本轮发布组合不授权真实业务测试写入。** 小批实印应使用明确范围的正式打印任务，并事先约定试印记录如何处理。只有实际检查正确的实物标签才能确认 Printed；真实收货和上架等待澳洲实际货物操作。

## 7. 本轮方法

using-git-worktrees 用于隔离三个来源与集成版本；test-driven-development 的行为断言规则用于交叉回归；verification-before-completion 要求合并后重新验证；PDF 技能用于输出检查和样本渲染。没有把三个独立的历史“通过”结果直接当成集成通过。
