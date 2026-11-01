# James：TE344 后台试印操作

适用：TSC TE344 300dpi、Windows 11、USB；70×50mm 热转印标签。首次可使用铜版纸配蜡基碳带。

## 设备准备

1. 按客服视频装纸、装碳带，安装 TE344 300dpi 驱动并选择 USB。
2. 在 Windows 打印机列表确认 TE344 在线，清除现场确认可取消的旧队列任务。
3. 驱动选择 Thermal Transfer；按实际标签选择 Gap 或 Black Mark 并执行传感器校准。
4. 连续按 Feed，确认每次停纸位置一致，无连续空走、卡纸或报警。

## 后台试印（功能发布后）

1. 从 Staff 登录入口进入 Inbound operations → Label print，核对当前装运和来源范围。
2. 有待确认的正式打印任务时，先按真实情况处理该任务。
3. 点击 Test print，在右侧面板选 3 个标签资料完整的 SKU；每款保留默认 2 张，共 6 张。
4. 点击 Create test task，等系统显示保存成功的测试任务编号。
5. 点击 Open test print dialog，选择本机 TE344；纸张70×50mm、100%比例、Copies=1、关闭页眉页脚、开启背景图形。
6. 首张不合格时停止队列并核查设置；按实际结果选择 Record test failed 或 Cancel test，填写原因。重新试印使用新测试任务。
7. 全部实物合格后点击 Confirm test printed。测试结果保存在 Test print records，正式收货状态保持不变。

## 实物检查

- 每张均有 TEST — NOT FOR STOCK；共6张，3个SKU各2张。
- 宽70mm、高50mm，内容完整，连续打印不偏移；黑底白字及条码清楚。
- 在 Windows 记事本中扫码，逐张核对结果与标签下方编码完全一致。
- 不在收货输入框中调试扫码。测试标签单独保管，验收后作废，不贴真实商品。

## 异常恢复

- 创建结果不明：点击 Check saved request；不要另开新任务重复点击创建。
- 刷新后：重新打开 Test print，从原请求或 Test print records 恢复。
- 原请求尚未找到：可重新勾选原SKU和数量，使用 Retry selected request，系统沿用同一个请求编号。
- 结果保存不明：点击 Check saved request 读取最终状态。
- 已打印但页面刷新：先核对实物，再记录结果；不要为了记录结果而再次打印。

## 发布检查清单

- 先确认新增独立测试表迁移及备份范围，再单独授权 Production 迁移与代码部署。
- 部署后只读检查测试接口权限、正式收货门槛和历史记录。
- James 确认设备准备完成后，再授权创建首个真实测试任务与6张试印；本地自动测试不驱动实体打印机。
