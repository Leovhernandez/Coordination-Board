import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Magic-link landing — PKCE code flow (FALLBACK).
 *
 * The primary flow is now token_hash at /auth/confirm, which works across
 * browsers/devices. This route is kept so links from the previous email
 * template (or any sent before the template is switched) still complete: it
 * exchanges a `?code=...` for a session and writes the auth cookies.
 *
 * Same-device caveat (why we moved off this as the default): the PKCE
 * code_verifier is stored in a cookie when the link is requested, so a `?code`
 * link must be opened in the same browser/device it was requested from.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
    const msg =
      "Couldn't complete sign-in — open the link in the same browser you " +
      `requested it from. (${error.message})`;
    return NextResponse.redirect(
      new URL("/login?error=" + encodeURIComponent(msg), request.url),
    );
  }

  return NextResponse.redirect(
    new URL(
      "/login?error=" +
        encodeURIComponent("Sign-in link was missing or invalid."),
      request.url,
    ),
  );
}
