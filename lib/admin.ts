import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** True if the email is the operator (vendor) admin. */
export function isAdminEmail(email: string | null | undefined): boolean {
  const admin = process.env.ADMIN_EMAIL?.toLowerCase();
  return !!admin && !!email && email.toLowerCase() === admin;
}

/** Gate for the operator-only admin area. Non-admins are bounced to /dashboard. */
export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) redirect("/dashboard");
  return user;
}
