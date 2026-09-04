# GWM 706 件 schema v3 入库主数据核对

## 结论

本草案记录 119 个唯一系统 SKU、706 件可销售汽车配件、35 个来源收货范围和 38 个实体纸箱。两个合并箱号使用 schema v3 箱组表达，实体箱数只用于结构统计，不参与产品数量计算。

Packing List 数据已具备录入条件。Production 条码完整性尚未执行只读核查，且本任务没有 Production 导入授权，因此 productionImportAuthorized 保持 false。

## 控制总计

| 科目 | 结果 |
|---|---:|
| 系统 SKU 行 | 119 |
| 可销售汽车配件 | 706 件 |
| 来源收货范围 | 35 |
| 实体纸箱 | 38 |
| 箱组 | 2 |
| 实体托盘 | 4 |
| 已映射托盘 | 0 |
| 重新加入的减震器 | 40 件，来源范围 29# |
| 非经营物资 | 0；打印机、扫码枪、标签纸、碳带和货架未纳入 |

## 箱组规则

- 7#8#9#：一个来源范围，成员 7#、8#、9#，3 个实体箱，合计 10 件。
- 10#11#：一个来源范围，成员 10#、11#，2 个实体箱，合计 10 件。
- 成员箱号只用于仓库查找父箱组。打印、收货、暂存和上架均使用父范围编号。
- 当前业务流程不要求取得组内逐箱 SKU 数量分配。以后如确有丢箱、破损或未拆箱追溯需求，再通过延期的逐箱证据模块追加记录。

## 托盘边界

客户 Packing List 文件中仍保留装运前的历史文字 6 PLTS / 38 CTNS。货物重新包装后，实际托盘数已确认为 4 个，但每托对应箱号不可靠。

因此本草案使用 physicalPalletCount: 4、palletMappingStatus: not_recorded，且所有 sourcePalletNumber: null。未来取得可靠分配后，可以通过新 Packing List revision 补录，不需要改变来源范围或库存数量。

## SKU 与产品条码

- DM-GWM-0001 至 DM-GWM-0119 保留现有系统 SKU 映射。
- Part Number 保留为来源字段，不替代 SKU。
- 本草案不生成条码。
- 打印和收货必须按 SKU 读取现有 products.barcode。正式导入前需单独执行 Production 只读核查，确认 119 个 SKU 均有唯一且非空的产品条码。

## 来源核对

1. 附件一_GWM首批汽配_Final_PI_20260820.xlsx
   - SHA256：F7C6F6BB4576CCCA62221E50D27E2FCCF3CAB3C46F9889404F87C0B59E9ABB4C
   - 119 个唯一 Part Number、706 件。
   - 商品小计 RMB 63,137.80，商业折扣 RMB 137.80，最终含税合同金额 RMB 63,000.00。
2. 客户装箱清单PL&INV_GWM首批汽配_材质价格版_20260822.xls
   - SHA256：7ADBE3D31F5D318D9D3E59A480D919A2BF2A588CCD79C4CAD1F24AF9BD5DEE47
   - PL&INV 第 12–130 行共 119 行、706 件。
   - 与 PI 和本草案的 Part Number、数量、来源箱号逐项一致。
3. final_order_data_20260820.json
   - SHA256：98CB621C202CA5675BEF0D24E329685215F2C993575B5C9EEB86C960D0A514A1
   - 用于保留既有系统 SKU 序列并交叉核对采购数据。

旧版 draft、旧 CSV 和所有源工作簿均保持不变。

## 后续门槛

1. 对 Production products.barcode 做 119 SKU 的只读完整性与唯一性预检。
2. 取得单独授权后才可把 apiPayloadCandidate 写入 Production。
3. Production 写入前仍需逻辑备份、迁移状态确认和最终导入预览。
