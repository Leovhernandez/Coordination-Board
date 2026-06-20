import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Magic-link landing (PKCE code flow). Supabase's default email templates send
 * the user here with a `?code=...`; we exchange it for a session and write the
 * auth cookies. No email-template customization required.
 *
 * Same-device note: the PKCE code_verifier is stored in a cookie when the link
 * is requested, so the link should be opened on the same browser/device. That
 * matches an owner requesting + tapping the link on their own phone.
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
