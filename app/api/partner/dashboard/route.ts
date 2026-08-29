import { NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "../../../../lib/repository";
import { requestCan } from "../../../../lib/serverAuth";
import { buildPartnerDashboard, loadPartnerDashboardSource } from "../../../../lib/warehouseDashboard";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();
const dashboardQuerySchema = z.object({
  from: dateSchema,
  to: dateSchema,
  search: z.string().trim().min(1).max(120).optional(),
  timeZone: z.enum(["Australia/Brisbane", "Asia/Shanghai"]).default("Australia/Brisbane"),
}).strict();

export async function GET(request: Request) {
  if (!(await requestCan(request, "warehouse_read"))) {
    return NextResponse.json({ ok: false, message: "Operations dashboard requires Partner access." }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const parsed = dashboardQuerySchema.safeParse({
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
    search: params.get("search") ?? undefined,
    timeZone: params.get("timeZone") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }
  if (parsed.data.from && parsed.data.to && parsed.data.from > parsed.data.to) {
    return NextResponse.json({ ok: false, message: "Date from must be before or equal to date to." }, { status: 400 });
  }

  const source = await loadPartnerDashboardSource(getRepository(), {
    from: parsed.data.from,
    to: parsed.data.to,
  });
  return NextResponse.json({
    ok: true,
    dashboard: buildPartnerDashboard({
      ...source,
      displayTimeZone: parsed.data.timeZone,
      generatedAt: new Date().toISOString(),
      search: parsed.data.search,
    }),
  });
}
