import "server-only";
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  type ListObjectsV2CommandOutput,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Cloudflare R2 client (S3-compatible) — SERVER-ONLY, mirroring lib/supabase/service.ts.
 *
 * SECURITY (AGENTS §5): the R2 secret keys must never reach the browser. The
 * `server-only` import makes any client import a build error. Uploads go
 * browser→R2 via a SHORT-LIVED presigned PUT (the bytes never transit Vercel);
 * serving is the public CDN custom domain (NEXT_PUBLIC_R2_PUBLIC_BASE), also never
 * Vercel — that is the cost model (R2 has $0 egress; proxying through Vercel would
 * reintroduce egress cost). See M22-HANDOFF §9.
 */

let _client: S3Client | null = null;

function r2Endpoint(): string {
  const e = process.env.R2_ENDPOINT;
  if (!e) throw new Error("R2_ENDPOINT is not configured.");
  return e;
}

export function r2Bucket(): string {
  const b = process.env.R2_BUCKET;
  if (!b) throw new Error("R2_BUCKET is not configured.");
  return b;
}

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ENDPOINT &&
      process.env.R2_BUCKET &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY,
  );
}

function client(): S3Client {
  if (!_client) {
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    if (!accessKeyId || !secretAccessKey) {
      throw new Error("R2 credentials are not configured.");
    }
    _client = new S3Client({
      region: "auto", // R2 ignores region but the SDK requires one
      endpoint: r2Endpoint(),
      forcePathStyle: true, // account endpoint + path-style avoids bucket-in-host
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return _client;
}

/** Public CDN URL for an object key (served by the R2 custom domain, NOT Vercel). */
export function r2PublicUrl(key: string): string {
  const base = (process.env.NEXT_PUBLIC_R2_PUBLIC_BASE ?? "").replace(/\/$/, "");
  return `${base}/${key}`;
}

/** Presigned PUT URL for a direct browser→R2 upload. Short-lived by design. */
export async function presignPutUrl(
  key: string,
  contentType: string,
  expiresInSeconds = 180,
): Promise<string> {
  const cmd = new PutObjectCommand({
    Bucket: r2Bucket(),
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(client(), cmd, { expiresIn: expiresInSeconds });
}

/**
 * Authoritative object size (bytes) from R2, or null if it doesn't exist. Used on
 * confirm to defeat a client that under-declared its byte size at presign time
 * (a HEAD is metadata-only — no egress).
 */
export async function headObjectSize(key: string): Promise<number | null> {
  try {
    const res = await client().send(
      new HeadObjectCommand({ Bucket: r2Bucket(), Key: key }),
    );
    return typeof res.ContentLength === "number" ? res.ContentLength : null;
  } catch {
    return null;
  }
}

/** Best-effort delete of specific keys (chunked to S3's 1000-key batch limit). */
export async function deleteObjects(keys: (string | null | undefined)[]): Promise<void> {
  const real = keys.filter((k): k is string => !!k);
  if (real.length === 0) return;
  for (let i = 0; i < real.length; i += 1000) {
    const chunk = real.slice(i, i + 1000);
    await client().send(
      new DeleteObjectsCommand({
        Bucket: r2Bucket(),
        Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
      }),
    );
  }
}

/** Deletes every object under a key prefix (e.g. a purged job's folder). */
export async function deleteByPrefix(prefix: string): Promise<void> {
  let token: string | undefined = undefined;
  do {
    const listed: ListObjectsV2CommandOutput = await client().send(
      new ListObjectsV2Command({
        Bucket: r2Bucket(),
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    await deleteObjects((listed.Contents ?? []).map((o) => o.Key));
    token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (token);
}
