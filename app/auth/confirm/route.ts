import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

/**
 * token_hash / PKCE-code sign-in landing. Used by salesman invite emails (M14),
 * which carry a token_hash link so they work across browsers/devices (the
 * owner's PKCE code flow at /auth/callback is untouched).
 *
 * Two things that bit us and are fixed here:
 *  1. The OTP type for a hashed token varies ('email' vs 'magiclink') by how the
 *     token was minted. Rather than guess, we try the URL's type first, then the
 *     common ones — a wrong-type attempt fails the lookup without consuming the
 *     token, so this is safe and removes the type ambiguity.
 *  2. Session cookies are written onto the EXACT response we return. Cookies set
 *     via next/headers do NOT reliably attach to a NextResponse.redirect() in a
 *     route handler — so verifyOtp would succeed but the session never reached
 *     the browser, bouncing the user to a clean /login. Binding the Supabase
 *     client's cookies to `response` guarantees the session is sent.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const urlType = searchParams.get("type") as EmailOtpType | null;
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

  // Preferred: token_hash (works cross-device). Try the URL's type, then the
  // common ones — a wrong type fails the lookup without consuming the token.
  if (token_hash) {
    const types: EmailOtpType[] = [
      ...(urlType ? [urlType] : []),
      "email",
      "magiclink",
    ].filter((t, i, a) => a.indexOf(t) === i) as EmailOtpType[];

    let lastError = "";
    for (const type of types) {
      const { error } = await supabase.auth.verifyOtp({ type, token_hash });
      if (!error) return response;
      lastError = error.message;
    }
    console.error("[auth/confirm] token_hash verify failed:", lastError);
    return fail(
      request,
      "Sign-in link couldn't be verified — request a fresh one. " +
        `(${lastError})`,
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
