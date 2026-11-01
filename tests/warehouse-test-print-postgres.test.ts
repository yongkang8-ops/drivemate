import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "create role anon; create role authenticated; create role service_role bypassrls;",
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
}, 60000);
afterAll(async () => {
  await db?.close();
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
