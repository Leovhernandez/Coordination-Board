import { NextResponse } from "next/server";
import JSZip from "jszip";
import { getSessionContext } from "@/lib/membership";
import { buildOrgCsvs } from "@/lib/export";

export const dynamic = "force-dynamic";

/**
 * M-EXPORT — owner-only data export. Returns a ZIP of CSVs (jobs / phases / notes /
 * activity_log) for the OWNER's own org only. Owner-gated here as defense-in-depth
 * (the /billing button is already owner-only); a salesman is bounced to /dashboard.
 * Read-only — nothing beyond the owner's org leaves.
 */
export async function GET(request: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.redirect(new URL("/login", request.url));
  if (!ctx.isOwner) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  const files = await buildOrgCsvs(ctx.org.id);
  const zip = new JSZip();
  for (const f of files) zip.file(f.name, f.content);
  const body = await zip.generateAsync({ type: "arraybuffer" });

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="coordination-export-${date}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
