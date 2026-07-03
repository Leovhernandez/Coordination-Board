 # M22 Handoff Brief — Photo uploads (status-evidence) on R2

> For a fresh Claude Code session starting **M22**. Self-contained, but the governing
> docs still win. **M22 is NOT yet started** — this brief is the spec + the owner's
> R2 setup the build depends on. **§8 (R2 credentials + infrastructure) is the
> owner's to-do; everything else is the build.**

## 0. Read first (in order)
1. `AGENTS.md` — the constitution (binding; **wins on any conflict** — stop & flag).
   Pay special attention to **§5** (security), **§6** (the hardened **live-refresh
   invariant** — photos on the board MUST live-refresh on a 2nd device), **§7**
   (anti-scope — this is status evidence, NOT document management / video / invoicing),
   and **§9** (the photo-uploads amendment).
2. `docs/ROADMAP-AND-PRICING.md` — tiers + the M22 row.
3. `INSTRUCTIONS.md` — the live work order. **§0 defines the capability-flag
   mechanism** used to tier-gate (and to grandfather Trinity) — find and reuse it;
   never hardcode a company name.
4. This file.

## 1. Where things stand (2026-06-29)
- **v1 shipped (M9 pilot).** Post-v1 all shipped & deployed to prod (`main` → Vercel
  auto-deploy): **M14** multi-seat orgs, **M-VIS** company-wide read-only visibility,
  **M-DASH** symmetric dashboard, **M13** EN/ES i18n, **M17** phase notes, **M18**
  activity log + blocker pill, **M10** soft-delete/restore/purge of jobs. `main` HEAD
  `1da4b11`.
- **Supabase connector is connected** — you can apply migrations + run SQL against prod
  **directly** (project `coordination-board`, id `gfvemminanesyjhcsmua`). Protocol:
  pre-flight the migration + smoke wrapped in `BEGIN; … ROLLBACK;` via `execute_sql`
  (no raised error = pass; verify nothing persisted), then `apply_migration` for real.
- **R2 has been deferred until exactly this milestone** (cost model in §9 ROADMAP). The
  owner must complete §8 below before the upload/serve paths can work end-to-end.

## 2. M22 goal + the DECIDED design (owner-confirmed 2026-06-29)
Status-evidence photos attached on **Blocked / Done / In-progress** transitions only.
**Not** document management, **not** video, **not** invoicing (AGENTS §7). Stored on
**Cloudflare R2** (≈$0.015/GB-mo storage, **$0 egress**), served **direct from R2 via a
Cloudflare CDN custom domain** — **never proxied through Vercel** (that's the one
mistake that destroys the cost model).

**Tier = Base + Pro via a STORAGE CAP (the cap is the upsell, not the feature):**
- **Base ($49) = 10 GB** (~25k compressed photos). A moderate contractor uses
  ~3–6 GB/yr → undisturbed for years; M10 job-purge frees space.
- **Pro ($99) = 100 GB** (10× headroom). High-usage ops hit 10 GB in months → upgrade.
- **At cap:** block **new** uploads + show an "Upgrade to Pro" prompt; existing photos
  stay viewable — never delete/degrade. **Enforce the cap server-side** (per-org byte
  accounting); the client cannot be trusted.
- COGS at the caps: Base ~$0.15/mo (0.3% of $49), Pro ~$1.50/mo (1.5% of $99). The
  number is a one-line constant — dial later if needed.
- **Tier-gate by capability flag** (INSTRUCTIONS §0), never a hardcoded company name.
  Trinity is grandfathered into Pro caps via that flag.

**Lifecycle (synergy with M10, already shipped):**
- **M10's `purgeJob` (app/jobs/[id]/actions.ts) must be extended to delete the job's R2
  objects** when a job is permanently deleted — otherwise storage leaks after jobs end.
- **Cancellation retention (owner policy):** on subscription cancel, data + media are
  retained and **exportable for 30 days**; an **email notice on cancellation** states
  the export deadline + how to pull data (via the future **M-EXPORT**). After 30 days →
  purge the org's R2 objects. Needs a **scheduled purge** keyed off the cancel date
  (Vercel Cron or a scheduled job + a cron secret).

## 3. What already exists to build on
- **No M22 code yet.** But the patterns to mirror are all in place:
  - Two-sided actor (member XOR participant) + a service-role-written, RLS-read table:
    see **M18 `activity_log`** (`lib/activity.ts`, `supabase/migrations/20260629140000…`).
  - A per-phase loader resolving authorized data server-side: **`lib/notes.ts`**
    (`notesForJob`) and **`lib/activity.ts`** (`activityForJob`).
  - A compact, glance-safe per-phase component: **`components/PhaseNotes.tsx`** /
    **`components/PhaseHistory.tsx`** (`useT()`/`useLang()`, action-agnostic).
  - Live-refresh wiring: **`components/RealtimeRefresh.tsx`** (one channel per table),
    **`lib/realtime.ts`** (`broadcastJobChange` for anon crew).
  - Migration + RLS smoke pattern: `supabase/migrations/20260629160000_m10_soft_delete_jobs.sql`
    + `supabase/tests/rls-m10-soft-delete-smoke.sql`.

## 4. What's LEFT to build (the M22 build)

**A. R2 client + signed uploads (server-only).** Add an S3-compatible client
(`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`) in a new `lib/r2.ts`
(`server-only`, mirrors `lib/supabase/service.ts`'s server-only guard). Server actions:
- `createUploadUrl({ jobId, phaseId, statusContext, contentType, byteSize })` →
  validates the actor (member via `getSessionContext`; crew via token → participant →
  **assigned phase**, like `updateAssignedPhase`), checks the **org cap** (sum of bytes
  vs the tier cap), rejects non-image MIME + oversize, then returns a **presigned PUT
  URL** to a key like `org/<orgId>/job/<jobId>/<uuid>.jpg`. The browser PUTs the
  compressed bytes **directly to R2** (never through the app server).
- `confirmUpload({ … r2Key, thumbKey, byteSize, width, height })` → inserts the
  metadata row (service-role for crew; authed for members, mirroring notes), after
  re-checking the cap (a second writer could have raced).

**B. Metadata table + RLS (migration via the Supabase connector, test-first).** New
`photos` table (suggested):
`id, job_id (fk jobs on delete cascade), phase_id (fk phases on delete set null),
status_context text check in ('blocked','done','in_progress'), uploaded_by_member_id,
uploaded_by_participant_id (two-sided, like notes/activity), r2_key text not null,
thumb_key text, content_type text, byte_size bigint not null, width int, height int,
created_at timestamptz default now()`.
RLS mirrors notes: members **read** org-wide (`can_read_job`); crew read photos on their
**assigned** phases; writes server-side. Per-org byte accounting for the cap (sum with
an index, or a maintained counter on `organizations`). **Publish `photos` to
`supabase_realtime` + `REPLICA IDENTITY FULL`** so thumbnails live-refresh and deletes
propagate (AGENTS §6 invariant), and add `"photos"` to the board's `RealtimeRefresh`
tables.

**C. Client capture + compression.** A client component (mirror `PhaseNotes`) that, on
a Blocked/Done/In-progress transition, lets the user attach photos via
`<input type="file" accept="image/*" capture="environment">` (mobile camera). **Compress
client-side** (canvas: resize longest edge ~1600px, JPEG ~0.7) **and generate the
thumbnail client-side** (small canvas) so there is **zero server image compute**, then
PUT both to R2 via the signed URLs. Show upload progress; handle bad-signal retries.

**D. Display (glance test).** Small thumbnails inside the phase detail (not the
headline; never break the 3-second glance, AGENTS §7) with a tap-to-enlarge lightbox.
`src` is built from `NEXT_PUBLIC_R2_PUBLIC_BASE` + the key (served by the CDN custom
domain, **not** Vercel). Decide with the owner: photos on the read-only team view +
crew board? Max photos per transition?

**E. Tier gate + cap UX.** Gate the upload UI + endpoints behind the capability flag
(Base sees photos w/ 10 GB cap; Pro 100 GB). At the cap: block new uploads + "Upgrade to
Pro" upsell. **Base with no flag still gets photos** (it's a Base feature now) — the gate
is the **cap size**, not the feature. (This reverses the old "Pro-only" framing; update
AGENTS §9 + ROADMAP when it ships.)

**F. Lifecycle hooks.** Extend M10 `purgeJob` to delete the job's R2 objects (list by
`r2_key` prefix, batch-delete). Add the cancellation 30-day retention + email notice +
scheduled purge (see §8.6).

**G. i18n.** All new strings through `lib/i18n/dictionaries.ts` (EN **and** ES; `es: Dict`
fails `tsc` if a key is missing).

**H. Docs.** Update `AGENTS.md` §9 (photo bullet → Base+Pro tiered cap), 
`docs/ROADMAP-AND-PRICING.md` (§1 tiers + M22 row), `README.md`.

## 5. Constraints (binding)
- **§5 security:** R2 secret keys are **server-only** (`lib/r2.ts` with a `server-only`
  import, like `lib/supabase/service.ts`). The service-role key still never reaches the
  client. Participants never become auth users — crew uploads go token → participant →
  **assigned phase** → server-side signing, identical to `updateAssignedPhase`. RLS
  deny-by-default; reads and writes are separate policies.
- **§6 live-refresh (now a perpetual, binding invariant):** a thumbnail that appears on
  a surface another session is watching MUST live-refresh there with **no manual
  reload** — verified on a **SECOND device/session**. Publish `photos` (+ `REPLICA
  IDENTITY FULL`) and add it to `RealtimeRefresh`; the crew board refreshes via
  `broadcastJobChange`. "Shows on next load" is a failed feature.
- **§6 regression gate:** re-verify ALL prior features (esp. realtime, sign-in, RLS
  read/write + tenant isolation, critical-path headline) — not in isolation.
- **§7 glance test:** status evidence only; thumbnails live in phase detail, never the
  headline; the board must still read one-handed in 3 seconds.
- **NEVER proxy image bytes through Vercel** — uploads go browser→R2 (signed PUT),
  serving is CDN custom domain. This is the cost model.
- **Server-side is the enforcement:** client compression + MIME + size are advisory;
  re-validate MIME allowlist, max size, and the **org cap** server-side on both the
  presign and the confirm.
- **Migration cadence:** apply the migration (Supabase connector, test-first in
  `BEGIN…ROLLBACK`) **before** deploying code that queries `photos`.
- **No commit/push/deploy without explicit owner go-ahead.** Pause at "Done when" for
  real-device validation (mobile capture + upload + thumbnail + live-refresh on a 2nd
  device + cap enforcement + tier gate).
- **Tier-gate by capability flag, never a hardcoded company name.**

## 6. Key file paths
**Build new**
- `lib/r2.ts` (server-only R2 client + presign/delete helpers)
- `supabase/migrations/<ts>_m22_photos.sql` + `supabase/tests/rls-m22-photos-smoke.sql`
- `lib/photos.ts` (loader, mirror `lib/notes.ts` / `lib/activity.ts`)
- `components/PhasePhotos.tsx` (capture + compress + thumbnails; mirror `PhaseNotes.tsx`)

**Instrument / extend**
- `app/jobs/[id]/actions.ts` — member upload actions; **extend `purgeJob`** to delete R2
  objects. `app/j/[jobId]/actions.ts` — crew upload actions (token-scoped, like
  `updateAssignedPhase`/`addCrewNote`).
- `app/jobs/[id]/page.tsx` + `app/jobs/[id]/Board.tsx` — load photos, render thumbnails,
  add `"photos"` to `RealtimeRefresh tables`. `app/j/[jobId]/page.tsx` +
  `app/j/[jobId]/ParticipantBoard.tsx` — crew side.
- `app/api/stripe/webhook/route.ts` + `lib/stripe.ts` — cancellation → 30-day retention
  + notice; the scheduled purge.
- `lib/types.ts` (Photo / PhotoView types), `lib/i18n/dictionaries.ts` (EN+ES strings).
- Capability flag: **locate the org-capability mechanism (INSTRUCTIONS §0)** — likely an
  org-level flag/column; reuse it for the tier/cap gate. Confirm where the **tier**
  (Base vs Pro) is represented before building the gate.

**Patterns to mirror** — `lib/supabase/service.ts` (`server-only`), `lib/membership.ts`
(`getSessionContext`), `lib/participant.ts` (`getParticipantByToken`,
`participantCookieName`), `lib/realtime.ts`, `components/RealtimeRefresh.tsx`,
`components/I18nProvider.tsx`.

## 7. Verification gates (all must pass before commit)
```
npx tsc --noEmit
npm run lint
npx tsx scripts/test-headline.mts      # 6/6 PASS
npm run build
```
Plus: the `photos` RLS pre-flight smoke (run via the Supabase connector, wrapped in
`BEGIN…ROLLBACK`), and **real-device validation** (mobile capture → upload → thumbnail
→ live-refresh on a 2nd device → cap enforcement → tier gate → photos hidden from
non-assigned crew → R2 object freed on job purge).

## 8. ⚙️ OWNER TO-DO — R2 credentials + infrastructure you must set up/provide
> Do these in Cloudflare, then hand the values to the new session. The build can be
> written without them, but the upload/serve paths only work end-to-end once these
> exist. Treat all keys as secrets.

1. **Cloudflare account + R2 bucket.** Enable R2 (requires a card on file even on the
   free tier). Create a bucket, e.g. **`coordination-board-photos`**. Tell me the bucket
   name and your **Account ID** (Cloudflare dashboard → R2 → it's in the endpoint URL
   `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`).

2. **R2 API token (S3-compatible).** R2 → "Manage R2 API Tokens" → create a token with
   **Object Read & Write**, scoped to that one bucket. It gives you an **Access Key ID**
   and **Secret Access Key**. Provide both (Secret is shown once).

3. **Public serving domain (critical — direct serve, NOT via Vercel).** Connect a
   **custom domain** to the bucket: R2 → your bucket → Settings → **Custom Domains** →
   add e.g. **`media.coordination.4lfr.com`** (a subdomain you control in Cloudflare
   DNS). This serves objects through Cloudflare's CDN with **$0 egress**. Provide the
   final URL (e.g. `https://media.coordination.4lfr.com`). *(Do NOT rely on the
   `*.r2.dev` dev URL for production — it's rate-limited.)*

4. **CORS on the bucket** (so the browser can PUT directly via the signed URL). In R2 →
   bucket → Settings → CORS, allow the app origin. Paste this (adjust origins):
   ```json
   [{ "AllowedOrigins": ["https://coordination.4lfr.com", "http://localhost:3000"],
      "AllowedMethods": ["PUT","GET"],
      "AllowedHeaders": ["content-type"],
      "MaxAgeSeconds": 3600 }]
   ```
   (If you'd rather, give me R2 admin access via the connector and I'll apply it.)

5. **Environment variables** — add to **Vercel** (Production + Preview) and your local
   `.env.local`. Server-only secrets (NO `NEXT_PUBLIC_`):
   - `R2_ACCOUNT_ID` = your Cloudflare account id
   - `R2_ACCESS_KEY_ID` = from step 2
   - `R2_SECRET_ACCESS_KEY` = from step 2
   - `R2_BUCKET` = the bucket name (step 1)
   - `R2_ENDPOINT` = `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`
   Public (safe to expose — it's just the CDN base for `<img src>`):
   - `NEXT_PUBLIC_R2_PUBLIC_BASE` = `https://media.coordination.4lfr.com` (step 3)

6. **Scheduled purge (for the 30-day cancellation retention).** Decide the mechanism:
   easiest is a **Vercel Cron** hitting an authenticated route daily that purges R2
   objects for orgs canceled > 30 days ago. If you want this, I'll need a **`CRON_SECRET`**
   env var (you generate a random string; I add the route + `vercel.json` cron). You can
   also defer this to when **M-EXPORT** lands (the export side of the same policy).

7. **Confirm the tier caps** (defaults already decided): **Base = 10 GB, Pro = 100 GB**.
   Say if you want different numbers.

8. **Confirm the capability-flag / tier source.** Tell me (or point me to) how an org is
   marked **Pro** vs **Base** today, and how Trinity's grandfather flag is set — so the
   cap gate reads the right field instead of a hardcoded name.

## 9. Gotchas / lessons (carry-forward)
- **The Vercel-egress trap:** if image bytes ever flow through a Next.js route/`/api`
  handler, you pay Vercel egress and lose R2's free-egress advantage. Browser→R2 for
  uploads (signed PUT), CDN custom domain for serving. Always.
- **Client compression is bypassable** — a crafted request can hit the presign endpoint
  directly. Re-validate MIME (image/* allowlist), max byte size, and the org cap
  **server-side** on presign AND confirm.
- **Live-refresh is now a hardened §6 invariant** — `photos` must be published (+ REPLICA
  IDENTITY FULL for delete propagation) and added to `RealtimeRefresh`; verify a 2nd
  device sees a new thumbnail with no reload. The M18 commit-ordering race applies: the
  event that drives the refresh must commit after the row exists, or publish the table
  itself.
- **Migrations now go through the Supabase connector** (project `gfvemminanesyjhcsmua`),
  test-first in `BEGIN…ROLLBACK`, then `apply_migration`. Apply before deploying code
  that queries `photos`.
- **The sign-in interstitial (`/auth/confirm` GET→POST) is load-bearing** (FIX-2 scanner
  defense) — don't touch it.
- Env: Windows/PowerShell; `.env.local` has `NEXT_PUBLIC_SITE_URL=http://localhost:3000`.
  Local two-window testing runs against prod Supabase.
- `es` in `dictionaries.ts` is typed `Dict` → a missing ES key fails `tsc`.
