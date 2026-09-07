# 标签 v4 发布范围与本地提交前复验

日期：2026-09-07。分支：`feature/label-v4-and-scope-feedback-20260906`。
基线：`c32567c`。本报告随本轮本地提交保存，提交号以 Git 记录为准。

## 本轮授权

核对发布范围并完成本地提交。**不推送 GitHub，不创建或提升 Vercel 部署，不执行任何 Production 数据操作。** 工作区及分支保留。后续发布须独立授权，使用包含本报告的准确提交重新构建 Production，不 Promote Preview。

## 纳入范围

| 分组 | 内容 |
| --- | --- |
| 产品标签 v4 | 70×50 mm，共用预览/打印组件；黑底白字名称、适用品牌、明确的 Position、PART REF.、SKU、既有 Code 128、公司名及网站 |
| 标签资料维护 | 既有 SKU master 编辑区；资料校验、待完善提示、Supabase 与 memory 读写；不推断位置或适配，不改写原 PN/条码 |
| 打印任务兼容 | 新任务由服务端冻结完整内容；历史任务和重印沿用原快照；拒绝混合版本或不完整快照 |
| Find scope | 箱号/箱组查询，错误明显反馈、关联无障碍信息；错误输入保留选择，不新增 SKU 找箱功能 |
| 其他标签 | 库位标签层级与尺寸优化、DMLOC 保持原值；箱标/配送标签准确注明仅有定义，未开放新操作链路 |
| 数据及运维记录 | 已批准的119条标签草案、v23迁移文件、只读前检与生产执行报告、纯本地生成/核对脚本 |
| QA | 对应单元/浏览器回归、专用本地配置、两张小型样板截图、规格/计划/验收记录 |

没有更改角色/MFA策略、收货/上架门槛、库存计算、Packing List、订单、客户、员工、SMTP、DNS、GST、支付或环境配置。数据草案供审核与测试使用，生产运行读取数据库；构建/启动不会自动执行草案回填或 SQL。

## 排除范围

- 自动生成且原计划明确保留未跟踪的 `AGENTS.md`、`CLAUDE.md`，不删除。
- `.env*`、密钥、依赖目录、构建产物、浏览器运行输出、706页PDF、临时调试文件、原始采购工作簿及供应商价格/费用。
- Production 原记录逻辑快照仍仅在数据库私有 schema 内；没有把产品全记录或 auth.users 放入 Git。
- 备份/回填实际执行 SQL 和本地 SQL 引擎在项目 `outputs/.../v23-production-20260907/`，不纳入此应用提交。仓库中的 SQL 生成器只生成本地文件，不连接数据库。

## 本轮新鲜验证结果

| 检查 | 结果 |
| --- | --- |
| `npm test` | 72 文件，351 passed / 1 existing skipped，0 failed |
| `npx tsc --noEmit --incremental false` | 通过 |
| `npx playwright test --config playwright.label-v4.config.ts` | 125 passed / 11 existing conditional skipped，0 failed，约1.9分钟 |
| `npm run build` | 通过，60页生成完成 |
| PDF 独立解析 | 706页；119对SKU/条码及各自份数一致；706页名称/PN/公司网站一致；70×50 mm |
| 响应式与截图 | 375/701/768/880/1024/1440px相关用例通过；重新目视核对768px产品样板、长库位样板，无内容裁切 |
| 独立只读代码审查 | 未发现 Critical / Important 阻断项；权限投影不包含成本，旧快照兼容及错误恢复得到核对 |

浏览器使用专用 localhost:3224 memory/demo 环境，没有接入 Production 或实体打印机。当前浏览器配置本来排除 `account-access-polish.spec.ts`、`auth-panel-redesign.spec.ts`、`staff-role-acceptance.spec.ts` 三份专用验收文件；本报告不把条件跳过或未纳入的用例宣称为通过。类型检查与构建在浏览器回归前后分别完成，未并行占用 Next 构建目录。

## 数据前置及发布顺序

上一授权阶段已完成 `dm_pre_v23_backup`、v23 与119条回填，详见 [生产执行报告](2026-09-07-v23-production-execution.md)。本轮没有重跑生产操作。原始草案的历史 `productionWriteAuthorized:false` 保留不变，后续单独授权记录与执行报告是已执行状态的依据。

后续授权发布时：

1. 核对准确本地提交，读取当时 Vercel Production Deployment 作为回退点。
2. 推送本分支至 GitHub；如 Git Integration 生成 Preview，不用它 Promote。
3. 从同一提交为 `drivemate-parts` 创建全新 Production Deployment，使用现有 Production 环境变量。
4. 检查正式域名、构建及运行日志，管理员登录后仅做只读页面/标签预览验收。
5. 实体打印/扫码由澳洲端操作；未实际完成前不确认 Printed、收货、上架。新建打印任务等生产写入需按后续授权范围执行。

代码回退使用发布时记录的上一 Production Deployment；v23 可空列和已核实资料无需随代码回退删除。恢复标签数据是独立决策，禁止重跑回填、删除SKU或历史审计。
