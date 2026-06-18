import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Bypasses RLS — SERVER-SIDE ONLY.
 *
 * SECURITY INVARIANT (CLAUDE.md §5): the service-role key must never reach the
 * browser. The `server-only` import above makes any client-side import a build
 * error. Use this client only inside server actions / route handlers that have
 * already validated a participant's signed invite token, and scope every query
 * to that token's single job_id. It must never touch another job.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase service-role client is not configured (missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY).",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
