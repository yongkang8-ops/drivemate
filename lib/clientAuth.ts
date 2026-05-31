"use client";

import { type AppRole, DEMO_ROLE_HEADER } from "./auth";
import { createBrowserSupabaseClient } from "./supabaseClient";

export type AuthenticatedRole = Exclude<AppRole, "public">;

export async function getSupabaseAccessToken(): Promise<string | null> {
  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

export async function buildApiHeaders(role: AuthenticatedRole, baseHeaders: HeadersInit = {}): Promise<HeadersInit> {
  const headers = new Headers(baseHeaders);
  const token = await getSupabaseAccessToken();

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  } else {
    headers.set(DEMO_ROLE_HEADER, role);
  }

  return headers;
}
