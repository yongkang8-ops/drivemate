# DriveMate Parts Launch Environment Setup / 上线环境搭建清单

## Conclusion / 结论

Li / Chris / James only need to provide account ownership, project credentials, and one-time external service access. The technical setup, environment file preparation, SQL verification, deployment checks, and release gate can be handled from this workspace after those inputs are available.

Li / Chris / James 只需要提供外部账号归属、项目密钥和一次性外部服务访问。拿到这些信息后，技术配置、环境变量整理、SQL 验证、部署检查和 release gate 可以在当前工作区继续完成。

## What Can Be Handled Here / 当前工作区可完成事项

```text
1. Prepare Vercel project environment variables.
2. Prepare Supabase SQL execution order and migration checklist.
3. Create staging seed users for trade, warehouse, and admin roles.
4. Generate short-lived smoke-test access tokens.
5. Run local preflight, Supabase verification, staging verification, and strict release verification.
6. Update deployment documentation after each environment decision.
```

```text
1. 准备 Vercel 项目环境变量。
2. 准备 Supabase SQL 执行顺序和增量迁移清单。
3. 创建 staging 的 trade、warehouse、admin 三类测试用户。
4. 生成短期 smoke test access token。
5. 运行本地 preflight、Supabase 验证、staging 验证和严格 release 验证。
6. 每次环境决策后同步更新部署文档。
```

## What Requires Shareholder / Account Owner Input / 需要股东或账号持有人提供的信息

```text
1. Vercel account access or an invited project role.
2. Supabase account access or a project owner/admin role.
3. Staging domain or Vercel preview URL decision.
4. Production domain decision, if already available.
5. Registered company legal name, ABN, and accounts email.
6. Supabase project URL, anon key, and service role key.
7. Staging test emails and temporary passwords for trade, warehouse, and admin users.
```

```text
1. Vercel 账号访问权限，或邀请当前操作者进入项目。
2. Supabase 账号访问权限，或项目 owner/admin 权限。
3. staging 域名或 Vercel preview URL 的选择。
4. 正式生产域名，如果已经确定。
5. 澳洲公司 legal name、ABN 和 accounts email。
6. Supabase project URL、anon key 和 service role key。
7. trade、warehouse、admin 三类 staging 测试邮箱和临时密码。
```

## Recommended Environment Ownership / 推荐环境归属

```text
Vercel:
  Owner: Australian operating company or James-controlled business account.
  Reason: hosting, domain, and billing should sit with the Australian operating entity.

Supabase:
  Owner: Australian operating company or a shared business email with two-factor authentication.
  Reason: database, auth users, order records, stock records, and account documents are operational assets.

Domain:
  Owner: Australian operating company.
  Reason: future brand, email, invoices, and customer trust should align.
```

```text
Vercel:
  建议归属：澳洲运营公司，或 James 可控的 business account。
  原因：网站托管、域名和账单应归属澳洲运营主体。

Supabase:
  建议归属：澳洲运营公司，或启用双重验证的共享业务邮箱。
  原因：数据库、登录用户、订单记录、库存记录和账户文件都是核心运营资产。

Domain:
  建议归属：澳洲运营公司。
  原因：未来品牌、邮箱、发票和客户信任应统一。
```

## Minimum Staging Values / Staging 最小必需变量

```text
NEXT_PUBLIC_SITE_URL=https://<staging-or-production-url>
DRIVEMATE_LEGAL_NAME=<registered company name>
DRIVEMATE_ABN=<company ABN>
DRIVEMATE_ACCOUNTS_EMAIL=accounts@<domain>
DRIVEMATE_WAREHOUSE_LABEL=Brisbane dispatch warehouse
DRIVEMATE_REPOSITORY=supabase
DRIVEMATE_ENABLE_DEMO_AUTH=false
NEXT_PUBLIC_SHOW_INTERNAL_NAV=false
NEXT_PUBLIC_SUPABASE_URL=<supabase project url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase anon key>
SUPABASE_SERVICE_ROLE_KEY=<supabase service role key>
SUPABASE_ACCOUNT_DOCUMENTS_BUCKET=account-documents
```

## Execution Order / 执行顺序

```text
1. Create or confirm Supabase project.
2. Run supabase/schema.sql.
3. Run supabase/policies.sql.
4. Run supabase/seed.sql.
5. If the project already used an older schema, run migrations in supabase/migrations/.
6. Create Vercel project with root apps/drivemate-web.
7. Add environment variables in Vercel.
8. Deploy staging.
9. Run npm run verify:supabase.
10. Run npm run seed:users.
11. Run npm run smoke:tokens.
12. Run npm run verify:staging against the Vercel URL.
13. Run npm run verify:release before any real pilot use.
```

```text
1. 创建或确认 Supabase 项目。
2. 执行 supabase/schema.sql。
3. 执行 supabase/policies.sql。
4. 执行 supabase/seed.sql。
5. 如果项目已经跑过旧 schema，则执行 supabase/migrations/ 内的增量迁移。
6. 创建 Vercel 项目，root 设为 apps/drivemate-web。
7. 在 Vercel 添加环境变量。
8. 部署 staging。
9. 运行 npm run verify:supabase。
10. 运行 npm run seed:users。
11. 运行 npm run smoke:tokens。
12. 针对 Vercel URL 运行 npm run verify:staging。
13. 真实 pilot 使用前运行 npm run verify:release。
```

## Current Local Status / 当前本地状态

```text
Vercel CLI: not installed locally
Supabase CLI: not installed locally
.env.local: not present
Local preflight: passed in the latest run
External release readiness: pending Vercel and Supabase environment
```

```text
Vercel CLI：本机未安装
Supabase CLI：本机未安装
.env.local：尚未创建
本地 preflight：最近一次已通过
外部 release readiness：等待 Vercel 和 Supabase 环境
```
