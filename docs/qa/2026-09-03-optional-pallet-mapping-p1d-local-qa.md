# P1D Optional Pallet Mapping 本地 QA

## 范围

- carton-first Packing List `schemaVersion: 2`
- 可选 `physicalPalletCount`
- carton 级可选 `sourcePalletNumber`
- v1 pallet-first revision 兼容
- Pre-arrival、Dashboard、标签、收货、暂存、上架和历史回归
- v20 Supabase migration 草案静态合同
- 706 件入库主数据草案控制总计

## 自动化结果

| 检查 | 结果 |
|---|---|
| Vitest 全量 | 54 files passed；252 passed；1 skipped |
| TypeScript | `tsc --noEmit` 通过 |
| Next.js Production build | Next.js 16.3.2 编译、类型、60 个静态页面生成通过 |
| 聚焦 Playwright | 41 passed |
| P1D 最终聚焦 Playwright | 29 passed |
| 706 草案控制测试 | 3 passed |
| `git diff --check` | 通过 |

聚焦浏览器覆盖：

- 无托盘映射时确认 Packing List。
- Warehouse 自动采用 Full shipment。
- 已映射托盘仍可按托盘筛选。
- 本地字段校验、保存失败恢复、确认重试和不可变修订。
- Dashboard、标签、收货、暂存、上架、库位、历史和 Staff 回归。
- 701、768、880px 的 Pre-arrival 空状态没有页面级横向溢出。

## 数据库迁移草案

`20260905_v20_optional_pallet_mapping.sql` 已通过静态合同测试：

- 新增可空且为正数的 `shipments.physical_pallet_count`。
- v2 carton-first payload 可写入 `shipment_cartons.pallet_id = null`。
- 只为真实非空 `sourcePalletNumber` 创建 `shipment_pallets`。
- 保留 v1 pallet-first payload 分支。
- 数据库函数拒绝映射托盘数超过实体托盘数，或完整映射数量与实体托盘数不一致。
- SQL 中不存在 `UNASSIGNED`、`UNMAPPED` 或虚构 `P001`。

迁移文件未执行到 Production。

## 页面与交互验收

- Pre-arrival 以 carton 为主要导航。
- `Pallet number` 明确标为 Optional，空值展示 `Not recorded`。
- 显示 Physical pallets、Mapped pallets 和自动计算的 Mapping 状态。
- Warehouse 无映射时显示 `Pallet mapping not recorded · Full shipment selected`。
- Dashboard 分开显示实体托盘数、已映射托盘数和映射状态。

## 706 件草案验证

- 119 个唯一 SKU / Part Number。
- 706 件总数。
- 35 个来源箱号组，代表 38 个实体纸箱。
- 4 个实体托盘，0 个已映射托盘。
- 箱号 `29#` 的 7 个减震器 SKU 合计 40 件。
- 非经营物资全部排除。
- 条码不生成，正式操作时读取 `products.barcode`。

工作簿结构和公式已通过 `@oai/artifact-tool` 检查，公式错误扫描为 0。该工具的本机 PNG render 发生原生进程崩溃，因此改用本机 Excel 只读打开导出的 XLSX，对 `Inbound Draft`、`Carton Summary` 和 `QA Summary` 三张表生成截图并完成视觉检查。标题、表头、数量、异常提示和来源字段均可读，没有空白工作表或关键值裁切。

## 已知门槛

1. `7#8#9#` 和 `10#11#` 尚缺单箱数量分配，草案保持 `importReady: false`。
2. 当前本地 PI 文件 hash 与系统锁定 hash 不同；三份来源的 119 个 PN 和数量语义一致，但本地副本不得直接重新导入采购模块。
3. 尚未从 Production 只读核对 119 个 `products.barcode`；这是正式标签打印前的独立数据验收。
4. v20 尚未执行 Production migration，P1D 也未推送或部署。

## 结论

P1D 代码与本地交互验收通过，可进入用户复核。706 件草案已生成并通过数量控制，但在两个合并箱组拆分完成前不得作为 Production Packing List 确认。
