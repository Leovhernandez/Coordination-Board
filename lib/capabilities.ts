import type { Organization } from "@/lib/types";

/**
 * M22 capability / storage-cap resolution.
 *
 * Photos are a Base+Pro feature; the TIER is the storage CAP, not the feature
 * (owner-confirmed 2026-06-29). Every org defaults to Base; Pro is a higher cap.
 * Resolution: an explicit per-org `storage_cap_bytes` override wins; otherwise the
 * cap is derived from `plan`. Gate by this value — NEVER by a hardcoded company
 * name (INSTRUCTIONS §0). Trinity is on Base and simply gets the Base cap.
 */

const GB = 1024 ** 3;

export const PLAN_STORAGE_CAP_BYTES: Record<string, number> = {
  base: 10 * GB,
  pro: 100 * GB,
  // Enterprise isn't specced this round; mirror Pro until it is.
  enterprise: 100 * GB,
};

/** Resolved storage cap (bytes) for an org: explicit override, else by plan. */
export function storageCapBytes(
  org: Pick<Organization, "plan" | "storage_cap_bytes">,
): number {
  if (org.storage_cap_bytes != null) return org.storage_cap_bytes;
  return PLAN_STORAGE_CAP_BYTES[org.plan] ?? PLAN_STORAGE_CAP_BYTES.base;
}

/**
 * Upload constraints. These are the SERVER-SIDE enforcement (client compression +
 * client checks are advisory and bypassable, AGENTS §5/§7). Status-evidence only:
 * a generous per-phase count keeps the board glanceable without policing real use.
 */
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

// Hard per-object ceiling. Client compression targets far below this (~1600px /
// JPEG 0.7 ≈ a few hundred KB); this only stops abuse / un-compressed uploads.
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

export const MAX_PHOTOS_PER_PHASE = 24;

export function isAllowedImageType(t: string): boolean {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(t);
}
