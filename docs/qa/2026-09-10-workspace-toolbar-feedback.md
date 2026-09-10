# 第二批：标题、工具栏与操作提示

范围：沿用 hotfix/workspace-session-continuity-20260910，保留第一批未提交改动。本批只修改显示层，不推送、不部署、不写 Production。

## 已实施

1. 六个内部页面主标题统一字号、字重、行高及字距。主要运营工具栏统一背景与间距；保留业务分区和当前操作控件。
2. Dashboard 窄屏工具栏分行；时区名称完整显示，刷新按钮不再继承 35px 图标按钮宽度。选项仍为原有 Brisbane/Shanghai，未改时间转换逻辑。
3. Reports 导出按钮采用可换行的 12px 间距布局，保留九个现有导出动作。
4. Put away 底部显示暂存→目的库位指引，不再沿用打印文案；保留加载/范围错误及既有上架结果，未调整收货和上架门槛。
5. 新回归已纳入 Chrome/WebKit 的独立体验测试配置。

## TDD 与视觉证据

- 四项初始测试全部失败，分别捕捉时区截断、23px/32px 标题差异、3.75px 导出按钮间距、上架残留 Windows print 指引。
- 首次修复后截图发现刷新按钮仍有 35px 宽度残留；中止正在运行的全站回归，未计为通过。补测文字容纳宽度并观察失败后修复。
- Chrome/WebKit 针对性套件：24/24 通过，含六内部页面、公共页面响应式和新增四项检查。
- WebKit 375px 截图人工目视确认完整时区和刷新文字。截图位于 test-results-experience/experience-visual-workspac-b2d64-iewport-containment-partner-experience-webkit/-partner-375.png。
- 单元测试：399/399 通过。原始 PI 文件 SHA256 与 AUTHORITATIVE_PI 一致，通过 DRIVEMATE_AUTHORITATIVE_PI_PATH 在本地进程补齐此前跳过的采购工作簿检查。
- TypeScript 通过。
- 最终全站 Edge：203 通过，11 个预交易模式条件跳过，0 失败。
- 独立本地交易配置 Edge：32/32 通过，包含默认套件的交易条件跳过场景。该配置仅启用本地内存交易模拟，没有改 Production 交易/GST 开关。
- 认证与角色独立配置：99/99 通过（Edge、Chrome、WebKit），覆盖第一批会话加载修复及既有角色边界。
- 最终生产构建：成功，TypeScript 通过，61/61 静态页面生成；仅本地构建进程 CIRCLE_NODE_TOTAL=3，使用两名构建工作进程。
- 各套件存在重叠，不将这些数字相加作为独立场景总数。
- 非阻断诊断：测试进程 NO_COLOR/FORCE_COLOR 提示；预期 SMTP 失败单测日志；既有官网图片的开发模式 LCP 提示。未因此改业务配置或依赖。

## 当前交付状态

两批本地改动均保留在工作区，尚未提交、推送或部署。四项本批已知问题已完成修复与回归；下一步核对完整差异并完成本地提交，再单独授权 Production 发布。上线后只读复验通过，才进入用户人工全站验收。

## 边界

屏幕 CSS 受 @media screen 限制，未修改标签尺寸、条码或打印模板。未变更业务 API、数据库、权限、MFA、账号、订单、客户、库存、SMTP、DNS、GST、支付及 Production 环境变量。

不把模拟认证、打印对话框测试、本地库存流程视为真实管理员登录、实物标签扫码或仓库现场验收。Production 上线仍需独立授权。
