import { NextResponse } from "next/server";
import { getRepository } from "../../../lib/repository";
import { tradeAccountApplicationSchema } from "../../../lib/validators";

export async function POST(request: Request) {
  const parsed = tradeAccountApplicationSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await getRepository().submitTradeAccountApplication(parsed.data);
  if (!result.ok) return NextResponse.json(result, { status: 422 });

  return NextResponse.json(result);
}
