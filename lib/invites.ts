import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { getDictionary } from "@/lib/i18n/server";
import { interpolate } from "@/lib/i18n/interpolate";
import type { Dict } from "@/lib/i18n/dictionaries";

/**
 * Salesman invite emails (M14). When an owner (or the admin) invites a salesman,
 * we email them a one-tap, cross-device sign-in link so onboarding is hands-off
 * — no copying/texting links.
 *
 * The link uses the token_hash flow (lands on /auth/confirm), which carries its
 * own credential and works in any browser/device — unlike the owner's PKCE code
 * flow, which this does NOT touch.
 */
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "";
const FROM = process.env.INVITE_FROM_EMAIL ?? "Coordination Board <noreply@4lfr.com>";

/** Generate a cross-device sign-in link (token_hash) for an email, or null. */
async function signInLinkFor(email: string): Promise<string | null> {
  const svc = createServiceClient();
  // Ensure a (confirmed, passwordless) auth user exists so magiclink generation
  // works; harmless/no-op if they already exist.
  await svc.auth.admin
    .createUser({ email, email_confirm: true })
    .catch(() => {});

  const { data, error } = await svc.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const hashed = data?.properties?.hashed_token;
  if (error || !hashed || !SITE) return null;

  // /auth/confirm tries the right OTP type; we pass magiclink (the accurate one).
  return `${SITE}/auth/confirm?token_hash=${hashed}&type=magiclink&next=/dashboard`;
}

/**
 * Email an invited salesman a one-tap sign-in link. Best-effort: returns false
 * if email isn't configured or sending failed (the membership row is created
 * regardless, so the owner can re-send).
 */
export async function sendSalesmanInvite(
  email: string,
  orgName: string,
): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key || !SITE) return false;

  const link = await signInLinkFor(email);
  if (!link) return false;
  const t = await getDictionary();

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [email],
        subject: interpolate(t.email.inviteSubject, { org: orgName }),
        html: inviteHtml(t, orgName, link),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Email ANY authorized account (owner or salesman) a one-tap sign-in link from
 * the login form. Uses the same cross-device token_hash link as invites, so the
 * link opens in any browser/device — not just the one that requested it (unlike
 * the PKCE code flow). Best-effort: returns false if email isn't configured or
 * sending failed, so the caller can fall back to the PKCE flow.
 */
export async function sendSignInLink(email: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key || !SITE) return false;

  const link = await signInLinkFor(email);
  if (!link) return false;
  const t = await getDictionary();

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [email],
        subject: t.email.signInSubject,
        html: signInHtml(t, link),
      }),
    });
    // Log a delivery failure so a silent fallback to same-browser PKCE is
    // diagnosable (Vercel logs) instead of just confusing the user.
    if (!res.ok) {
      console.error(
        "[sendSignInLink] Resend rejected:",
        res.status,
        await res.text().catch(() => ""),
      );
    }
    return res.ok;
  } catch (err) {
    console.error("[sendSignInLink] Resend threw:", err);
    return false;
  }
}

function signInHtml(t: Dict, link: string): string {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
    <h2 style="margin:0 0 8px;font-size:20px">${t.email.signInHeading}</h2>
    <p style="margin:0 0 20px;color:#475569;font-size:15px">${t.email.signInBody}</p>
    <a href="${link}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px;font-size:15px">
      ${t.email.signInButton}
    </a>
    <p style="margin:20px 0 0;color:#94a3b8;font-size:12px">${t.email.signInFooter}</p>
  </div>`;
}

function inviteHtml(t: Dict, orgName: string, link: string): string {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
    <h2 style="margin:0 0 8px;font-size:20px">${interpolate(t.email.inviteHeading, { org: orgName })}</h2>
    <p style="margin:0 0 20px;color:#475569;font-size:15px">${t.email.inviteBody}</p>
    <a href="${link}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px;font-size:15px">
      ${t.email.inviteButton}
    </a>
    <p style="margin:20px 0 0;color:#94a3b8;font-size:12px">${t.email.inviteFooter}</p>
  </div>`;
}
