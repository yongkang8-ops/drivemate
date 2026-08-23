# DriveMate 澳洲车辆识别数据服务商专项设计

日期：2026-08-23  
状态：已批准进入供应商测试准备  
业务主体：DRIVER MATE PTY LTD（ABN 66 701 612 768）

## 1. 已确认范围

本专项只解决以下闭环：

```text
AU Rego + State 或 17位VIN
→ 经过确认的澳洲车辆配置
→ DriveMate首批119个GWM SKU
```

不采购全澳所有品牌、所有零件的完整目录。BYD和MG样本只用于验证供应商对中国品牌澳洲车型的识别能力，并作为首批GWM SKU匹配的负向控制。

## 2. 核心设计原则

1. 车辆识别数据与配件适配数据分层维护。
2. 第三方供应商只提供车辆身份和候选配置，不直接决定DriveMate SKU适配。
3. 多候选、低置信度或无匹配必须进入workshop确认或人工审核。
4. 只有approved vehicle configuration和approved fitment rule可以返回可售SKU。
5. API key只存在服务端，浏览器不得直连供应商。
6. 不抓取州政府Rego页面，不把公开查询页面当作商用API。
7. 不向AI模型发送完整VIN、Rego或供应商原始响应，除非合同和隐私评估明确允许。

## 3. 目标架构

```text
Workshop Portal
  ├─ Rego + State
  └─ VIN
       ↓
DriveMate Vehicle Lookup API
  ├─ 输入校验
  ├─ 账户权限与限流
  ├─ Provider Adapter
  └─ 审计记录
       ↓
Provider Result
  ├─ exact
  ├─ ambiguous + candidates
  ├─ no_match
  └─ provider_error
       ↓
DriveMate Vehicle Configuration Review
       ↓
Approved Fitment Rules
       ↓
Released subset of the first 119 SKUs
```

供应商原始ID通过映射层保存，不作为DriveMate内部车辆主键。内部车辆配置应预留provider、provider vehicle ID、RedBook/NVIC/TecDoc标识、series、chassis、build range、engine code、body、transmission、drive和fuel等字段。

## 4. 供应商采购策略

第一批正式候选为MotorWeb、RedBook Commercial和Blue Flag。PlateAPI作为低成本和开发体验基准，PARts/PartsDB作为有条件的适配平台候选。

现阶段不购买AutoInfo OSCAR、TecDoc完整目录、Infinite Loop、AlgoDriven或VehicleID。除非第一批候选无法满足中国品牌覆盖或商业授权要求，才重新评估第二梯队。

## 5. 20车盲测设计

- 12个GWM正向样本：Cannon Alpha、Cannon/Ute、Haval H6、Haval Jolion、Tank 300。
- 4个BYD负向控制：Atto 3、Shark 6、Sealion 6、Dolphin。
- 4个MG负向控制：ZS、MG4、HS、MG3。
- 所有VIN、Rego、州和Ground Truth必须来自获得授权的真实车辆及可审核证据，不得虚构。
- 向所有供应商提交同一批样本，保留响应时间、候选数量、稳定车辆ID、返回字段、错误状态和响应hash。

## 6. 最低验收门槛

- GWM/BYD/MG有效车辆识别返回率不低于90%。
- 对具备完整Ground Truth的样本，exact variant/engine正确率不低于85%。
- 静默误配数必须为0。
- 8个BYD/MG负向控制均不得匹配首批GWM SKU。
- 12个GWM样本只有在车辆配置和fitment均审核后才可通过SKU匹配测试。
- 目标P95响应时间不超过3秒。
- 许可必须允许认证workshop portal展示、服务端调用、必要审计字段保存及合同退出后的受控迁移。

任一硬性门槛失败即排除供应商，不得以加权总分覆盖硬性失败。

## 7. 隐私与数据治理

VIN和Rego与workshop账户、订单或客户信息组合后按受控运营数据处理。系统只保存完成车辆识别、适配审计和争议处理所必要的字段。完整原始响应仅在供应商条款允许的期限内保存，并应采用访问控制、加密、审计和删除策略。

系统不请求或保存注册车主姓名、地址或其他与配件适配无关的个人信息。

## 8. 本阶段交付物

1. 中文及英文供应商RFI。
2. 中文及英文20车盲测模板。
3. 中文及英文供应商评分表。
4. 完成文件审核后，使用公司邮箱申请免费sandbox/trial并向正式候选发出询价。

## 9. 实施边界

本规格仅授权供应商测试准备与数据架构设计。未经后续实施计划和用户批准，不创建付费订阅、不提交供应商合同、不写入Production、不启用真实VIN/Rego查询，也不改变DriveMate现有公开页面和数据库schema。
