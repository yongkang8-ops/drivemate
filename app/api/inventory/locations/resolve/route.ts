import { NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "../../../../../lib/repository";
import { requestCan } from "../../../../../lib/serverAuth";

const resolveQuerySchema = z.object({
  barcode: z.string().trim().min(1).max(240),
}).strict();

export async function GET(request: Request) {
  if (!(await requestCan(request, "warehouse_read"))) {
    return NextResponse.json({ ok: false, message: "Inventory locations require Partner access." }, { status: 403 });
  }
  const params = new URL(request.url).searchParams;
  const parsed = resolveQuerySchema.safeParse({ barcode: params.get("barcode") ?? "" });
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });

  const location = await getRepository().resolveActivePhysicalDestination(parsed.data.barcode);
  if (!location) {
    return NextResponse.json(
      { ok: false, message: "Scanned destination is not an active physical putaway location." },
      { status: 422 },
    );
  }
  return NextResponse.json({ ok: true, location });
}
