# Operations UI Consistency P1A 低风险布局修复设计

## 1. 背景与重新验证证据

Production Deployment `dpl_51Edzv8rqZ5AZBf52Kge9xiR1WBZ` 的管理员复验确认三个低风险界面缺陷：

1. Dashboard 顶部旧模块导航覆盖 Dashboard topbar 与页面标题。
2. Dashboard Shipment 行在窄桌面宽度下越出 worklist card，并压入 Attention queue 区域。
3. Inventory 的 disabled 主按钮仍呈现为可点击的绿色主操作。

本设计基于重新登录后的受控视口测量：

- 顶部遮挡在 1440、1280、1150、1040、768px 均复现，390px 移动端不复现。
- 1440px 时 `internal-tabs` 位于 y=72-122，Dashboard 标题位于 y=98-133。
- 1150px 时 Shipment panel 右边界为 x=783，行操作链接延伸至 x=897，Attention panel 从 x=803 开始。
- 1280px 时行操作仍在卡片内；1040px 以下既有单列 Dashboard Grid 规则已避免重叠。
- Inventory 中 disabled `Create locations` 的计算样式仍为绿色背景、白字、`cursor: pointer`、`opacity: 1`。

## 2. 目标

1. Dashboard topbar 与页面标题在所有受支持视口中不被旧模块导航覆盖。
2. 保留 Dashboard 到 Staff 模块的私有入口。
3. Shipment reference、业务阶段、三项状态与下一操作在窄桌面下保持可读且不越界。
4. Inventory disabled 按钮在颜色、光标和 hover 状态上明确不可操作。
5. 所有修复都只改变布局和视觉状态，不改变权限、API、业务数据或业务文案。

## 3. 非目标

- 不修改 `RoleGate`、`AuthPanel`、Supabase Auth、MFA 或角色权限。
- 不处理管理员显示为 `Partner / P` 的身份问题。
- 不隐藏 Inventory 的公开 Header、AuthPanel 或 Sign out。
- 不修改 Staff 表格响应式策略。
- 不修改 Packing List、标签、收货、上架、库存或库位数据流。
- 不修改 URL、API、环境变量、SMTP、DNS、GST、支付、订单、客户或员工数据。
- 不引入新的设计系统、组件库、图标库或运行时依赖。

## 4. 设计方向

这是现有 B2B Operations 工作台的保守修复，不进行视觉重构。

- `DESIGN_VARIANCE: 3`
- `MOTION_INTENSITY: 2`
- `VISUAL_DENSITY: 7`

沿用 Geist、Phosphor、DriveMate 深绿色、6-11px radius 和现有状态色。修复只改善层级、边界和交互可辨识度。

## 5. Dashboard 顶部导航修复

### 5.1 根因

`app/partner/page.tsx` 在 `PartnerDashboard` 外额外渲染旧的 `internal-tabs`。该通用样式使用 `position: sticky; top: 72px`，原本假设公开 Header 可见。Dashboard 渲染后，`body:has(.partner-dashboard-app)` 隐藏公开 Header，但旧导航仍保留 72px 偏移并覆盖 Dashboard topbar。

### 5.2 修复规则

- 从 Dashboard 页面移除独立的 `internal-tabs`。
- 在 `partner-dashboard-nav` 中增加 `Staff management`，链接保持 `/admin/staff`。
- `Operations dashboard`、Pre-arrival、Warehouse、Inventory 和 Staff 的现有 URL 不变。
- Partner 继续拥有 Staff 只读访问，Admin 继续拥有 Staff 管理访问，权限仍由现有服务端规则决定。
- 不增加新的固定、sticky 或浮动导航层。

### 5.3 验收

- Dashboard DOM 不存在 `Partner modules` 导航。
- `Partner operations navigation` 中存在 `Staff management`。
- Dashboard 标题与 topbar 完整可见。
- 公开站点导航保持不变。

## 6. Shipment 行窄桌面布局

### 6.1 根因

默认 `.partner-shipment-row` 使用四列：

```text
reference | stage | statuses | action
```

固定最小宽度与三个 16px gap 的总和超过窄桌面 worklist card 的可用内容宽度。

### 6.2 修复规则

仅在 `1041-1240px` 应用两列两行布局：

```text
reference                    action
stage                        statuses
```

- 第一列 `minmax(0, 1fr)`，允许 reference 在卡片内换行。
- 第二列使用内容宽度，action 保持单行。
- `statuses` 右对齐，三项状态垂直排列。
- 每个元素仍使用现有 DOM 顺序、文本和链接。
- `>=1241px` 保留现有四列布局。
- `<=1040px` 保留现有 Dashboard 单列与三列 Shipment 行规则。
- `<=700px` 保留现有移动布局。

### 6.3 验收

- 1280、1150、1040、768、390px 均无页面级水平溢出。
- 1150px 时 `partner-open-action` 的边界完全位于 `partner-shipment-panel` 内。
- 1150px 时操作链接与 Attention panel 没有几何重叠。
- 长 Shipment reference 可以换行，不截断关键标识。
- 状态标签保持完整可读。

## 7. Inventory disabled 状态

### 7.1 根因

基础 `.button` 定义了 pointer cursor 和主按钮颜色，但没有通用 disabled 状态。Inventory 只有少数表格行操作拥有局部 disabled 颜色。

### 7.2 修复规则

只在 `.inventory-location-app` 范围内定义：

- `cursor: not-allowed`
- 低对比中性背景和边框
- 可读的 muted text
- `opacity: 1`，避免文字对比随父元素降低
- 无 hover 变色
- 无 active 位移或阴影

此规则覆盖 Inventory 中的 primary、secondary、打印、编辑和审计按钮，但不影响其他页面。

### 7.3 验收

- disabled `Create locations` 不使用绿色主按钮背景。
- disabled 按钮计算样式为 `cursor: not-allowed`。
- hover disabled 按钮不改变背景、边框或文字颜色。
- 输入有效且完成 preview 后，按钮恢复现有 enabled 主操作样式。
- `disabled` HTML 属性和既有业务判断保持不变。

## 8. 可访问性与视觉边界

- 不依赖颜色单独表达 disabled，保留原生 `disabled` 属性和不可用光标。
- 所有链接继续支持键盘焦点。
- 不改变按钮、链接或状态的 accessible name。
- 不增加动画。
- 保持浅色 Operations 主题，不增加 dark mode 范围。
- 页面不增加 em dash、装饰性状态点或额外 eyebrow。

## 9. 测试设计

### 9.1 RED 测试

1. Dashboard 页面源码不再渲染 `internal-tabs`，侧栏提供 `/admin/staff`。
2. 1150px Dashboard 中 action 完全位于 Shipment panel 内，且不与 Attention panel 相交。
3. 1440、1280、1150、1040、768、390px 的 document scroll width 不超过 client width 1px 以上。
4. Inventory disabled 主按钮计算样式不是 brand green，且 cursor 为 `not-allowed`。
5. Inventory 按钮启用后恢复 brand green 与 pointer cursor。

### 9.2 回归测试

- 既有 Partner Dashboard Playwright。
- 既有 Inventory Location Playwright。
- 全量 Vitest。
- TypeScript typecheck。
- Next.js production build。
- 桌面 1440x900。
- 窄桌面 1150x900。
- 平板 768x844。
- 移动 390x844。

## 10. 实施顺序

1. 为顶部导航、窄桌面几何边界和 disabled 计算样式增加失败测试。
2. 移除 Dashboard 旧模块条并迁移 Staff 入口。
3. 添加窄桌面 Shipment 行媒体规则。
4. 添加 Inventory 范围内 disabled 样式。
5. 执行 focused tests、全量测试、typecheck 和 build。
6. 启动本地 Production build，以受控视口执行浏览器 QA。
7. 用户确认后再推送 GitHub 并创建 Vercel Preview。

## 11. 发布与回滚边界

- 本地分支：`hotfix/operations-ui-consistency-p1a-20260901`。
- Preview 之前需再次说明 GitHub 与 Vercel 外部写入范围并取得授权。
- 不部署 Production。
- 本次不需要 Supabase migration 或数据备份。
- 本地改动可通过 Git revert 恢复；Preview 可直接废弃。

## 12. 完成标准

- 三个目标缺陷均有先失败、后通过的自动化回归测试。
- 受控视口无顶部遮挡、行操作越界或页面级水平滚动。
- Inventory disabled 状态成熟、明确且不影响 enabled 状态。
- Staff 入口仍可从 Dashboard 侧栏访问。
- 未修改认证、权限、MFA、API、数据库或业务流程。
