import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Run on all paths except static assets and the participant board (M5),
    // which is token-scoped and must not require an owner session.
    "/((?!_next/static|_next/image|favicon.ico|j/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
