"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  ConfirmUploadInput,
  ConfirmUploadResult,
  CreateUploadInput,
  CreateUploadResult,
  PhotoUploadError,
  PhotoView,
  StatusContext,
} from "@/lib/types";
import { useT, useLang } from "@/components/I18nProvider";
import { relativeTime } from "@/lib/relative-time";

/**
 * M22 status-evidence photos in a phase. Action-agnostic like PhaseNotes: the
 * editable board passes the member upload actions, the crew board passes the crew
 * actions, so one component serves the editable board, the read-only in-depth view,
 * and the crew board (and they can't drift). Compact — thumbnails live in phase
 * detail, never the headline (glance test, AGENTS §7). Compression + thumbnailing
 * happen client-side so there is ZERO server image compute and the bytes go
 * straight browser→R2 (never Vercel).
 */

const MAIN_EDGE = 1600;
const THUMB_EDGE = 320;
const JPEG_QUALITY = 0.7;

async function compress(
  file: File,
  maxEdge: number,
): Promise<{ blob: Blob; width: number; height: number }> {
  // imageOrientation "from-image" applies EXIF rotation; re-encoding via canvas
  // also strips metadata (smaller + no location leak). Cast: the option isn't in
  // every TS lib.dom union yet.
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  } as unknown as ImageBitmapOptions);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      JPEG_QUALITY,
    ),
  );
  return { blob, width, height };
}

async function putWithRetry(url: string, blob: Blob, attempts = 3): Promise<void> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        method: "PUT",
        body: blob,
        headers: { "Content-Type": "image/jpeg" },
      });
      if (res.ok) return;
      lastErr = new Error(`PUT ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 500 * (i + 1)));
  }
  throw lastErr;
}

export function PhasePhotos({
  phaseId,
  statusContext,
  photos,
  canAdd,
  onCreateUploadUrl,
  onConfirm,
}: {
  phaseId: string;
  /** null when the phase is not_started → status evidence doesn't apply yet. */
  statusContext: StatusContext | null;
  photos: PhotoView[];
  canAdd: boolean;
  onCreateUploadUrl: (input: CreateUploadInput) => Promise<CreateUploadResult>;
  onConfirm: (input: ConfirmUploadInput) => Promise<ConfirmUploadResult>;
}) {
  const t = useT();
  const lang = useLang();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<PhotoView | null>(null);

  const canCapture = canAdd && statusContext != null;
  if (photos.length === 0 && !canCapture) return null;

  function msgFor(code: PhotoUploadError): string {
    switch (code) {
      case "cap":
        return t.photos.capReached;
      case "size":
        return t.photos.tooLarge;
      case "type":
        return t.photos.badType;
      case "count":
        return t.photos.tooMany;
      default:
        return t.photos.failed;
    }
  }

  async function uploadOne(file: File, sc: StatusContext): Promise<void> {
    const [main, thumb] = await Promise.all([
      compress(file, MAIN_EDGE),
      compress(file, THUMB_EDGE),
    ]);
    const created = await onCreateUploadUrl({
      phaseId,
      statusContext: sc,
      contentType: "image/jpeg",
      byteSize: main.blob.size,
    });
    if (!created.ok) {
      setError(msgFor(created.error));
      return;
    }
    await putWithRetry(created.uploadUrl, main.blob);
    await putWithRetry(created.thumbUploadUrl, thumb.blob);
    const confirmed = await onConfirm({
      phaseId,
      statusContext: sc,
      key: created.key,
      thumbKey: created.thumbKey,
      contentType: "image/jpeg",
      width: main.width,
      height: main.height,
    });
    if (!confirmed.ok) setError(msgFor(confirmed.error));
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0 || statusContext == null) return;
    setError(null);
    const sc = statusContext;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) {
        setError(t.photos.badType);
        continue;
      }
      setBusy((n) => n + 1);
      try {
        await uploadOne(file, sc);
      } catch {
        setError(t.photos.failed);
      } finally {
        setBusy((n) => n - 1);
      }
    }
    // Pull the new thumbnail in for the uploader; other sessions get it via realtime.
    router.refresh();
  }

  return (
    <div className="mt-2.5">
      {photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {photos.map((ph) => (
            <button
              key={ph.id}
              type="button"
              onClick={() => setLightbox(ph)}
              className="overflow-hidden rounded-lg border border-slate-200 active:opacity-80"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- served by R2 CDN, not Vercel (cost model) */}
              <img
                src={ph.thumbUrl}
                alt={t.photos.photoAlt}
                loading="lazy"
                className="h-16 w-16 object-cover"
              />
            </button>
          ))}
        </div>
      )}

      {canCapture && (
        <div className="mt-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => {
              void handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy > 0}
            className="text-xs font-medium text-slate-500 active:text-slate-900 disabled:opacity-50"
          >
            {busy > 0 ? t.photos.uploading : `+ ${t.photos.add}`}
          </button>
        </div>
      )}

      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/80 p-4"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- served by R2 CDN, not Vercel (cost model) */}
          <img
            src={lightbox.url}
            alt={t.photos.photoAlt}
            className="max-h-[80vh] max-w-full rounded-lg"
          />
          <p className="text-xs text-white/80">
            {lightbox.uploaderName}
            {lightbox.uploaderType === "crew" && ` · ${t.photos.crewTag}`}
            {` · ${relativeTime(lightbox.createdAt, lang)}`}
          </p>
        </div>
      )}
    </div>
  );
}
