"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSignInAllowed } from "@/lib/access";
import { sendSignInLink } from "@/lib/invites";

/**
 * Sends a sign-in email. Access is admin-gated (M14): only approved business
 * owners and invited salesmen may sign in — everyone else is turned away here,
 * before any session exists. A new owner gets their org on first login; an
 * invited salesman is linked to their org.
 *
 * Cross-device by default: we email a token_hash link (lands on /auth/confirm),
 * which carries its own credential and opens in ANY browser/device — the same
 * proven path as salesman invites. The old PKCE code flow (/auth/callback) is
 * kept only as a fallback if email delivery is unavailable; it requires opening
 * the link in the same browser it was requested from.
 */
export async function sendMagicLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    redirect("/login?error=" + encodeURIComponent("Enter your email address."));
  }

  // Admin-gated access: business owners (allowlist) + invited salesmen only.
  if (!(await isSignInAllowed(email))) {
    redirect(
      "/login?error=" +
        encodeURIComponent(
          "This email isn’t approved yet. Ask your contractor for an invite, or contact us for access.",
        ),
    );
  }

  // Preferred: cross-device token_hash link via our own email (Resend).
  if (await sendSignInLink(email)) {
    redirect("/login?sent=1");
  }

  // Fallback (email not configured / send failed): Supabase's own magic-link
  // email via the PKCE code flow — same browser only, but keeps login working.
  const supabase = await createClient();
  const origin =
    (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  // Surface the real reason (e.g. redirect-URL not allowed, rate limit) so
  // failures are diagnosable instead of a generic message.
  if (error) redirect("/login?error=" + encodeURIComponent(error.message));
  redirect("/login?sent=1");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
