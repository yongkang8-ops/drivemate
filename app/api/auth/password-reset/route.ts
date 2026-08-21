import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimitAllowed, requestClientKey, requestOriginAllowed } from "../../../../lib/requestSecurity";
import { createServerAuthSupabaseClient } from "../../../../lib/supabaseClient";

const schema = z.object({ email: z.string().trim().email() });

export async function POST(request: Request) {
  if (!requestOriginAllowed(request)) {
    return NextResponse.json({ ok: false, message: "Request origin was not accepted." }, { status: 403 });
  }
  if (!rateLimitAllowed(requestClientKey(request, "password-reset"), 5, 60 * 60 * 1000)) {
    return NextResponse.json({ ok: true });
  }
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ ok: true });
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") || new URL(request.url).origin;
  await createServerAuthSupabaseClient().auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl}/auth/confirm?next=/password-setup`,
  });
  return NextResponse.json({ ok: true });
}
