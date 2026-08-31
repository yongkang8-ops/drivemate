import { NextResponse } from "next/server";
import { getRepository } from "../../../../lib/repository";
import { isTestResetEnabled } from "../../../../lib/testReset";

export async function POST(request: Request) {
  if (!isTestResetEnabled()) {
    return NextResponse.json({ ok: false, message: "Not found." }, { status: 404 });
  }

  const searchParams = new URL(request.url).searchParams;
  const packingList = searchParams.get("packingList");
  await getRepository().resetForTests({
    packingList: packingList === "empty" ? "empty" : "confirmed",
    shipments: searchParams.get("shipments") === "multiple" ? "multiple" : "single",
  });
  return NextResponse.json({ ok: true });
}
