# 测试打印表权限收紧：执行与回归记录

日期：2026-11-02（Asia/Shanghai）

项目：`gajrgqiwvgjrrbildwme` / DriveMate Production

分支：`feature/isolated-test-print-20261101`

原功能提交：`2808bd4c7b37f1f45ff9ab5711b7b4ab0e58e6dc`

## 范围与结果

仅收紧 `public.warehouse_test_print_jobs` 对 `service_role` 的表权限。生产补充迁移已执行并登记：

`20261102025958_warehouse_test_print_job_privileges.sql`

文件 SHA256：`AA7B6B2AD2A3CF0B472A77FF85456F30D9C94D245A58F27903DE71B500EDAE1E`。

原建表迁移保持原样，未重跑。补充迁移只包含两条权限语句：

```sql
revoke all privileges on table public.warehouse_test_print_jobs from service_role;
grant select, insert, update on table public.warehouse_test_print_jobs to service_role;
```

生产执行通过 Supabase apply_migration，返回 success=true。工具按执行时间登记为 `20261102030128`；核对唯一 SQL 与本地文件完全一致后，仅将这条新登记对齐为本地版本 `20261102025958`。最终登记18条，原17条内容未变。

## 生产只读核验

执行前：2026-11-02 03:01:15 UTC；执行后：03:01:36 UTC。

| 项目 | 结果 |
|---|---|
| service_role SELECT / INSERT / UPDATE | 允许，无转授权能力 |
| service_role DELETE / TRUNCATE / REFERENCES / TRIGGER / MAINTAIN | 全部拒绝 |
| anon / authenticated | 上述8项表权限全部拒绝 |
| RLS | 仍启用 |
| 索引、约束、防改写触发器 | 定义及启用状态未变 |
| 全局默认权限 | 指纹一致 |
| 其他 public 对象权限、所有者及行安全设置 | 指纹一致 |
| public 函数定义与函数权限 | 指纹一致 |
| 既有17条迁移 | 指纹一致 |
| 测试打印表 | 0条 |
| 正式打印任务 | 2条 cancelled |
| 收货会话 / 库存移动 | 均0条 |
| on_hand / reserved / quarantine | 均0 |

只读前后指纹：

- 默认权限：`a581b510ad17fef787f0084ac30594c3`
- 其他 public 对象：`f200a5ac13f33cd3fb5623ecf87e67d1`
- public 函数：`de4335e750098aa5c7da3ff7ee1cdd98`
- 原迁移：`28cbb3475d93992ae5aa8066b4e00ba3`
- 目标表约束：`1c4c8292abfd879a28db4224d6ac2b1a`
- 目标表索引：`15c9b981e1f8b5aaee1a9a6ad7d75230`
- 目标表触发器：`a5f48e18ff650d50b4f9457e5331013b`

生产核验仅查询权限与状态；没有在生产尝试 DELETE / TRUNCATE，也没有新增试印任务或其他业务记录。

## 本地回归

使用已固定版本的 PGlite，在本地 PostgreSQL 引擎中执行真实迁移 SQL。

1. 测试环境模拟 Supabase 创建表前对 anon、authenticated、service_role 的默认全权限。
2. 补丁前：新增权限测试失败；TRUNCATE 实际成功；DELETE 进入防改写触发器，未被权限层拒绝。明确复现根因。
3. 补丁后：service_role 精确保留 SELECT / INSERT / UPDATE；DELETE / TRUNCATE 被权限层拒绝；保留记录可查询；创建及首次终态更新正常。
4. 默认 ACL 与其他测试表的权限前后完全一致；其他表记录保持原值。
5. 原有去重、不可变内容、终态保护、RLS 与普通角色禁止访问的回归继续通过。

执行结果：

- 迁移与 PostgreSQL 专项：2个文件、5项测试通过。
- 完整 Vitest：82个文件、436项测试通过，0失败。
- `npm run typecheck`：通过。
- `git diff --check`：通过。
- 本补丁只有 SQL 权限与测试变更，未改应用界面或 API；本轮未重复浏览器/构建测试。
- 全套单元测试中的 smtp_failure 输出来自既有邮件失败测试用例。

## 发布边界

本轮未推送 GitHub、未部署 Vercel；未修改全局默认权限、其他表权限或业务数据。测试打印功能仍等待代码发布，随后由 James 进行现场校准、试印和扫码核对。
