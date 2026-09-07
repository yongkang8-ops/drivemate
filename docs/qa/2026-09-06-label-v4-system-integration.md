# 标签系统 v4 本地验收报告

日期：2026-09-06。分支：`feature/label-v4-and-scope-feedback-20260906`，基线 `c32567c`。

交付状态：本地修改尚未提交 Git；未推送、部署或执行迁移。服务器已重新启动，`/warehouse` 最后 HTTP 检查返回 200。收尾时内置浏览器连接被旧断线页阻挡，未声称已成功保留浏览器标签页；可通过下方本地地址或已保存截图查看。此连接问题发生在最终自动化回归之后。

## 任务与结果

| 顺序 | 范围 | 实现与验证 |
|---|---|---|
| 1 | 标签资料合同及保存 | nullable `products.label_profile`；英文名称、适用品牌、中性 reference、三态 Position。新增/修改/清空/省略字段、深拷贝、非法内容和仓库员工写入拒绝都有测试。v23 仅本地 SQL 文件。 |
| 2 | 编辑区与 v4 输出 | 在现有 SKU master editor 维护资料。预览和批量打印共用组件。新任务保存完整内容与版式版本，旧任务保留原版；缺失或混合版本拒绝输出。 |
| 3 | Find scope | 仍只查来源箱号/箱组；已知 SKU 或产品条码显示类型提示；空值/未知箱号保留当前选择；成员箱定位父箱组；错误有明确颜色与 aria 关联。 |
| 4 | 其他标签 | 100 × 50 mm 库位标签优先显示完整编码，保留 DMLOC。校正箱标与配送标签定义及能力说明；未虚构这两类标签的操作流程。 |
| 5 | 集成回归 | 单元、Supabase SDK 本地传输模拟、浏览器交互、页面响应式、706 页 PDF、构建和独立代码审查。最终结果见下。 |

## 实际执行

- `npm test`：343 passed，1 existing skipped，70 files。
- `npx tsc --noEmit --incremental false`：通过，最终构建再次通过 TypeScript 检查。
- `npx playwright test --config playwright.label-v4.config.ts`：124 passed，11 existing conditional skips，0 failures（2.1 分钟）。
- `npm run build`：最终版本通过，60 页构建完成。
- `git diff --check`：按仓库既有 CRLF 规则通过；没有永久更改 Git 换行设置。
- 本地端口 `3224`，独立配置强制 memory repository 和 demo auth；不复用未知服务器。

### 覆盖说明

- API 使用真实本地 MemoryRepository；Supabase SDK 测试只替换 fetch，主机固定为 `label-transport.invalid`，无网络发送。
- 两个专用 SDK 测试验证 JSON 字段写入、省略保留、null 清空，以及只读取 sku/barcode/label_profile，不读取成本或账号资料。
- 706 页检查使用已确认来源文件的 SKU/数量/条码映射，搭配明确的 `LOCAL QA PRODUCT` 合成文字；验证每 SKU 份数、119 个唯一条码、706 个非空页、70 × 50 mm MediaBox、DOM 无溢出、取消/重印/未确认行为。
- 产品文字、Position、预览完整宽度、箱号错误恢复和长库位标签覆盖 375/701/768/880/1024/1440px；打印任务卡另覆盖 390/1040/1600/1920px。
- 浏览器脚本没有发送任务给实体打印机。Printed/收货/上架/Staff 行为均为本地内存模拟，不代表真实业务操作。
- 标准浏览器配置原本排除三个专用验收文件，本轮保持不变。11 个交易/GST 条件用例沿用已有跳过条件；没有修改 GST 或交易开关。单元 1 个跳过项依赖外部 PI 路径，本轮未提供。不能将这些跳过项写成“已验收”。

## 回归中发现并处理

本地屏幕输出截图：[产品标签（含 Position）](label-v4-artifacts/product-v4-position.png)、[长库位标签](label-v4-artifacts/location-v2-long-code.png)。两者为本地 QA 夹具，非真实货物打印文件。

1. 产品标签预览的侧栏过窄，出现标签内部横向裁切。已调整最小侧栏宽度，1100px 以下改上下布局；实际标签尺寸不缩放。
2. 移动端固定尺寸库位标签撑宽整页。已改为可收缩网格轨道，局部预览容器滚动；打印纸张保持 100 × 50 mm。
3. 无 job version 的记录可携带 v4 artwork，造成 legacy/v4 混批。独立代码审查指出后已复现红测并修复；job version 与每项 artwork 必须匹配。
4. 更新测试中硬编码 3100 端口、重复 alert 定位、innerText/textContent 混用及过时的桌面三栏断言。保留可见性、容器边界、按钮可操作和文字不裁切检查；布局列数按实际容器宽度验证。

## 不在本轮完成范围内

- 未执行 v23 或任何 Production SQL；没有使用现有 119 SKU 的真实记录做修改。
- 未写入真实标签任务、Printed、收货、上架、库存移动、员工或客户记录。
- 未推送 GitHub、未部署 Vercel，未修改环境变量、SMTP、DNS、GST、支付。
- 未做实体打印、扫码、耐久度或包装贴附测试；由澳洲实际设备验收。
- 箱标、配送标签当前为定义层，不能声称已有操作页面或承运商集成。

## 本地人工查看

启动本地 memory 服务后打开 `http://127.0.0.1:3224/warehouse`。

1. 查看首个示例产品：黑底白字名称、For 品牌、PART REF.、SKU、条码和公司网站。
2. Find scope 输入 `DM-GWM-OF-001`：应解释这是产品标识，选中范围保持不变。输入 `C002`：应切换来源范围。
3. `/admin` → SKU master data：选择产品，编辑 Supplementary product label，保存后刷新，再回 Warehouse 查看。
4. Position 选择 Not applicable：标签省略此行；Not yet confirmed：显示资料待补，不能创建该范围的新标签任务。
5. `/inventory` 仅在本地示例环境创建/选择示例库位并 Preview location labels，核对完整库位编码和 DMLOC。

## 下一步

先审核本轮本地改动与 v23，以及 119 SKU 的标签字段来源/缺项清单；备份、迁移、真实资料回填和生产发布仍需分别授权。澳洲完成小批实印后，再按实物进度确认 Printed 和收货，不以机器测试代替实物状态。
