import { NextResponse } from "next/server";
import { z } from "zod";
import {
  mutationRequestAllowed,
  rateLimitAllowed,
  requestClientKey,
} from "../../../../lib/requestSecurity";
import { getRequestContext } from "../../../../lib/serverAuth";
import { createRequestAuthSupabaseClient } from "../../../../lib/supabaseClient";

const enrollSchema = z.object({
  friendlyName: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .default("DriveMate staff authenticator"),
});

function staffRole(role: string) {
  return role === "admin" || role === "partner";
}

export async function GET(request: Request) {
  const context = await getRequestContext(request);
  if (!context.userId || !staffRole(context.role))
    return NextResponse.json(
      { ok: false, message: "Staff session required." },
      { status: 403 },
    );
  const auth = await createRequestAuthSupabaseClient(request);
  if (!auth)
    return NextResponse.json(
      { ok: false, message: "Session expired." },
      { status: 401 },
    );
  const { data, error } = await auth.client.auth.mfa.listFactors();
  if (error)
    return NextResponse.json(
      { ok: false, message: "MFA factors could not be loaded." },
      { status: 422 },
    );
  return NextResponse.json({
    ok: true,
    assuranceLevel: context.assuranceLevel,
    factors: data.totp.map((factor) => ({
      id: factor.id,
      friendlyName: factor.friendly_name,
      status: factor.status,
    })),
  });
}

export async function POST(request: Request) {
  if (!mutationRequestAllowed(request))
    return NextResponse.json(
      { ok: false, message: "Request security validation failed." },
      { status: 403 },
    );
  if (
    !rateLimitAllowed(
      requestClientKey(request, "mfa-enroll"),
      5,
      60 * 60 * 1000,
    )
  )
    return NextResponse.json(
      { ok: false, message: "Too many MFA setup attempts." },
      { status: 429 },
    );
  const context = await getRequestContext(request);
  if (!context.userId || !staffRole(context.role))
    return NextResponse.json(
      { ok: false, message: "Staff session required." },
      { status: 403 },
    );
  const parsed = enrollSchema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { ok: false, error: parsed.error.flatten() },
      { status: 400 },
    );
  const auth = await createRequestAuthSupabaseClient(request);
  if (!auth)
    return NextResponse.json(
      { ok: false, message: "Session expired." },
      { status: 401 },
    );
  const listed = await auth.client.auth.mfa.listFactors();
  if (listed.data?.totp.some((factor) => factor.status === "verified"))
    return NextResponse.json(
      { ok: false, message: "A verified authenticator is already enrolled." },
      { status: 409 },
    );
  const { data, error } = await auth.client.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: parsed.data.friendlyName,
  });
  if (error)
    return NextResponse.json(
      { ok: false, message: "Authenticator setup could not be started." },
      { status: 422 },
    );
  return NextResponse.json({
    ok: true,
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
  });
}
