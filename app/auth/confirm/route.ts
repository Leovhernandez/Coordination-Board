import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Magic-link landing. Handles BOTH sign-in styles, so it works no matter how the
 * Supabase email template is configured:
 *   - token_hash flow (custom template) → works across browsers/devices.
 *   - PKCE code flow (Supabase default template) → same-browser fallback.
 *
 * Two things that bit us and are fixed here:
 *  1. The hashed-token verify endpoint expects type **'email'** (per
 *     @supabase/auth-js), even though the template often labels it 'magiclink'.
 *     We ignore the template's `type` and always verify as 'email'.
 *  2. Session cookies are written onto the EXACT response we return. Cookies set
 *     via next/headers do NOT reliably attach to a NextResponse.redirect() in a
 *     route handler — so verifyOtp would succeed but the session never reached
 *     the browser, bouncing the user to a clean /login. Binding the Supabase
 *     client's cookies to `response` guarantees the session is sent.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  // The success response — Supabase writes the session cookies onto THIS object.
  const response = NextResponse.redirect(new URL(next, request.url));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[],
        ) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Preferred: token_hash (works cross-device). Always verified as 'email'.
  if (token_hash) {
    const { error } = await supabase.auth.verifyOtp({
      type: "email",
      token_hash,
    });
    if (!error) return response;
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
    if (!error) return response;
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
