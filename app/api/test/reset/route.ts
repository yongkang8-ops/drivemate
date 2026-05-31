import { NextResponse } from "next/server";
import { getRepository } from "../../../../lib/repository";
import { isTestResetEnabled } from "../../../../lib/testReset";

export async function POST() {
  if (!isTestResetEnabled()) {
    return NextResponse.json({ ok: false, message: "Not found." }, { status: 404 });
  }

  await getRepository().resetForTests();
  return NextResponse.json({ ok: true });
}
