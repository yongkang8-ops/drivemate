# P1E Task 2 本地 QA

## 结论

箱组元数据已进入标签与收货范围，成员箱号仅作父箱组查询线索。Memory 和 Supabase PostgreSQL 均阻止同范围、父子范围和并发重叠确认造成重复入库；不重叠来源范围继续支持两种收货模式。本轮未连接 Production，未推送或部署。

## 变更范围

- v3 箱组向 `WarehouseExpectedReceipt` 传递类型、实体箱数和成员箱号，产品数量不乘以实体箱数。
- 选择必须使用规范父范围；成员号、未知号、重复号及父子混合选择明确拒绝。
- 幂等键绑定规范化后的请求内容；相同键同一请求安全重放，相同键变更内容拒绝。
- 不同键的已确认范围重叠在创建和确认阶段均拒绝。
- 已打印或已收货的来源范围不得通过改名、拆组或修改预期内容绕过保护；托盘映射变化不改变来源范围身份。
- 待确认的 Unit Product 打印任务在 Packing List 来源范围变化后失效，不能再被登记为 `Printed`；打印确认与 Packing List 确认按 shipment 串行。
- Memory repository 的直接调用与数据库一致，创建收货会话时也必须精确匹配当前已确认 Packing List 的父范围、SKU、条码与预期数量。
- v21 使用 idempotency-key 锁及 shipment 级 transaction advisory lock；公共入口保留给 `service_role`，内部 v15/v20 与校验助手均不直接授权 `service_role`。
- Supabase repository 将业务拒绝转换为可恢复结果，API 可返回 422，而不是未处理异常。

## TDD 证据

### RED

- 规范化空白碰撞：路由测试收到泛化 `{ ok:false, message:"Duplicate carton member" }`，没有字段路径。
- 下游箱组：新增 6 项测试首次运行 6 项失败；元数据丢失、lookup 不存在、不同 key 重复收货成功、并发确认两次成功、变更内容的同 key 重放成功。
- Supabase repository：数据库业务错误导致 Promise rejected，而非可恢复 `{ ok:false }`。
- 本地 PostgreSQL v15 复现：相同10件范围使用两个不同 key 后为20件。
- 独立代码复核复现：待打印任务在来源箱组改名后仍可登记 `Printed`；Memory 直接调用可接受成员箱号或被篡改范围；异步打印确认与 Packing List 修订还能同时成功。

### GREEN

| 检查 | 结果 |
|---|---|
| 规范化路由和草稿聚焦 Vitest | 16 passed |
| 箱组、标签、收货 API 与 repository 聚焦 Vitest | 21 passed |
| 全量 Vitest（复核修复后） | 56 files; 269 passed; 1 skipped |
| TypeScript | pass |
| Next.js 16 Production build | pass; 60/60 static pages generated |
| Pre-arrival、Warehouse、标签 Playwright | 30 passed; Edge |
| `git diff --check` | pass |

## 本地数据库验证

隔离容器：`public.ecr.aws/supabase/postgres:17.6.1.159`，`--network none`。它不包含 Production 连接或数据。

- 从全新数据库执行 initial 到 v21：全部通过。
- v1、v2、v3 当前确认来源范围校验：通过。
- 待打印任务对应的来源范围被改名后，再确认打印：拒绝，任务保持 `pending`。
- 相同 key 的完全相同请求：返回原 session。
- 相同 key 的变更请求：拒绝。
- 相同范围不同 key：拒绝。
- 已确认父范围与全票重叠：拒绝。
- 成员箱号作为独立范围：拒绝。
- 两个不重叠箱组分别收货：20件、2条入库流水。
- 两个真实并发数据库连接同时确认 G1 与 G1+G2：1个成功、1个拒绝；最终1个 confirmed、1个 in_progress、10件库存、1条流水。
- 两个真实并发数据库连接同时执行旧范围打印确认与冲突 Packing List 修订：仅1个成功；打印先成功时修订保持 draft，反向顺序已由顺序测试证明旧打印被拒绝。
- 迁移前已存在 session 的 request fingerprint 回填及同 key 重放：通过。
- 权限核对：收货创建、收货确认、Packing List 确认、打印结果登记四个公开 wrapper 对 `service_role` 可调用；其 v15/v18/v20 内部实现和校验助手不可直接调用。

## 当前边界

- v21 是本地迁移草案，Production 尚未执行。
- v3 Packing List 的数据库实体箱投影和后补装箱明细属于 P1E Task 3；v21 仍依赖 v20 的 v1/v2 确认实现。
- Task 4 才提供箱组专用录入和装箱明细抽屉。本轮页面视觉没有新增生产 UI。
- `products.barcode` 的119 SKU Production 完整性仍未检查。
- Playwright 输出包含既有 `NO_COLOR`/`FORCE_COLOR` 环境警告，不影响30项结果；最终 QA 应继续记录而不是隐藏。

## 独立复审

独立复审结论：Critical 0、Important 0、Minor 0，**无阻断问题**。复审再次运行聚焦测试、全量 Vitest、TypeScript、Next.js Production build 与 `git diff --check`，结果均通过。
