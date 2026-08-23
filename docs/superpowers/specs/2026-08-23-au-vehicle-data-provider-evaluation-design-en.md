# DriveMate Australian Vehicle Data Provider Evaluation Design

Date: 23 August 2026  
Status: Approved for provider test preparation  
Business entity: DRIVER MATE PTY LTD (ABN 66 701 612 768)

## 1. Confirmed Scope

This workstream is limited to the following closed loop:

```text
AU Rego + State or 17-character VIN
→ confirmed Australian vehicle configuration
→ DriveMate's first 119 GWM SKUs
```

DriveMate will not purchase a complete all-brand, all-part Australian catalogue. BYD and MG samples test Australian Chinese-brand identification and act as negative controls for the first GWM SKU set.

## 2. Core Design Principles

1. Vehicle identification and part fitment remain separate data layers.
2. The provider supplies vehicle identity and candidate configurations; it does not decide DriveMate SKU fitment.
3. Multiple candidates, low confidence and no-match outcomes require workshop confirmation or manual review.
4. Only approved vehicle configurations and approved fitment rules may return saleable SKUs.
5. Provider API keys remain server-side. Browsers never call providers directly.
6. DriveMate will not scrape state Rego portals or treat public lookup pages as commercial APIs.
7. Full VIN, Rego and raw provider responses will not be sent to an AI model unless contract and privacy review explicitly permit it.

## 3. Target Architecture

```text
Workshop Portal
  ├─ Rego + State
  └─ VIN
       ↓
DriveMate Vehicle Lookup API
  ├─ input validation
  ├─ account permission and rate limit
  ├─ provider adapter
  └─ audit event
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

Provider IDs are retained through a mapping layer and never become DriveMate's internal vehicle primary key. The internal configuration model should reserve provider, provider vehicle ID, RedBook/NVIC/TecDoc identifiers, series, chassis, build range, engine code, body, transmission, drive and fuel fields.

## 4. Procurement Strategy

The first formal candidates are MotorWeb, RedBook Commercial and Blue Flag. PlateAPI is the low-cost and developer-experience benchmark. PARts/PartsDB remains a conditional fitment-platform candidate.

DriveMate will not purchase AutoInfo OSCAR, the full TecDoc catalogue, Infinite Loop, AlgoDriven or VehicleID at this stage. Second-tier providers are reconsidered only if the initial candidates fail Chinese-brand coverage or commercial-licence requirements.

## 5. Twenty-Vehicle Blind Test

- Twelve positive GWM samples: Cannon Alpha, Cannon/Ute, Haval H6, Haval Jolion and Tank 300.
- Four BYD negative controls: Atto 3, Shark 6, Sealion 6 and Dolphin.
- Four MG negative controls: ZS, MG4, HS and MG3.
- VIN, Rego, state and ground truth must come from authorised real vehicles and auditable evidence. Invented identifiers are prohibited.
- Every provider receives the same samples. DriveMate records latency, candidate count, stable vehicle ID, returned fields, error state and response hash.

## 6. Minimum Acceptance Gates

- At least 90% valid vehicle-identification response rate across GWM, BYD and MG.
- At least 85% exact variant/engine accuracy for samples with complete ground truth.
- Zero silent wrong matches.
- All eight BYD/MG negative controls return zero of the first GWM SKUs.
- All twelve GWM samples pass SKU matching only after vehicle configuration and fitment approval.
- Target P95 response time no greater than three seconds.
- The licence permits authenticated workshop-portal display, server-side use, necessary audit retention and controlled exit migration.

Any failed hard gate excludes the provider. A weighted score cannot override a hard-gate failure.

## 7. Privacy and Data Governance

VIN and Rego become controlled operational data when combined with workshop accounts, orders or customer information. DriveMate retains only fields necessary for identification, fitment audit and dispute handling. Raw responses are retained only for the period permitted by provider terms and are subject to access control, encryption, audit and deletion rules.

The system does not request or store registered-owner names, addresses or other personal information unrelated to part fitment.

## 8. Current Deliverables

1. Chinese and English provider RFI documents.
2. Chinese and English twenty-vehicle blind-test workbooks.
3. Chinese and English provider scorecards.
4. After file review, use the company email to request free sandbox/trial access and send RFIs to formal candidates.

## 9. Implementation Boundary

This specification authorises provider-test preparation and data-architecture design only. Without a later implementation plan and user approval, it does not authorise paid subscriptions, contract submission, Production writes, live VIN/Rego lookup, public-page changes or database-schema changes.
