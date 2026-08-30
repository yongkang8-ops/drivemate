import { NextResponse } from "next/server";
import { z } from "zod";
import { passwordSetupRequestAllowed } from "../../../../lib/requestSecurity";
import { getRequestContext } from "../../../../lib/serverAuth";
import { createServiceSupabaseClient } from "../../../../lib/supabaseClient";

const schema = z.object({
  password: z.string().min(12).max(128)
    .regex(/[a-z]/, "Password requires a lowercase letter.")
    .regex(/[A-Z]/, "Password requires an uppercase letter.")
    .regex(/[0-9]/, "Password requires a number.")
    .regex(/[^A-Za-z0-9]/, "Password requires a symbol."),
});

export async function POST(request: Request) {
  if (!passwordSetupRequestAllowed(request)) {
    return NextResponse.json({ ok: false, message: "Request security validation failed." }, { status: 403 });
  }
  const auth = await getRequestContext(request);
  if (!auth.userId) return NextResponse.json({ ok: false, message: "Password setup link is not active." }, { status: 401 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  const { error } = await createServiceSupabaseClient().auth.admin.updateUserById(auth.userId, {
    password: parsed.data.password,
  });
  if (error) return NextResponse.json({ ok: false, message: "Password could not be updated." }, { status: 422 });
  return NextResponse.json({ ok: true });
}
