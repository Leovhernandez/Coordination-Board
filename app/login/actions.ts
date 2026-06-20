"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Sends the owner a magic-link sign-in email. shouldCreateUser:true so a brand
 * new contractor self-serves (multi-tenant: each owner gets their own org on
 * first login). The email link lands on /auth/confirm (token_hash flow).
 */
export async function sendMagicLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    redirect("/login?error=" + encodeURIComponent("Enter your email address."));
  }

  // Optional invite-only mode: only allowlisted emails may request a link.
  if (process.env.SIGNUP_MODE === "allowlist") {
    const svc = createServiceClient();
    const { data } = await svc
      .from("allowed_emails")
      .select("email")
      .eq("email", email.toLowerCase())
      .maybeSingle();
    if (!data) {
      redirect(
        "/login?error=" +
          encodeURIComponent(
            "This email isn’t approved yet. Contact us for access.",
          ),
      );
    }
  }

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
