# v23 Production 备份、迁移及 119 条标签资料回填

结果：**已完成，全部只读核验通过。** 日期：2026-09-07。

## 授权与执行范围

用户本轮授权：Production 逻辑备份 → v23 迁移 → 119 条标签资料受控回填。

- 项目：`gajrgqiwvgjrrbildwme` / `drivemate-parts-production`。
- 实际执行：现有 Supabase 管理会话的 SQL Editor；各阶段独立事务，锁等待上限 5 秒、单语句执行上限 30 秒。
- 当前分支：`feature/label-v4-and-scope-feedback-20260906`，HEAD `c32567c`。本轮没有提交、推送或 Vercel 部署。
- 操作归属：本轮授权管理员 Li Yongkang，`aa3642ef-4369-4ac9-9d5f-e60fc0e9f66e`；执行前通过 `public.user_profiles` 确认仍为 active admin。没有读取或备份 `auth.users`。
- 产品唯一业务改动：`label_profile`；同时正常更新 `updated_at`，逐产品追加审计。

## 1. 逻辑备份

`dm_pre_v23_backup` 创建于 **2026-09-07 13:32:26.893575 UTC / 北京时间 21:32:26**。

| 内容 | 结果 |
| --- | --- |
| 目标 products 完整原记录 | 119 条 |
| 相关历史 audit_events | 238 条 |
| 结构参考 | 列、约束、索引、触发器/相关函数定义、RLS policy 定义、迁移登记快照 |
| 产品全记录备份 MD5 | `da694ed84e8669ed5183c71923afe6ef` |
| 应用角色访问 | anon、authenticated、service_role 均无此 schema 的 USAGE |

备份与原记录在事务提交前逐条相等，回填后的只读检查确认备份摘要保持完整。备份是**同一 Production 数据库内的逻辑回滚参考**，不等于异地灾备；未导出产品成本或完整业务记录。

## 2. v23 迁移

- 原文件：`supabase/migrations/20260908_v23_product_label_profiles.sql`。
- 已登记：version `20260908` / name `v23_product_label_profiles`，仅 1 条。
- `public.products.label_profile` 为可空 `jsonb`，`products_label_profile_schema_check` 存在且已验证。
- 登记文本经 CRLF/LF 换行统一后，与原始迁移 DDL 完全匹配，MD5 `244128220356c5d956bf047686aff8ec`。
- 初次字节摘要不同，经只读定位确认为 Windows 编辑器的 17 个换行转换（本地 726 字符、存储 743 字符）。没有改动迁移业务内容，也没有为此修改生产登记记录。

## 3. 119 条受控回填

回填及全部新增审计时间：**2026-09-07 13:33:32.471010 UTC / 北京时间 21:33:32**。

来源：`docs/operations/product-master/2026-09-07-product-label-backfill-draft.json`。

SHA256：`CF8929C1B840E9E0E5497A90C1E7142FE1757F4BAAEC9B2F316F2CFA6DA40CE4`。

来源草案保留原始审核阶段的 `productionWriteAuthorized:false`，没有为执行改写已核定文件；本轮授权与执行事实由此报告另行记录。

写入前核对原 SKU、barcode、oem_part_number，并将全部产品字段与刚生成的备份比较。非空标签资料、备份后并发修改、身份不符或已有本次审计都会阻止整批写入。

审计 action：`product_label_profile_backfilled`。每 SKU 唯一操作键：`label-v23-20260907:<SKU>`；记录操作者、前后内容、时间、来源文件/摘要/来源行及原因。没有密码、密钥或 MFA 资料。

## 独立只读结果

数据核验时间 13:34:17.602116 UTC；最终迁移/审计补充核验时间 13:36:51.661367 UTC。

| 检查 | 结果 |
| --- | --- |
| 目标 / 匹配产品 | 119 / 119 |
| label_profile 与最终草案逐条完全相同 | 119 / 119 |
| 原 PN 与条码保持原值 | 119 / 119 |
| 唯一条码 / 范围外冲突 | 119 / 0 |
| Position 指定 / 明确省略 | 69 / 50 |
| 新增有效审计 / 唯一操作键 | 119 / 119 |
| 审计前后内容与备份、当前产品一致 | 119 / 119 |
| 其他产品字段差异（排除 label_profile、updated_at） | 0 |
| 原有 238 条审计被修改或丢失 | 0 |
| 备份摘要完整 | 是 |
| SKU、条码、原 PN 身份 MD5 | `e3986b5139763f10e53cff3349d4c345`，前后相同 |

## 本地 SQL 演练与恢复参考

已用本地 PGlite PostgreSQL 合成数据执行同一套 SQL，验证正常 119 条回填、错误 PN 阻止备份、禁止覆盖备份、迁移重复登记拒绝、并发修改阻止全部回填、重复回填不增审计、无关产品及历史审计保留、备份权限隔离。恢复脚本也仅在本地验证，能够恢复原空标签资料并保留所有历史审计，重复恢复会拒绝。

执行工件目录：`D:/AI HUB/Codex agent/Australia car parts project/outputs/01a052ee-eda6-7883-b6a1-473a864f39bf/v23-production-20260907/`。

- `01-backup.sql`、`02-migration.sql`、`03-backfill.sql`：已执行，禁止盲目重跑。
- `04-verify.sql`、`06-metadata-verify.sql`：独立只读复验。
- `artifact-manifest.json`：原始四份执行/核验 SQL 摘要。
- `local-sql-qa.json`、`test-operations.mjs`：本地演练记录。
- `05-rollback-reference-NOT-EXECUTED.sql`：仅恢复参考，**没有在 Production 执行**。需单独决定；若产品在回填后又被修改，会拒绝覆盖。保留 v23 可空列与迁移登记，追加恢复审计，不删除历史。

## 下一步与未执行事项

本轮未执行收货、上架、库存移动、真实打印或 Printed 确认；未修改已确认 Packing List、旧打印任务、产品 ID/SKU/条码/原 PN、客户、订单、员工、Auth、环境变量、SMTP、DNS、GST 或支付配置。

数据库资料已就绪，标签 v4 页面/打印组件仍需独立代码发布。下一步先核对发布文件并完成本地提交，再单独授权 GitHub 推送和全新 Vercel Production 部署；部署时重新读取当前生产版本作为回退点。上线后只读验收，澳洲端另做实体打印和扫码；真实货物操作前不提前确认 Printed 或收货。
