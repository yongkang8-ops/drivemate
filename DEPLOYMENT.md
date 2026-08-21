# DriveMate Parts V1.1 Deployment / V1.1 部署说明

## Architecture / 架构

```text
Browser -> Vercel Next.js -> Supabase Auth/Postgres/Storage
```

- Browsers never receive `SUPABASE_SERVICE_ROLE_KEY` and do not query business tables directly.
- 浏览器不接收 `SUPABASE_SERVICE_ROLE_KEY`，也不直接查询业务表。
- Access and refresh tokens are stored in Secure, HttpOnly, SameSite cookies. Mutations require role, Origin and CSRF checks.
- Access/refresh token 使用 Secure、HttpOnly、SameSite cookie；写操作校验角色、Origin 和 CSRF。
- Admin and Warehouse require TOTP MFA when `DRIVEMATE_REQUIRE_STAFF_MFA=true`.
- `DRIVEMATE_REQUIRE_STAFF_MFA=true` 时，Admin 与 Warehouse 必须完成 TOTP MFA。

## Local Gate / 本地验收

```powershell
npm install
npm run typecheck
npm test
npx playwright test --project=edge
npm run build
npm audit --omit=dev
```

The authoritative PI test also requires local, uncommitted file paths:

权威 PI 专项测试还需要本机未提交的文件路径：

```powershell
$env:DRIVEMATE_AUTHORITATIVE_PI_PATH='<authoritative PI path>'
$env:DRIVEMATE_SUPPLEMENTAL_PACKING_PATH='<packing JSON path>'
npx vitest run tests/purchase-import.test.ts
```

## Staging Database / Staging 数据库

Current staging must be backed up before migration. Do not re-run `schema.sql` or `seed.sql` over an existing project.

迁移前必须备份当前 staging。已有项目不得重新覆盖执行 `schema.sql` 或 `seed.sql`。

Apply this migration once in the staging SQL editor:

在 staging SQL Editor 中执行：

```text
supabase/migrations/20260821_v11_prelaunch.sql
```

The migration is idempotent and creates purchase, shipment, receipt, landed-cost, compliance, VIN, allocation, credit-ledger, audit and RMA entities. All core business tables have RLS enabled; `anon` and `authenticated` receive no direct business-table write or RPC access.

该 migration 可重复执行，建立采购、运输、收货、到岸成本、合规、VIN、分配、信用台账、审计和 RMA 实体。所有核心业务表启用 RLS，`anon` 与 `authenticated` 不获得业务表写入或 RPC 的直接权限。

## Purchase Import / 采购导入

1. Sign in as Admin with MFA.
2. Open `/admin` and select the authoritative PI plus optional packing JSON.
3. Run Preview. Confirm hash, 119 unique Part Numbers, 706 units and the workbook financial reconciliation.
4. Commit the approved preview once.
5. Confirm every imported product is `on_order`, `pending`, `vin_pending`, `price_pending`, `inactive`, hidden and has zero inventory balance.

6. 使用完成 MFA 的 Admin 登录。
7. 打开 `/admin`，选择权威 PI 和可选包装 JSON。
8. 执行 Preview，确认 hash、119 个唯一 Part Number、706 件及工作簿金额闭环。
9. 仅 Commit 一次已审核 preview。
10. 确认所有导入产品均为 `on_order`、`pending`、`vin_pending`、`price_pending`、`inactive`、隐藏且库存余额为零。

Supplier prices and import preview payloads must never be committed to Git. `data/private/`, `test-results/` and `*.import-preview.json` are ignored.

供应商价格和 import preview payload 不得提交至 Git。`data/private/`、`test-results/` 和 `*.import-preview.json` 已被忽略。

Run the read-only staging verifier after migration, then enable strict PI controls after Commit:

完成 migration 后执行只读 staging 验证；PI Commit 后再启用严格控制数：

```powershell
npm run verify:supabase
$env:REQUIRE_PI_IMPORT='true'
$env:REQUIRE_SUPABASE_USERS='true'
$env:REQUIRE_SUPABASE_STORAGE='true'
npm run verify:supabase
```

## Vercel Environment / Vercel 环境变量

Use separate Preview and Production values. Required production controls include:

Preview 与 Production 必须分开配置。Production 至少需要：

```text
NEXT_PUBLIC_SITE_URL=https://drivemateparts.com.au
NEXT_PUBLIC_SUPABASE_URL=<production project URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<production anon key>
SUPABASE_SERVICE_ROLE_KEY=<production service role key>
DRIVEMATE_REPOSITORY=supabase
DRIVEMATE_ENABLE_DEMO_AUTH=false
NEXT_PUBLIC_SHOW_INTERNAL_NAV=false
DRIVEMATE_SESSION_COOKIE_NAME=drivemate_session
DRIVEMATE_REFRESH_COOKIE_NAME=drivemate_refresh
DRIVEMATE_CSRF_COOKIE_NAME=drivemate_csrf
NEXT_PUBLIC_DRIVEMATE_CSRF_COOKIE_NAME=drivemate_csrf
DRIVEMATE_IMPORT_SIGNING_SECRET=<random 32+ character secret>
DRIVEMATE_REQUIRE_STAFF_MFA=true
NEXT_PUBLIC_TURNSTILE_SITE_KEY=<production site key>
TURNSTILE_SECRET_KEY=<production secret key>
DRIVEMATE_TURNSTILE_REQUIRED=true
DRIVEMATE_ENVIRONMENT=production
DRIVEMATE_SUPABASE_ENVIRONMENT=production
DRIVEMATE_LEGAL_NAME=DRIVEMATE PARTS PTY LTD
DRIVEMATE_ABN=<real ABN>
DRIVEMATE_ACCOUNTS_EMAIL=<monitored accounts email>
```

Never reuse staging database keys, users, buckets or signing secrets in production.

Production 不得复用 staging 的数据库密钥、用户、bucket 或签名 secret。

## Staff MFA and Smoke Tokens / 员工 MFA 与 Smoke Token

Admin and Warehouse must enroll TOTP through the login panel. To generate AAL2 smoke tokens, set the current six-digit codes immediately before running:

Admin 与 Warehouse 必须在登录面板注册 TOTP。生成 AAL2 smoke token 前，填入当时有效的六位验证码：

```powershell
$env:DRIVEMATE_SMOKE_WAREHOUSE_TOTP_CODE='<current code>'
$env:DRIVEMATE_SMOKE_ADMIN_TOTP_CODE='<current code>'
npm run smoke:tokens
```

## Release Gate / 正式发布 Gate

Production release remains blocked until all are true:

以下条件全部满足前，Production release 必须保持阻断：

- Registered legal name, real ABN and monitored accounts email are configured.
- 已配置注册公司名、真实 ABN 和可监控 accounts email。
- `drivemateparts.com.au`, privacy documents and trade terms have been legally reviewed.
- `drivemateparts.com.au`、隐私文件及 trade terms 已完成法律审核。
- Production Supabase is separate, backed up and has verified Admin/Warehouse MFA.
- Production Supabase 独立、已备份，并完成 Admin/Warehouse MFA 验证。
- Turnstile, import signing, monitoring and storage are configured.
- Turnstile、import signing、监控和 storage 已配置。
- `npm run verify:release` passes against the deployed HTTPS environment.
- 针对已部署 HTTPS 环境执行 `npm run verify:release` 并通过。

No staging order, smoke account or test document is migrated into production.

任何 staging 订单、smoke account 或测试文件均不得迁入 production。
