# DriveMate 全站体验收口 — 候选验收报告

日期：2026-09-08。分支：`feature/experience-stability-20260908`。发布基线：`eb8df7c`。

当前状态：本地可自动化范围验收通过，运行代码已冻结于 `01d91e5`（共享规则提交 `618cb10`）；后续候选提交仅补齐测试和验收资料。未推送、未部署。正式环境、实物设备及工具不支持的浏览器行为仍按第5节独立验收。

## 1. 本轮修改与保持不变的边界

- 统一 Staff 入口 `/staff/login`；管理员/合伙人默认 Dashboard，仓库员工默认 Warehouse，Trade 保留客户门户。授权深链接和首次改密优先级保留。
- 内部页面共用账户栏和角色导航。`/admin` 保持原地址，改为业务分区；旧锚点仍有映射，原业务组件与接口保留。
- 完整采购预览、管理清单、Staff、库位、Dashboard 和 Catalogue 分页；可恢复的筛选、页码和列表位置。
- 加强未提交内容提醒、字段错误定位、处理中防重复、未知结果说明、网络失败重试及旧请求隔离。
- 修复 Staff 输入焦点、MFA 取消后晚到回调、公共表单初始化前输入丢失；浏览器缓存生命周期清除密码和受保护 UI 后重新验证会话。
- 保留 DriveMate 品牌、浅色工作区和原标签。响应式样式限制在 screen，不更改标签尺寸、条码、打印确认或收货门槛。

没有修改业务 API、数据库迁移、依赖版本、Vercel 配置、Production 环境变量、SMTP、DNS、GST、支付、真实用户、订单、客户或库存。没有推送、部署或正式环境写入。

跨模块导航采用普通站内链接，由浏览器处理离开确认；会重新加载文档。用户确认离开后，不承诺保存未提交表单。存储的滚动偏好只有坐标和经过白名单的页面键，无表单、密码或业务记录。详见导航决策记录。

## 2. 主要缺陷证据与修复

| 问题 | 实际证据 | 修复与回归入口 |
|---|---|---|
| 登录/改密完成进入错误工作区 | 原固定 `/admin` 路径与仓库/合伙人权限不符 | `auth-entry`、`staff-role-acceptance` |
| 管理中心同时堆出所有写入表单 | 初始 Admin 浏览器用例复现无关表单同时可见 | `experience-admin`，按区展示且保留草稿 |
| 采购预览只显示12行 | 服务端渲染缺少第24行的 RED | `purchase-preview-complete`、`experience-surface-controls` |
| 晚到请求覆盖新对象或重新打开抽屉 | 延迟 shipment/Staff/detail 请求的实际浏览器断言 | `experience-context`、`prearrival-shipments` |
| Dashboard 筛选/时区丢失、旧查询覆盖新结果 | 刷新、乱序响应、31行数据的 RED | `experience-context` |
| 离开表单静默丢失草稿 | 原跨页 Back/Forward、退出、刷新与原地关闭测试失败 | `experience-history-guard`、`experience-recovery` |
| 返回长列表位置丢失 | Inventory 和 Catalogue 原位置与返回位置偏差 | `experience-history-guard`、`experience-surface-controls` |
| Staff 输入首字后失焦 | 顺序键入真实键盘事件后只留下首字 | `experience-recovery`；稳定 Drawer 回调引用 |
| MFA 验证途中离开仍会续办 | 延迟 verify 响应后出现第二次敏感请求 | `mfa-step-up-dialog`；generation 与取消保护 |
| 字段报错未正确聚焦 | disabled fieldset 导致 `.focus()` 无效 | `admin-form-recovery`；待 pending 解除后定位 |
| 新 SKU 创建覆盖其他未提交编辑 | 同时填写产品主数据及适配草稿后创建新产品 | `experience-surface-controls`；保留独立草稿 |
| 初始加载失败伪装为空或缺少重试 | Admin/Warehouse/Prearrival/Trade 网络及HTTP故障 | `experience-recovery`、`experience-admin-actions` |
| 不完整成功响应被误认为已完成/未变更 | 缺少 Staff 一次性结果、成本ID、文档URL等响应 | `admin-form-recovery`、`experience-recovery` |
| 公共表单快速输入被初始化覆盖 | WebKit 开户/目录失败；SSR无JS输入仍可写的 RED | `useHydrated`；`experience-context`及相关恢复用例 |
| 分页按钮禁用状态不明显 | 浏览器计算样式显示禁用按钮 opacity=1 | screen-only 样式及 `experience-admin` |

测试缺陷单独处理：分页新增多个 status 后旧定位不唯一；开发 Strict Mode 使一次性故障注入不稳定；异步拦截响应在测试结束后被提前销毁；多浏览器复用同一测试IP触发跨项目限流。修正的是测试定位、故障模型、清理及隔离，未放宽业务断言、权限或限流。

## 3. 页面与控件族覆盖对照

原始逐项用途、前提、动作、恢复和数据影响见 `2026-09-08-route-control-matrix.md`；该文件是源代码盘点，执行结果以本报告和机器JSON为准。

| 页面/功能 | 真实浏览器交互覆盖 | 服务端/数据覆盖与边界 |
|---|---|---|
| `/` | 搜索、主导航、官网锚点、页脚法律/Staff入口、响应式 | 公共只读内容；法律有效性不由机器判定 |
| `/catalogue` | 搜索、无结果、失败重试、完整分页、刷新/Back及滚动恢复 | Catalogue 本地拦截产品集；真实发布数据需部署后只读复验 |
| `/open-account` | 必填、同意条款、提交、网络失败、草稿离开、初始化保护 | 本地 API 创建/重复/限流另测；真实Turnstile/邮件待正式条件 |
| `/portal` | Trade登录、车辆检索、加入/移除订单、提交/取消、文档、退货、4表分页 | 本地交易开启配置与 API 权限、租户、订单/退货规则；不启用Production交易 |
| `/staff/login` | 四角色默认目的地、支持/恶意深链接、会话失败与重复点击 | 客户端模拟session与服务端权限/生命周期单测分开，不代表真实Supabase登录已复验 |
| `/password-setup` | 首次/恢复入口、成功交接、错误、重复提交、URL清理、输入清除 | 密码服务、恢复解析、首次改密单测；真实邮件/密码不用于机器测试 |
| `/partner` | 查询/时区、刷新、完整工作队列、带上下文跳转、旧请求隔离 | 本地仓库状态投影及真实本地操作后刷新 |
| `/prearrival` | 首票/修订、增加/删除范围和行、验证定位、保存/确认/未知结果恢复、切票 | 本地不可变修订及v3箱组验证；两票不同SKU数量，无Production写入 |
| `/warehouse` Labels | 按托盘/来源/箱组找范围、SKU误输解释、全部标签预览、取消/补打/显式结果 | 本地不可变job、打印gate、119SKU/706页与条码映射；物理打印仍待现场 |
| `/warehouse` Receiving | 扫码/实点、差异与权限边界、重复入库防护 | 本地收货写入 system staging；无真实库存 |
| `/warehouse` Put away | 库位扫描、禁用库位、剩余数量、完成状态与历史 | 本地库存移动与审计；真实搬运仍待现场 |
| `/warehouse` History | 时间/筛选/分页/详情、长引用、只读、旧链接 | 本地收货/上架/打印记录审计；无修改历史 |
| `/inventory` | 库位预览/创建/编辑/关闭、选择/打印/取消/补打、筛选分页、长码 | 本地 API 校验、不可用库位、打印任务；不改变Production库位 |
| `/admin` | 8分区、13清单、9导出、采购预览/提交、产品/适配维护、成本/账户/RMA、审批/开通/暂停/取消 | UI请求合同及本地API分别覆盖；CSV/API存在不代表未上线业务能力已新增 |
| `/admin/staff` | 概览/搜索分页、创建/详情/操作抽屉、一次性密码交付、角色只读、MFA续办 | 本地生命周期服务/权限测试；真实开户、停用、密码/MFA重置未执行 |
| 4个法律页 | `/privacy`、`/terms`、`/trade-terms`、`/delivery-returns-warranty` 链接与页面可读 | 文案合法性与商业条款由业务/法律负责人确认 |

## 4. 机器结果

| 执行组 | 最终结果 | 证据/范围 |
|---|---|---|
| 单元/服务/数据回归 | 78文件、399通过、0跳过、0失败 | `experience-unit-results.json`；含真实PI只读解析、119/706资料和扫码映射 |
| 完整 Edge | 198通过、11条件跳过、0失败、0 flaky；241.5秒 | `experience-edge-results.json`；209用例清单 |
| 登录与角色独立配置 | 93通过、0跳过、0失败、0 flaky；96.3秒 | `experience-auth-results.json`；Edge/Chrome/移动WebKit各31 |
| 本地交易开启独立配置 | 96通过、0跳过、0失败、0 flaky；46.1秒 | `experience-trading-results.json`；三浏览器各32，补齐默认条件跳过 |
| Chrome/移动WebKit体验与标签 | 142通过、0跳过、0失败、0 flaky；297.8秒 | `experience-multibrowser-results.json`；各71，含目录滚动恢复及审批/开通按钮 |
| 独立历史/范围/滚动专项 | 26通过、0跳过、0失败；65.3秒 | `experience-history-results.json`；后续共用改动也在最终Edge及142组复验 |
| TypeScript | 通过 | `npx tsc --noEmit`及生产构建内检查 |
| 生产构建 | 限制本机2个工作进程后通过，61/61静态页生成 | 仅本次命令进程设置 `CIRCLE_NODE_TOTAL=3`；无配置文件/Production环境变量修改 |
| 本地生产模式启动 | 16页面HTTP200；3受保护API匿名访问403 | `next start`，仅localhost内存模式；不等于真实Supabase接通 |

所有数字按配置报告，重叠用例不累加为独立功能数。源码范围审查、MFA/取消、抽屉、滚动和初始化保护的限定独立复审已完成，已提出的明确问题已关闭。

默认 Edge 的11个跳过均来自同一 `api-routes.spec.ts` 的交易前置条件，下表每项在本地交易开启配置的三个项目中执行通过；未修改Production交易开关：

| 原跳过用例 | 原因 / 补测 |
|---|---|
| orders API creates a submitted order | 默认交易关闭；独立配置通过 |
| orders API rejects draft or paused SKUs from trade ordering | 默认交易关闭；独立配置通过 |
| trade state API returns only the current trade account records | 默认交易关闭；独立配置通过 |
| order dispatch API confirms a warehouse dispatch | 默认交易关闭；独立配置通过 |
| order dispatch API requires scanned lines that match the order | 默认交易关闭；独立配置通过 |
| order cancel API releases reserved stock before dispatch | 默认交易关闭；独立配置通过 |
| orders API ignores a forged trade account from trade users | 默认交易关闭；独立配置通过 |
| orders API requires a trade account for staff-created orders | 默认交易关闭；独立配置通过 |
| orders API requires an approved trade account | 默认交易关闭；独立配置通过 |
| warehouse state API returns inventory and pick orders for warehouse users | 默认交易关闭；独立配置通过 |
| admin export API returns operating CSV snapshots | 默认交易关闭；独立配置通过 |

构建例外：第一次默认31工作进程在页面数据收集阶段以 Windows 退出码 `3221226505` 结束，编译/类型检查已成功。检查Next源码确认其按本机CPU数开进程；同代码限制2进程后完整通过。该证据支持采用受控本机构建并行度，**尚未确认原生异常的唯一底层根因**，不将其写成业务代码缺陷已修；Vercel实际构建仍在独立发布门中验证。

视觉证据：自动截图覆盖375/390/701/768/880/1280/1440px及横屏、640 CSS px缩放重排；额外人工查看了Admin桌面/手机、Warehouse平板、Staff手机和Dashboard手机。禁用分页样式、内部表格横向提示、长账号名、来源范围和标签预览在截图中可核对。截图及JSON保存在同日期候选交付目录。

使用 `apple-design` 与 `ui-ux-pro-max` 复核导航可预测性、空间层级、控件/反馈、焦点与响应式；使用 systematic-debugging、TDD 和独立源码复审区分实际缺陷、测试问题和现场边界。未引入新的UI框架、主题或装饰性动画。

## 5. 现场与正式环境待验项（不计通过）

1. 真正的 Production Supabase Auth、SMTP/邮件、Turnstile、管理员现有会话与正式域名/日志；部署须另行授权。
2. 实际浏览器 BFCache 恢复：Playwright 默认关闭/不支持该缓存的导航测试。现有用例只验证生命周期处理和非缓存原生历史，不冒充真实缓存验收。[工具边界](https://playwright.dev/docs/navigations#backforward-cache-bfcache)
3. 200%自动化采用640 CSS px重排等效检查；真实浏览器菜单缩放、移动软键盘、真实屏幕阅读器与实体触摸设备仍在人工检查表。
4. TSC打印机、70×50mm等既定标签的实印尺寸/耗材/扫码、现场贴标，以及货物清点、收货、搬运上架。模拟打印永不代表Production `Printed`。
5. 真实员工/客户、真实订单、成本、账户调整及退货，需要明确对象与数据写入授权。没有设备/业务前提的用例记“未测/阻塞”，不能预填通过。

已知非阻断提示：开发环境 `NO_COLOR/FORCE_COLOR` 提示及 Catalogue 图片优先加载建议；未据此更换框架或扩大性能改造。无JS时受控表单保持禁用，开户页有说明。边界不能解释为所有未来供应商、设备、网络和浏览器版本已经验证。

## 6. 发布与交付门

说明书：`2026-09-08-human-acceptance-guide.md`。问卷：`2026-09-08-human-feedback-questionnaire.md`。

候选通过后只做本地提交与冻结。之后单独取得 GitHub 推送和全新 Vercel Production 部署授权；部署前读取当时生产版本作为回退点，使用现有Production环境变量，不Promote认证配置不一致的Preview。正式域名、日志和已有管理员会话只读复验通过后，再交付人工验收。实印、真实开户和真实收货不随代码发布自动执行。
