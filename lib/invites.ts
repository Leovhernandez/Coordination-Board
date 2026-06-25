import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

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
        subject: `You're invited to ${orgName} on Coordination Board`,
        html: inviteHtml(orgName, link),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function inviteHtml(orgName: string, link: string): string {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
    <h2 style="margin:0 0 8px;font-size:20px">You're on the team at ${orgName}</h2>
    <p style="margin:0 0 20px;color:#475569;font-size:15px">
      Tap below to sign in to your job board. No password, no setup — it opens
      straight to the jobs assigned to you.
    </p>
    <a href="${link}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px;font-size:15px">
      Sign in to Coordination Board
    </a>
    <p style="margin:20px 0 0;color:#94a3b8;font-size:12px">
      If you didn't expect this, you can ignore this email.
    </p>
  </div>`;
}
