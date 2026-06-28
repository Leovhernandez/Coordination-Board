import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { getLang } from "@/lib/i18n/server";
import { dictionaries } from "@/lib/i18n/dictionaries";

/**
 * token_hash / PKCE-code sign-in landing. Used by salesman invite emails and
 * (since cross-device sign-in) owner login links — both carry a token_hash link
 * that works across browsers/devices.
 *
 * WHY THIS IS A TWO-STEP (GET interstitial → POST verify), not a bare GET:
 * email security scanners (Outlook / Microsoft Defender **Safe Links**, link
 * prefetchers) issue a GET on email links *before* the human clicks. A bare GET
 * that runs `verifyOtp` would let the scanner CONSUME the single-use token, so
 * the human's later click fails and they bounce to /login. So the GET renders a
 * lightweight "tap to finish" interstitial that verifies NOTHING; the button
 * POSTs here, and only the POST runs `verifyOtp`. Scanners do GETs, not form
 * POSTs, so they can't burn the token. (Confirmed against Supabase's current
 * guidance for email-scanner prefetch.)
 *
 * On POST, session cookies are bound to the EXACT response we return — cookies
 * set via next/headers do NOT reliably attach to a NextResponse.redirect() in a
 * route handler, so binding to `response` guarantees the session reaches the
 * browser.
 */

/** Only allow internal redirect targets (no open-redirect via ?next=). */
function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//")
    ? next
    : "/dashboard";
}

/** Escape untrusted values placed into HTML attributes. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fail(request: NextRequest, message: string) {
  return NextResponse.redirect(
    new URL("/login?error=" + encodeURIComponent(message), request.url),
    { status: 303 },
  );
}

/** GET: render the interstitial ONLY — never verify here (scanner-safe). */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash") ?? "";
  const type = searchParams.get("type") ?? "";
  const code = searchParams.get("code") ?? "";
  const next = safeNext(searchParams.get("next"));
  const lang = await getLang();
  const t = dictionaries[lang].authConfirm;

  if (!token_hash && !code) {
    return fail(request, t.missing);
  }

  const html = `<!DOCTYPE html>
<html lang="${lang}"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${esc(t.title)}</title>
<style>
  :root{color-scheme:light}
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    background:#f8fafc;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;padding:24px}
  main{width:100%;max-width:360px;text-align:center}
  h1{font-size:22px;font-weight:700;letter-spacing:-.01em;margin:0 0 8px}
  p{color:#475569;font-size:15px;margin:0 0 24px}
  button{width:100%;border:0;border-radius:12px;background:#0f172a;color:#fff;
    font-size:17px;font-weight:600;padding:16px;cursor:pointer}
  button:active{background:#1e293b}
</style></head>
<body><main>
  <h1>${esc(t.heading)}</h1>
  <p>${esc(t.body)}</p>
  <form method="POST" action="/auth/confirm">
    <input type="hidden" name="token_hash" value="${esc(token_hash)}" />
    <input type="hidden" name="type" value="${esc(type)}" />
    <input type="hidden" name="code" value="${esc(code)}" />
    <input type="hidden" name="next" value="${esc(next)}" />
    <button type="submit">${esc(t.button)}</button>
  </form>
</main></body></html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/** POST: the human tapped the button — NOW verify and set the session. */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const token_hash = String(form.get("token_hash") ?? "");
  const urlType = (String(form.get("type") ?? "") || null) as EmailOtpType | null;
  const code = String(form.get("code") ?? "");
  const next = safeNext(String(form.get("next") ?? ""));
  const t = dictionaries[await getLang()].authConfirm;

  // 303 so the browser follows the redirect as a GET (not a re-POST).
  const response = NextResponse.redirect(new URL(next, request.url), {
    status: 303,
  });

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
    return fail(request, `${t.verifyFailed} (${lastError})`);
  }

  // Fallback: PKCE code (Supabase default template; same browser only).
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return response;
    console.error("[auth/confirm] code exchange failed:", error.message);
    return fail(request, `${t.sameBrowser} (${error.message})`);
  }

  return fail(request, t.missing);
}
