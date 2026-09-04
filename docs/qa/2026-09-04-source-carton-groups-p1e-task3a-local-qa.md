# P1E Task 3A 本地 QA：通用 v3 来源箱组数据库投影

## 结论

Task 3A 已补齐 schema v3 Packing List 的数据库确认与投影断点。核心模型使用 shipment、稳定来源范围、实体箱成员、可选托盘映射和 SKU 数量，不依赖供应商、货代、Excel 列名或特定箱号格式。本轮未实现逐箱数量补录、版本证据 API 或页面。

## 数据结构

- `shipment_cartons` 继续表示稳定来源范围。
- 现有 `carton_count` 保存实体箱数量。
- 新增 `scope_kind`：`carton | carton_group`。
- 新增 `shipment_carton_members`：保存成员标识、规范化标识、范围内顺序及来源修订证据。
- shipment 内规范化成员标识唯一；成员记录通过复合外键绑定同一 shipment 的父范围。
- v3 单箱必须有一个与父范围相同的成员；箱组成员数必须等于实体箱数。
- v3 必须显式提供并使用正确 JSON 类型的 shipment、范围类型、实体箱数、成员、SKU和数量；数据库不为缺失字段猜默认值。
- 托盘标识采用与应用一致的大小写与连续空格规范化，并由数据库唯一索引阻止等价标识重复。
- shipment ID 按 UUID 语义比较，大小写不同但数值相同的合法 UUID 不会被误拒绝；无效或不匹配 UUID 仍拒绝。

## 事务行为

- 新的 `dm_confirm_packing_list_revision` 对 v1/v2 委托既有 v21/v20 路径。
- v3 在任何旧投影被替换前完成结构、成员、SKU、数量、采购单行和托盘映射校验。
- 确认与标签、收货操作继续使用相同 shipment advisory lock。
- 校验失败时，Packing List 状态及既有 carton/member/line 投影保持不变。
- v3 投影不调用库存、收货或上架函数。
- 仅公共确认 wrapper 授权 `service_role`；v20/v21 内部确认函数不可直接调用。

## 通用性验证

数据库行为测试刻意使用 `BATCH-A`、`CASE-ALPHA`、`ZONE-02`、`UNIT-RED` 等通用标识，不解析连接符或井号，也没有供应商、货代或文件格式字段。

验证场景：

- 3个稳定来源范围、6个实体箱、2个箱组正确投影。
- 24件商品保持24件，没有按实体箱数放大。
- `physicalPalletCount=4` 且只映射一个托盘：允许。
- 托盘总数未知但记录了一个已知托盘映射：允许。
- 同一成员分配给两个来源范围、或箱组父标识被复用为实体成员：拒绝，旧确认投影不变。
- payload shipment 不匹配、缺少显式范围类型/实体箱数、非字符串成员：拒绝。
- 大小写及内部空格不同但语义相同的托盘标识：投影为同一个规范托盘。
- 在旧投影已进入替换阶段后强制触发成员写入失败：整个事务回滚，旧确认版本和全部旧投影恢复。
- v1 和 v2 Packing List 在 v22 后继续确认。
- 确认前后 `stock_movements` 数量不变。

## 自动化结果

| 检查 | 结果 |
|---|---|
| 迁移契约 RED | 4项按预期失败：v22文件不存在、迁移顺序未包含v22 |
| 迁移契约 GREEN | 4 passed |
| 全量 Vitest | 57 files; 272 passed; 1 skipped |
| TypeScript | pass |
| Next.js 16 Production build | pass; 60/60 static pages generated |
| `git diff --check` | pass |

## 本地数据库验证

- 运行时：`public.ecr.aws/supabase/postgres:17.6.1.159`。
- 网络：`--network none`。
- 从空数据库执行 initial 至 v22：全部通过。
- v21 收货范围顺序回归套件在更新后的UUID语义校验下继续通过。
- `tests/sql/source-carton-groups-v3-projection.sql`：通过并回滚全部夹具。
- 权限：公共 v22 wrapper 的 `service_role EXECUTE=true`；v20/v21内部实现为 false；`anon`、`authenticated` 无成员表读取权限。
- 未连接 Production，未使用或输出任何密钥。

Production 执行 v22 前必须先做一次只读预检：检查现有 `shipment_pallets` 是否含大小写或连续空格规范化后重复的托盘号。若存在，唯一索引会使迁移安全回滚，应先形成明确的数据修复方案；本轮不会自动修改历史数据。

## 延后范围

Task 3B（逐箱 `packing_allocation | observed_contents`、只追加版本、审计 API 与右侧抽屉）已明确延后。触发条件是取得真实逐箱分配资料、出现箱损/箱丢追溯需求，或仓库需要按未拆实体箱查询内容。
