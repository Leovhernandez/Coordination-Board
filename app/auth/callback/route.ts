import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Magic-link landing — PKCE code flow (the FALLBACK sign-in path, used only when
 * Resend email delivery is unavailable; the primary path is the cross-device
 * token_hash flow at /auth/confirm).
 *
 * Supabase verifies the link, then redirects here with a `?code=...`, which we
 * exchange for a session. Session cookies are bound to the EXACT response we
 * return — cookies set via next/headers do NOT reliably attach to a
 * NextResponse.redirect() in a route handler, so binding to `response`
 * guarantees the session reaches the browser (mirrors /auth/confirm).
 *
 * Same-device caveat: the PKCE code_verifier is stored in a cookie when the link
 * is requested, so a `?code` link must be opened in the same browser/device it
 * was requested from.
 */

/** Only allow internal redirect targets (no open-redirect via ?next=). */
function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//")
    ? next
    : "/dashboard";
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(
      new URL(
        "/login?error=" +
          encodeURIComponent("Sign-in link was missing or invalid."),
        request.url,
      ),
    );
  }

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

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (!error) return response;

  const msg =
    "Couldn't complete sign-in — open the link in the same browser you " +
    `requested it from. (${error.message})`;
  return NextResponse.redirect(
    new URL("/login?error=" + encodeURIComponent(msg), request.url),
  );
}
