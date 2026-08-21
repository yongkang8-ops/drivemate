import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getRepository } from "../../../lib/repository";
import { tradeAccountApplicationSchema } from "../../../lib/validators";
import {
  mutationRequestAllowed,
  rateLimitAllowed,
  requestClientKey,
} from "../../../lib/requestSecurity";
import { verifyTurnstile } from "../../../lib/turnstile";
import { can } from "../../../lib/auth";
import { getRequestContext } from "../../../lib/serverAuth";
import { createServiceSupabaseClient } from "../../../lib/supabaseClient";

function digest(value: string) {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

export async function POST(request: Request) {
  const auth = await getRequestContext(request);
  const adminSubmission = !auth.mfaRequired && can(auth.role, "admin_write");
  if (!mutationRequestAllowed(request, { publicRequest: true })) {
    return NextResponse.json(
      { ok: false, message: "Request security validation failed." },
      { status: 403 },
    );
  }
  if (
    !adminSubmission &&
    !rateLimitAllowed(
      requestClientKey(request, "trade-application"),
      5,
      60 * 60 * 1000,
    )
  ) {
    return NextResponse.json(
      { ok: false, message: "Too many applications. Try again later." },
      { status: 429 },
    );
  }
  const payload = await request.json();
  const parsed = tradeAccountApplicationSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (!adminSubmission) {
    const emailKey = parsed.data.contactEmail.trim().toLowerCase();
    const abnKey = (parsed.data.abn ?? "").replace(/[^0-9]/g, "");
    if (
      !rateLimitAllowed(
        `trade-application-email:${emailKey}`,
        3,
        24 * 60 * 60 * 1000,
      )
    ) {
      return NextResponse.json(
        { ok: false, message: "Too many applications for this email." },
        { status: 429 },
      );
    }
    if (
      abnKey &&
      !rateLimitAllowed(
        `trade-application-abn:${abnKey}`,
        3,
        24 * 60 * 60 * 1000,
      )
    ) {
      return NextResponse.json(
        { ok: false, message: "Too many applications for this ABN." },
        { status: 429 },
      );
    }

    if (process.env.DRIVEMATE_REPOSITORY === "supabase") {
      const checks = [
        {
          dimension: "ip",
          key: requestClientKey(request, "trade-application"),
          limit: 5,
          window: 3600,
        },
        { dimension: "email", key: emailKey, limit: 3, window: 86400 },
        ...(abnKey
          ? [{ dimension: "abn", key: abnKey, limit: 3, window: 86400 }]
          : []),
      ];
      const service = createServiceSupabaseClient();
      for (const check of checks) {
        const { data, error } = await service.rpc(
          "dm_check_account_application_rate_limit",
          {
            p_dimension: check.dimension,
            p_key_hash: digest(check.key),
            p_limit: check.limit,
            p_window_seconds: check.window,
          },
        );
        if (error) {
          return NextResponse.json(
            {
              ok: false,
              message: "Application protection is temporarily unavailable.",
            },
            { status: 503 },
          );
        }
        if (!data) {
          return NextResponse.json(
            { ok: false, message: "Too many applications. Try again later." },
            { status: 429 },
          );
        }
      }
    }
  }

  if (
    !adminSubmission &&
    !(await verifyTurnstile(payload.turnstileToken, request))
  ) {
    return NextResponse.json(
      { ok: false, message: "Human verification failed." },
      { status: 400 },
    );
  }

  const result = await getRepository().submitTradeAccountApplication(
    parsed.data,
  );
  if (!result.ok) return NextResponse.json(result, { status: 422 });

  return NextResponse.json(result);
}
