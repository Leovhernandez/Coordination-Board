import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Magic-link landing. Handles BOTH sign-in styles, so it works no matter how the
 * Supabase email template is configured:
 *   - token_hash flow (custom template) → carries its own credential, so the link
 *     works across browsers/devices (fixes the "open it in the same browser"
 *     gotcha for non-technical owners). This is the preferred flow.
 *   - PKCE code flow (Supabase's default template) → same-browser; kept as the
 *     fallback so sign-in works before the template is switched.
 *
 * /auth/callback also remains for any links already sitting in inboxes.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  const supabase = await createClient();

  // Preferred: token_hash (works cross-device).
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) return NextResponse.redirect(new URL(next, request.url));
    return fail(
      request,
      "This sign-in link has expired or was already used — request a fresh " +
        `one. (${error.message})`,
    );
  }

  // Fallback: PKCE code (Supabase default template; same browser only).
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
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
