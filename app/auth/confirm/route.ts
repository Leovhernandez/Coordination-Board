import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Magic-link landing. Handles BOTH sign-in styles, so it works no matter how the
 * Supabase email template is configured:
 *   - token_hash flow (custom template) → works across browsers/devices.
 *   - PKCE code flow (Supabase default template) → same-browser fallback.
 *
 * IMPORTANT: the hashed-token verify endpoint expects type **'email'** (per
 * @supabase/auth-js docs), even though the magic-link template often labels the
 * link `type=magiclink`. We therefore ignore the template's `type` and always
 * verify token_hash as 'email' — otherwise verifyOtp fails on every click.
 *
 * /auth/callback also remains for any links already sitting in inboxes.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  const supabase = await createClient();

  // Preferred: token_hash (works cross-device). Always verified as 'email'.
  if (token_hash) {
    const { error } = await supabase.auth.verifyOtp({
      type: "email",
      token_hash,
    });
    if (!error) return NextResponse.redirect(new URL(next, request.url));
    console.error("[auth/confirm] token_hash verify failed:", error.message);
    return fail(
      request,
      "Sign-in link couldn't be verified — request a fresh one. " +
        `(${error.message})`,
    );
  }

  // Fallback: PKCE code (Supabase default template; same browser only).
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
    console.error("[auth/confirm] code exchange failed:", error.message);
    return fail(
      request,
      "Couldn't complete sign-in — open the link in the same browser you " +
        `requested it from. (${error.message})`,
    );
  }

  return fail(request, "Sign-in link was missing or invalid.");
}

function fail(request: NextRequest, message: string) {
  return NextResponse.redirect(
    new URL("/login?error=" + encodeURIComponent(message), request.url),
  );
}
