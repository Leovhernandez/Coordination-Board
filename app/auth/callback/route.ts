import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Magic-link landing — PKCE code flow (the ACTIVE sign-in flow).
 *
 * Supabase's default email template verifies the link and redirects here with a
 * `?code=...`, which we exchange for a session and write the auth cookies. This
 * is the flow that ran the entire pilot.
 *
 * Same-device caveat: the PKCE code_verifier is stored in a cookie when the link
 * is requested, so a `?code` link must be opened in the same browser/device it
 * was requested from. (Cross-device token_hash sign-in lives at /auth/confirm
 * and is being rebuilt + verified on a preview deploy before it returns here.)
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
