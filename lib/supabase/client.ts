import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client (anon key only). Safe to use in Client Components.
 * Never import the service-role client here — see lib/supabase/service.ts.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
