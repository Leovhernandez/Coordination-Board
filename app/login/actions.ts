"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSignInAllowed } from "@/lib/access";

/**
 * Sends a magic-link sign-in email. Access is admin-gated (M14): only approved
 * business owners and invited salesmen may sign in — everyone else is turned
 * away here, before any session exists. A new owner gets their org on first
 * login; an invited salesman is linked to their org.
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

  const supabase = await createClient();
  const origin =
    (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      // Proven code flow: Supabase verifies the link, then redirects here with a
      // ?code= that /auth/callback exchanges for a session. This is the flow that
      // ran the whole pilot. (Cross-device token_hash sign-in is being rebuilt
      // separately on a preview deploy before it touches production again.)
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
