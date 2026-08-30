import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import type { NextResponse } from "next/server";
import { parseCookieHeader, requestSessionTokens } from "./sessionCookies";

function supabaseUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured.");
  return url;
}

export function createServerAuthSupabaseClient() {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey)
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not configured.");
  return createClient(supabaseUrl(), anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function supabaseRequestCookies(request: Request) {
  return Object.entries(parseCookieHeader(request.headers.get("cookie"))).map(
    ([name, value]) => ({ name, value }),
  );
}

export function createCookieAuthSupabaseClient(request: Request, response: NextResponse) {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey)
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not configured.");
  return createServerClient(supabaseUrl(), anonKey, {
    cookies: {
      getAll: () => supabaseRequestCookies(request),
      setAll: (cookies) => {
        cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
}

export function createServiceSupabaseClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey)
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");

  return createClient(supabaseUrl(), serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export async function createRequestAuthSupabaseClient(request: Request) {
  const tokens = requestSessionTokens(request);
  if (!tokens.accessToken || !tokens.refreshToken) return null;
  const client = createServerAuthSupabaseClient();
  const { data, error } = await client.auth.setSession({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
  });
  return error || !data.session ? null : { client, session: data.session };
}
