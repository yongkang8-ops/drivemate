import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";
let db: PGlite;
let defaultAclBefore: unknown[];
let otherTableAclsBefore: unknown[];
const defaultAclQuery =
  "select defaclrole::regrole::text, defaclnamespace::regnamespace::text, defaclobjtype, defaclacl::text from pg_default_acl order by 1,2,3";
const otherTableAclsQuery =
  "select relname, relacl::text from pg_class where relnamespace='public'::regnamespace and relkind in ('r','p') and relname<>'warehouse_test_print_jobs' order by relname";
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "create role anon; create role authenticated; create role service_role bypassrls;",
  );
  // Supabase grants broad privileges to new tables before migrations narrow them.
  await db.exec(
    "alter default privileges in schema public grant all privileges on tables to anon, authenticated, service_role;",
  );
  await db.exec(
    "create table public.formal_print_sentinel(id int primary key,status text); insert into public.formal_print_sentinel values(1,'pending'); create table public.stock_sentinel(quantity int); insert into public.stock_sentinel values(123);",
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261101091923_warehouse_test_print_jobs.sql",
      "utf8",
    ),
  );
  defaultAclBefore = (await db.query(defaultAclQuery)).rows;
  otherTableAclsBefore = (await db.query(otherTableAclsQuery)).rows;
  await db.exec(
    readFileSync(
      "supabase/migrations/20261102025958_warehouse_test_print_job_privileges.sql",
      "utf8",
    ),
  );
}, 60000);
afterAll(async () => {
  await db?.close();
});
it("removes inherited service privileges only from the test print table", async () => {
  const grants = await db.query<{ privilege: string; is_grantable: boolean }>(
    "select privilege_type as privilege, is_grantable from pg_class c cross join lateral aclexplode(c.relacl) a where c.oid='public.warehouse_test_print_jobs'::regclass and a.grantee='service_role'::regrole order by privilege_type",
  );
  expect(grants.rows).toEqual([
    { privilege: "INSERT", is_grantable: false },
    { privilege: "SELECT", is_grantable: false },
    { privilege: "UPDATE", is_grantable: false },
  ]);
  const effective = await db.query<{ privilege: string; allowed: boolean }>(
    "select p as privilege, has_table_privilege('service_role','public.warehouse_test_print_jobs',p) as allowed from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p",
  );
  expect(effective.rows).toEqual([
    { privilege: "SELECT", allowed: true },
    { privilege: "INSERT", allowed: true },
    { privilege: "UPDATE", allowed: true },
    { privilege: "DELETE", allowed: false },
    { privilege: "TRUNCATE", allowed: false },
    { privilege: "REFERENCES", allowed: false },
    { privilege: "TRIGGER", allowed: false },
    { privilege: "MAINTAIN", allowed: false },
  ]);
  expect((await db.query(defaultAclQuery)).rows).toEqual(defaultAclBefore);
  expect((await db.query(otherTableAclsQuery)).rows).toEqual(otherTableAclsBefore);
});
it("rejects service-role truncation without losing retained test records", async () => {
  await db.exec("set role service_role");
  try {
    const inserted = await db.query<{ id: string }>(
      "insert into public.warehouse_test_print_jobs(request_id,request_key,shipment_id,labels,created_by) values(gen_random_uuid(),'retained','shipment','[{}]','actor') returning id",
    );
    await expect(
      db.query("truncate table public.warehouse_test_print_jobs"),
    ).rejects.toThrow(/permission denied/);
    expect(
      (await db.query("select id from public.warehouse_test_print_jobs where id=$1", [inserted.rows[0].id])).rows,
    ).toEqual(inserted.rows);
  } finally {
    await db.exec("reset role");
  }
});
it("executes the migration on PostgreSQL with RLS and no direct client access", async () => {
  const r = await db.query<{ relrowsecurity: boolean }>(
    "select relrowsecurity from pg_class where oid='public.warehouse_test_print_jobs'::regclass",
  );
  expect(r.rows[0].relrowsecurity).toBe(true);
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    try {
      await expect(
        db.query("select * from public.warehouse_test_print_jobs"),
      ).rejects.toThrow(/permission denied/);
      await expect(
        db.query(
          "insert into public.warehouse_test_print_jobs(request_id,request_key,shipment_id,labels,created_by) values(gen_random_uuid(),'x','shipment','[{}]','actor')",
        ),
      ).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role");
    }
  }
});
it("enforces pending creation, actor/request uniqueness, immutable payload and terminal result", async () => {
  await db.exec("set role service_role");
  try {
    const request = "11111111-1111-4111-8111-111111111111";
    const insert =
      "insert into public.warehouse_test_print_jobs(request_id,request_key,shipment_id,labels,created_by) values($1,'key','shipment','[{},{}]','actor') returning id";
    const r = await db.query<{ id: string }>(insert, [request]);
    const id = r.rows[0].id;
    await expect(db.query(insert, [request])).rejects.toThrow(/unique/);
    await expect(
      db.query(
        "update public.warehouse_test_print_jobs set labels='[{}]' where id=$1",
        [id],
      ),
    ).rejects.toThrow(/immutable/);
    await expect(
      db.query(
        "update public.warehouse_test_print_jobs set status='printed',reason='',outcome_at=now() where id=$1",
        [id],
      ),
    ).rejects.toThrow(/check constraint/);
    await db.query(
      "update public.warehouse_test_print_jobs set status='printed',reason='',outcome_by='actor',outcome_at=now() where id=$1 and status='pending'",
      [id],
    );
    const repeated = await db.query(
      "update public.warehouse_test_print_jobs set status='failed',reason='jam',outcome_by='actor',outcome_at=now() where id=$1 and status='pending' returning id",
      [id],
    );
    expect(repeated.rows).toHaveLength(0);
    await expect(
      db.query(
        "update public.warehouse_test_print_jobs set status='cancelled' where id=$1",
        [id],
      ),
    ).rejects.toThrow(/immutable/);
    await expect(
      db.query("delete from public.warehouse_test_print_jobs where id=$1", [
        id,
      ]),
    ).rejects.toThrow(/permission denied/);
  } finally {
    await db.exec("reset role");
  }
  expect(
    (await db.query("select status from public.formal_print_sentinel")).rows,
  ).toEqual([{ status: "pending" }]);
  expect(
    (await db.query("select quantity from public.stock_sentinel")).rows,
  ).toEqual([{ quantity: 123 }]);
});
