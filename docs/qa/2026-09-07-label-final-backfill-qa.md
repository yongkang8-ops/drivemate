# 最终标签回填草案与只读发布前核对

> 后续状态更新：本报告保留执行前的历史结果。本轮另获授权后，Production 逻辑备份、v23 迁移及 119 条标签资料回填已完成并核验通过，详见 [生产执行报告](2026-09-07-v23-production-execution.md)。代码提交、GitHub 推送与 Vercel 部署尚未执行。

日期：2026-09-07。分支：`feature/label-v4-and-scope-feedback-20260906`，HEAD `c32567c`；标签v4及本轮文件仍为本地未提交改动。

## 已完成

1. 已将Chris经用户转述的三组PN确认落实到119条最终标签草案。
2. 119个SKU、119个扫描条码、706件、35个来源范围全部保持原映射。
3. 本地真实文字706页输出与两种收货模式的扫码映射回归通过。
4. 已使用现有Supabase管理会话执行一次Production SELECT只读检查，身份指纹一致；未执行生产迁移或回填。

## 数据处理

- `1017100EG01`与`1017100-EG01`标签显示统一为`1017100-EG01`；0009/0021两条SKU及各20件保留。
- `1017110XED95`与`1017100XED95`各自PN保留，记录Cannon柴油2.0T/2.4T单独滤芯互换；0028/0029各8件，未扩大为壳体、总成或其他车型通用。
- 0031标签PN由`1109110XPE6EXA`更正为`1109110XP6EXA`；0030/0031及各4件保留。
- 0082按PN对应供应商标签照片使用`FRONT / RIGHT (RH)`。
- 英文名称采用本轮已委托的行业表达，刹车盘`BRAKE ROTOR`、平衡杆球头`SWAY BAR LINK`、机油滤芯`OIL FILTER`。
- 69条显示有依据的Position，50条经本轮补充标签内容审核明确省略该行。原始位置证据另存；省略不代表新增左右/前后通用声明。规则只适用于明确列出的50个SKU，新产品的unknown不会自动变为可打印。
- `referenceDecision`中的旧写法、笔误及互换关系仅记录于本地资料草案，本轮不新增PN别名搜索功能，不写适配规则。

## 回填文件

`docs/operations/product-master/2026-09-07-product-label-backfill-draft.json`

SHA256：`CF8929C1B840E9E0E5497A90C1E7142FE1757F4BAAEC9B2F316F2CFA6DA40CE4`

草案只允许产品业务字段`label_profile`。每行保存预期原PN、SKU、条码及数量供核对，不能以更正后的展示PN作为匹配键。保留数据库`oem_part_number`、ID、SKU、条码、库存、已确认Packing List及旧打印快照。生产执行时由既有触发器或明确授权的审计方案处理更新时间/审计，不直接把本地审核元数据写入产品字段。

## 本地验证

- 生成器先红测：3个预期失败（PN显示更正和兼容决策尚未落实）；实现后4项通过。
- 全单元套件：72文件，351 passed，1 existing skipped。
- 浏览器全套件：136用例，125 passed，11 existing conditional skipped，0 failed，约1.9分钟。采用专用本地3224 memory/demo配置。
- 新增真实数据输出用例：706页、119个独立条码、每SKU份数逐项一致，全部名称、品牌资料、PN和页内尺寸验证；375/701/768/880/1024/1440宽度无整页横向溢出。
- 真实`prepareWarehouseReceipt`验证器：scan_each模拟706次扫描，counted_quantity模拟119条数量，两者输出相同；纠正展示PN不合并原条码，直接把PN当扫描码会被拒绝。
- 原有API回归保留不可变打印快照、旧版打印、取消、重印、收货和上架保护。
- 保存PDF独立读取：706页、119对SKU/条码的逐项数量、每页英文名称/PN/公司网站、70×50mm尺寸全部匹配。实际标签PNG及PDF第一页渲染已目视检查。
- `npx tsc --noEmit --incremental false`通过；`npm run build`通过，60页生成完成；`git diff --check`通过（存在仓库原有LF/CRLF提示）。
- 新浏览器测试最初遇到Node JSON import attribute错误，改为与既有测试一致的本地文件读取后通过，无应用代码修改。
- 旧PDF检查脚本因当前运行环境缺少PyMuPDF未能运行；改用已安装pypdf做逐页独立检查，并用Poppler渲染实际PDF，未安装新依赖。

本地机器验证不等于澳洲设备上的实体打印/扫码验收。测试未调用实体打印机；本票未被标为Printed，未生成真实收货或库存。

## Production只读结果

2026-09-07 13:09:10 UTC（北京时间21:09:10）：

| 检查 | 结果 |
| --- | --- |
| 目标产品数 / 唯一SKU | 119 / 119 |
| 唯一非空条码 | 119 |
| 空条码 / 范围外条码冲突 | 0 / 0 |
| SKU、条码、原PN整体身份指纹 | 本地与Production完全一致 |
| 身份MD5 | e3986b5139763f10e53cff3349d4c345 |
| label_profile列 | 不存在，尚需v23 |
| 已填标签资料 | 0 |
| 已登记v23 | 0 |

仅执行保存于`docs/operations/product-master/2026-09-07-label-backfill-readonly-preflight.sql`的SELECT。结果在`docs/qa/2026-09-07-product-label-production-preflight.json`。没有查询auth.users、客户、员工、订单或成本字段。SQL Editor可能保存查询历史，业务数据写入为0。该检查不是备份，写入前需重验身份及更新时间，避免覆盖检查后产生的新资料。

## 当时拟定的下一阶段（授权前历史记录）

1. Production逻辑备份：保存本次119个products原记录及必要审计/结构信息，明确恢复方式。
2. 执行并登记本地v23标签资料迁移。
3. 按身份预期和空标签资料条件受控回填119行`label_profile`，记录操作者、时间、变更前后与来源；不合并SKU或重算库存。
4. 复核119行、字段内容、条码唯一性及审计。
5. 本地代码提交与发布范围确认后，单独授权GitHub推送、全新Vercel Production构建，使用现有Production配置，并读取当时生产部署作为回退点。
6. 正式域名只读验收；澳洲另做小批实体打印及扫码，实物操作完成后才确认Printed/收货。

代码回退不能代替数据库恢复。当前v23只新增可空字段，资料恢复应按备份和变更记录处理，不能用删除SKU方式回滚。
