# P1E 来源箱组与 706 件入库主数据最终本地 QA

日期：2026-09-04

分支：`feature/source-carton-groups-p1e-20260903`

范围：schema v3 来源范围、重复入库保护、数据库投影、运营界面、权威 706 件入库主数据草案。仅使用本地代码、本地测试数据库与 memory repository。

## 最终结论

P1E 上线前计划中的 Task 1、Task 2、Task 3A、Task 4A 和 Task 5 已完成。Task 3B/4B 逐箱证据模块继续延期，不影响标签、收货、BNE-RECEIVING-STAGING、上架和库存流程。

权威 v3 草案通过应用层 schema 验证，记录：

| 科目 | 结果 |
|---|---:|
| 系统 SKU | 119 |
| 可销售汽车配件 | 706 件 |
| 来源收货范围 | 35 |
| 实体纸箱 | 38 |
| 箱组 | 2 |
| 实体托盘 | 4 |
| 已映射托盘 | 0 |
| 重新加入的减震器 | 40 件 |
| 非经营物资 | 0 |

## 来源文件核对

来源目录：`D:\A-PROJECTS\澳洲新能源车配件\2608采购资料`

### 正式 PI

- 文件：`附件一_GWM首批汽配_Final_PI_20260820.xlsx`
- SHA256：`F7C6F6BB4576CCCA62221E50D27E2FCCF3CAB3C46F9889404F87C0B59E9ABB4C`
- 结果：119 个唯一 Part Number、706 件。
- 金额：商品小计 RMB 63,137.80；商业折扣 RMB 137.80；最终含税合同金额 RMB 63,000.00。
- 本次读取到的 hash 与系统采购导入器锁定的历史 hash 完全一致。旧草案引用的另一份 PI 副本不再作为权威来源。

### 客户 Packing List

- 文件：`客户装箱清单PL&INV_GWM首批汽配_材质价格版_20260822.xls`
- SHA256：`7ADBE3D31F5D318D9D3E59A480D919A2BF2A588CCD79C4CAD1F24AF9BD5DEE47`
- `PL&INV` 第 12–130 行：119 行、706 件。
- 与正式 PI 和新 v3 草案逐项比较：Part Number、数量、来源箱号差异均为 0。
- 文件表头仍保留装运前的历史文字 `6 PLTS / 38 CTNS`。系统按用户确认的重新包装后现实状态记录 4 个实体托盘，且不导入失效的托盘归属。

### SKU 控制源

- 文件：`final_order_data_20260820.json`
- SHA256：`98CB621C202CA5675BEF0D24E329685215F2C993575B5C9EEB86C960D0A514A1`
- 用于保留既有 `DM-GWM-0001` 至 `DM-GWM-0119` 系统 SKU 映射。

## 箱组与数量验证

- `7#8#9#`：一个来源范围，3 个实体箱，10 件。
- `10#11#`：一个来源范围，2 个实体箱，10 件。
- 两个箱组合计 20 件，未按 5 个实体箱乘算。
- 33 个单箱范围均有一个与父范围相同的成员号。
- 所有成员标识在 shipment 内唯一。
- `apiPayloadCandidate` 通过正式 `validatePackingListRevision`，结果为 706 件、35 个来源范围、38 个实体箱、2 个箱组。
- 所有 `sourcePalletNumber` 均为 `null`，后续可通过新 revision 补录。

## 机器测试

| 检查 | 结果 |
|---|---|
| Task 5 RED | 10 项按预期失败：v3 JSON/CSV 尚不存在 |
| Task 5 GREEN | 10 passed |
| 全量 Vitest | 57 files；280 passed；1 skipped |
| TypeScript | pass |
| Next.js 16 Production build | pass；60/60 static pages generated |
| P1E focused Playwright | 38 passed |
| CSV 结构读取 | 120 行，含 1 行表头和 119 行 SKU |
| CSV 公式错误扫描 | 0 matches |
| `git diff --check` | pass |

Playwright 覆盖 Pre-arrival、Warehouse、Operations Dashboard 和 Receipt history，包括单箱、箱组、成员箱号反查父范围、父范围打印请求、收货/上架回归以及 390/701/768/880/1280px 响应式流程。

## 本地数据库状态

Task 5 没有新增或修改 SQL，因此没有重复构建数据库容器。最近一次数据库权威结果来自 Task 3A：

- 运行时：`public.ecr.aws/supabase/postgres:17.6.1.159`
- 网络：`--network none`
- initial 至 v22：全部通过
- 原版 v21 → 仅 v22 升级路径：通过
- schema v3 投影、v1/v2 兼容、UUID 语义、重复收货保护、权限与事务回滚：通过
- 测试夹具全部回滚
- 未连接 Production，未使用或输出任何密钥

## 响应式证据

Task 4A 已验证 390、701、768、880、1280px。701–880px 的箱组编辑器横向溢出已修复；长来源编号与 Group 标识保持可读。Task 5 只新增本地数据文件和测试，没有改变页面代码。

## 上线前剩余风险与门槛

1. `packingListDataReady: true`：Packing List 与入库范围数据已核对完成。
2. `productBarcodeReadiness: unknown_until_production_check`：尚未读取 Production 的 `products.barcode`。
3. `productionImportAuthorized: false`：本轮没有真实导入授权。
4. Production 执行 v22 前，仍需只读检查现有 `shipment_pallets` 是否存在规范化后重复的托盘号。
5. 正式导入前需只读确认 119 个 SKU 均存在唯一且非空的 `products.barcode`。
6. 任何 Production Packing List 创建或确认仍需单独说明目标、影响、回滚方式并取得授权。

## 本轮未执行

- 未修改任何源工作簿或旧版 draft/CSV。
- 未访问或写入 Production Supabase。
- 未创建真实 Packing List、标签任务、收货会话、库存流水或员工账号。
- 未推送 GitHub，未部署 Vercel。
