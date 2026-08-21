import { NextResponse } from "next/server";
import { can } from "../../../../lib/auth";
import { getRepository } from "../../../../lib/repository";
import type { AdminFitmentRule } from "../../../../lib/repository";
import { getRequestContext } from "../../../../lib/serverAuth";
import { fitmentRuleImportSchema } from "../../../../lib/validators";
import { mutationRequestAllowed } from "../../../../lib/requestSecurity";

type ImportFailure = {
  row: number;
  sku: string;
  message: string;
};

export async function POST(request: Request) {
  if (!mutationRequestAllowed(request)) {
    return NextResponse.json({ ok: false, message: "Request security validation failed." }, { status: 403 });
  }
  const authContext = await getRequestContext(request);
  if (!can(authContext.role, "admin_write")) {
    return NextResponse.json({ ok: false, message: "Fitment rule import requires an admin role." }, { status: 403 });
  }

  const parsed = fitmentRuleImportSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const repository = getRepository();
  const failures: ImportFailure[] = [];
  const rules: AdminFitmentRule[] = [];

  for (const [index, row] of parsed.data.rows.entries()) {
    const sku = row.sku.trim().toUpperCase();
    const result = await repository.createFitmentRule({ ...row, sku }, { actorId: authContext.userId });
    if (!result.ok) {
      failures.push({ row: index + 1, sku, message: result.message });
      continue;
    }
    rules.push(result.rule);
  }

  return NextResponse.json(
    {
      ok: failures.length === 0,
      summary: {
        created: rules.length,
        failed: failures.length,
      },
      rules,
      failures,
    },
    { status: failures.length ? 207 : 200 },
  );
}
