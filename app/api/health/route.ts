import { NextResponse } from "next/server";
import { getRuntimeReadiness } from "../../../lib/runtimeReadiness";

export async function GET() {
  const readiness = getRuntimeReadiness();
  return NextResponse.json(readiness, { status: readiness.ready ? 200 : 503 });
}
