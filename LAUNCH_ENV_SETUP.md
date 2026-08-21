# DriveMate V1.1 Launch Ownership / V1.1 上线环境归属

## Ownership / 归属

| Asset / 资产 | Recommended owner / 建议归属                                 | Reason / 原因                                                                   |
| ------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Vercel       | Australian operating company                                 | Hosting, domain and billing are operating assets / 托管、域名和账单属于运营资产 |
| Supabase     | Australian operating company with two owner-level custodians | Database, Auth and documents are core records / 数据库、Auth 和文件属于核心记录 |
| Domain       | Australian operating company                                 | Brand, email and invoices must align / 品牌、邮箱和发票主体需一致               |
| GitHub       | Business organisation, not a personal-only repository        | Source and deployment history require continuity / 源码和部署历史需要可持续交接 |

## Responsibility / 责任分工

```text
Li / China side:
- Maintain authoritative PI, supplier evidence, packing data and China compliance evidence.
- Do not place private supplier prices in Git or public Vercel variables.

James / Australia side:
- Hold Australian company, domain and operational accounts.
- Confirm ABN, accounts email, warehouse identity, customer terms and local acceptance evidence.

Technical operator:
- Maintain migration, deployment, backups, MFA, secrets, monitoring and release evidence.
```

```text
Li / 中国端：
- 维护权威 PI、供应商证据、包装数据和中国端合规证据。
- 不得把供应商价格放入 Git 或公开 Vercel 变量。

James / 澳洲端：
- 持有澳洲公司、域名和运营账号。
- 确认 ABN、accounts email、仓库身份、客户条款和澳洲验收证据。

技术维护方：
- 维护 migration、部署、备份、MFA、密钥、监控和 release 证据。
```

## Immediate Staging Sequence / 当前 Staging 执行顺序

1. Sign in to Supabase and export a staging backup.
2. Apply `20260821_v11_prelaunch.sql` to staging.
3. Run `npm run verify:supabase` in non-strict mode and confirm schema/RLS/grant checks.
4. Add missing Preview environment variables in Vercel and redeploy `feat/v1.1-prelaunch`.
5. Preserve the designated Trade, Warehouse and Admin test users; remove obsolete smoke business records.
6. Enroll Admin and Warehouse TOTP factors.
7. Run PI Preview, review all 119 rows, then Commit.
8. Set `REQUIRE_PI_IMPORT=true`, rerun `verify:supabase`, and confirm 706 units are on order with zero public availability.
9. Run AAL2 staging smoke tests and browser tests.

10. 登录 Supabase 并导出 staging 备份。
11. 在 staging 执行 `20260821_v11_prelaunch.sql`。
12. 以非严格模式执行 `npm run verify:supabase`，确认 schema、RLS 和授权检查。
13. 在 Vercel 补齐 Preview 环境变量并重新部署 `feat/v1.1-prelaunch`。
14. 保留指定的 Trade、Warehouse、Admin 测试用户，清理旧 smoke 业务数据。
15. 为 Admin 和 Warehouse 注册 TOTP。
16. 执行 PI Preview，逐行审核 119 行后 Commit。
17. 设置 `REQUIRE_PI_IMPORT=true` 后重新执行 `verify:supabase`，确认 706 件仅计入 on-order，公开可售库存为零。
18. 执行 AAL2 staging smoke 与浏览器测试。

## Human Intervention Still Required / 仍需人工介入

- Supabase/Vercel owner login and MFA.
- Supabase/Vercel owner 登录及 MFA。
- Real ABN, monitored accounts email and final legal review.
- 真实 ABN、可监控 accounts email 及最终法律审核。
- DNS change for `drivemateparts.com.au` only after production gate passes.
- 仅在 production gate 通过后修改 `drivemateparts.com.au` DNS。
