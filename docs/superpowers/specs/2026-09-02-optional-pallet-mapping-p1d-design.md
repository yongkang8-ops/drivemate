# P1D Optional Pallet Mapping 设计

## 1. 背景与已确认事实

- 首票最终实际发运汽车配件合计 706 件，包含重新加入的 40 个减震器。
- 重新包装后共有 4 个实体托盘，但现阶段没有可靠的箱号到托盘号映射。
- 系统不得生成虚假的 `P001` 至 `P004` 或 `UNASSIGNED` 托盘记录。
- 未来取得可靠资料后，允许通过新的不可变 Packing List revision 补录真实托盘映射。
- 打印机、扫码枪、标签纸、碳带、货架等非经营物资不进入本票进销存主数据。

## 2. 目标

1. 允许 Packing List 在没有箱到托盘映射时创建、校验、确认和投影。
2. 独立记录已知的实体托盘数量，不将其等同于系统内已映射托盘数量。
3. 保持 carton、SKU、标签、收货、暂存、上架和历史链路正常工作。
4. 后续可通过新 revision 添加部分或完整映射，旧 revision 永久保留原始事实。
5. 完整兼容现有 `schemaVersion: 1` 的 pallet-first revision。

## 3. 非目标

- 不在本轮执行 Production Supabase 迁移。
- 不创建或确认 Production Packing List。
- 不写入真实库存、收货、上架、订单、客户或员工数据。
- 不推送 GitHub，不部署 Vercel Production。
- 不猜测 706 件货物的箱号、托盘号、SKU 或数量分布。

## 4. 规范数据结构

新 revision 使用 `schemaVersion: 2`，以 carton 为主结构，托盘号为可选字段：

```json
{
  "schemaVersion": 2,
  "shipmentId": "shipment-id",
  "physicalPalletCount": 4,
  "cartons": [
    {
      "sourceCartonNumber": "CTN-001",
      "sourcePalletNumber": null,
      "lines": [
        {
          "sku": "DM-GWM-...",
          "expectedQuantity": 10
        }
      ]
    }
  ]
}
```

兼容读取的旧版结构继续保持：

```json
{
  "shipmentId": "shipment-id",
  "pallets": [
    {
      "sourcePalletNumber": "P001",
      "cartons": []
    }
  ]
}
```

服务端将两种输入规范化为统一的 v2 validated model；旧 payload snapshot 不被改写。

## 5. 映射状态

`palletMappingStatus` 是投影值，不由操作员直接选择：

- `not_recorded`：所有 carton 的 `sourcePalletNumber` 都为空。
- `partial`：部分 carton 有真实托盘号，部分为空。
- `complete`：所有 carton 都有真实托盘号。

当 `physicalPalletCount` 已知时：

- 不同真实托盘号数量不得超过 `physicalPalletCount`。
- `complete` 状态下，不同真实托盘号数量必须等于 `physicalPalletCount`。
- `partial` 可保存和确认，但页面必须明确显示尚未完成。

## 6. 持久化

新增本地 v20 迁移草案：

- `public.shipments.physical_pallet_count integer null`，非空时必须为正整数。
- 继续使用现有可空的 `public.shipment_cartons.pallet_id`。
- 更新 `public.dm_confirm_packing_list_revision`：
  - v1 payload 按既有 pallet-first 方式处理；
  - v2 payload 先验证 carton SKU，再按不同的非空 `sourcePalletNumber` 创建真实 pallet；
  - 未映射 carton 写入 `pallet_id = null`；
  - 将 `physicalPalletCount` 投影到 shipment；
  - 继续以原子事务方式替换当前 confirmed projection。

Packing List revision 的 `payload_snapshot` 仍是审计真源，revision 不可变规则保持不变。

## 7. 页面与交互

### 7.1 Pre-arrival

- 增加 `Physical pallets` 数字字段，允许未知；本票草案填 4。
- Packing structure 以 cartons 为主要导航。
- `Pallet number` 标注为 `Optional`。
- 空值展示 `Not recorded`，不得显示 `UNASSIGNED`。
- 显示自动计算的 `Pallet mapping: Not recorded / Partial / Complete`。
- 后续补录继续使用 `Create revision`，不编辑旧 revision。

### 7.2 Operations 与标签

- Full shipment、carton 和 SKU 范围始终可用。
- 仅真实映射过的托盘可进入 pallet filter 和按托盘打印。
- 未映射 carton 不得因缺少 pallet 而从 shipment/carton/SKU 范围中消失。
- 收货、`BNE-RECEIVING-STAGING` 和上架继续以 shipment/carton 为业务范围，不要求托盘。

### 7.3 Dashboard

分别展示：

- `Physical pallets`：已知实体数量，例如 4。
- `Mapped pallets`：不同真实托盘号数量；无映射时显示 `—`。
- `Pallet mapping`：投影状态。
- `Cartons` 与 `Expected units`：独立计算。

Dashboard 不得把缺少映射投影成一个虚拟托盘。

## 8. 兼容与回滚

- v1 API payload、memory fixtures 和已保存 revision 可继续读取、确认和投影。
- v2 成为新建 revision 的默认格式。
- v20 仅新增可空字段并替换确认函数；回滚时可恢复 v14 函数，新增字段可保留而不影响旧版本。
- Production 执行和回滚需另行授权。

## 9. 本地验收标准

1. 无托盘映射的 v2 Packing List 可通过客户端、API 和领域校验。
2. 确认后生成 carton/line projection，但不生成 pallet projection。
3. 部分映射与完整映射状态正确。
4. 超过已知实体托盘数或完整映射数量不一致会被拒绝。
5. v1 revision 回归测试保持通过。
6. 标签、收货、暂存、上架、Dashboard 和历史不依赖托盘映射。
7. 桌面、平板和移动端没有新增裁切或不可操作状态。
8. Vitest、typecheck、Next.js Production build 和聚焦 Playwright 全部通过。

## 10. 706 件草案边界

P1D 本地 QA 通过后，再只读检索“财务模型与下单边界”任务中的最终资料，生成本地 JSON、CSV 和核对报告。草案必须满足：

- 汽车配件总数量精确为 706。
- 包含重新加入的 40 个减震器。
- `physicalPalletCount = 4`。
- 所有未知 `sourcePalletNumber = null`。
- 不推测缺失箱号或箱内分布；缺失项进入差异报告，不伪造主数据。

