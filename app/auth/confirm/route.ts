import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Magic-link landing (token_hash flow). The Supabase email template sends the
 * owner here with `?token_hash=...&type=...`; we verify it straight into a
 * session. Unlike the PKCE code flow, the token_hash carries its own credential,
 * so the link works even when opened in a different browser or on a different
 * device than it was requested from — removing the #1 sign-in failure for
 * non-technical owners (the "open it in the same browser" gotcha).
 *
 * The old PKCE route still lives at /auth/callback as a fallback, so links from
 * the previous email template (or before the template is switched) keep working.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/dashboard";

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
    const msg =
      "This sign-in link has expired or was already used — request a fresh " +
      `one. (${error.message})`;
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
