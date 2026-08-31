import { NextResponse } from "next/server";
import { getRepository } from "../../../../lib/repository";
import { isTestResetEnabled } from "../../../../lib/testReset";

export async function POST(request: Request) {
  if (!isTestResetEnabled()) {
    return NextResponse.json({ ok: false, message: "Not found." }, { status: 404 });
  }

  const packingList = new URL(request.url).searchParams.get("packingList");
  await getRepository().resetForTests({
    packingList: packingList === "empty" ? "empty" : "confirmed",
  });
  return NextResponse.json({ ok: true });
}
