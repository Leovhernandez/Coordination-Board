# INSTRUCTIONS.md — Coordination Board, Build Round 2

> **What this file is.** The work order for the next build round, driven by client
> feedback (Trinity Floor Co. and prospects). It plays the same role
> `BUILD-PROMPT.md` played for v1 — but `BUILD-PROMPT.md` is the **v1 historical
> record; do not edit it.** This file is the live work order.
>
> **Read first, in order:** `AGENTS.md` (the constitution — binding; where it and
> this file ever disagree, **AGENTS.md wins, stop and flag it**) → `docs/ROADMAP-AND-PRICING.md`
> (tiers, build order, cost model) → this file.

---

## ▶ Where to start (read this first)

This file has accumulated several rounds of work. **Address the newest dated batch
first — it is the active queue:**

- **M-MULTI — Multiple crew per phase (Round 4, 2026-07-07)** ← **newest; start here.**
  Assign up to 10 equal-permission crew (subcontractors) to any phase. Full spec in
  PHASE 1 → **M-MULTI** (last milestone before "Cross-cutting requirements").
- **PHASE 0.6 — New bugs & billing (Round 3, 2026-07-01)** — **N1** (sign-in opens the
  email app's in-app browser → session doesn't persist + invite-accept doesn't
  live-refresh), **N2** (Base/Pro/Enterprise pricing in Stripe + auto-transition off the
  3-month promo to Base $49 with a dated notice), **N3** (Spanish toggle shrinks the
  mobile screen).
- **PHASE 0.5 — M17 regression fixes (2026-06-29)** — R1–R4, still open unless
  already merged.

**Already built (this round patches/extends them — do NOT rebuild):** M-VIS
(company-wide read), **M13** (EN/ES i18n), **M17** (phase notes). For everything
else (FIX-1, FIX-2, and the remaining Phase 1 milestones M18/M22/M-EXPORT/M10),
**check the current code/status before starting** — some may be done, partial, or
pending. Each item's "**Done when**" is its acceptance test; the §0 ground rules
apply to all.

---

## 0. Ground rules (apply to everything below)

- **Stack (do not substitute):** Next.js 15 App Router + TS · Tailwind · Supabase
  (Postgres + Auth + Realtime) · Stripe · Vercel · PWA, mobile-first. Before
  depending on any Supabase/Next.js API (Realtime channel syntax, RLS patterns,
  `verifyOtp`, server-action conventions), **verify against today's docs — do not
  hardcode from memory** (AGENTS.md §3).
- **Milestone discipline (AGENTS.md §4, §6).** Each milestone ends as a working,
  deployable build. Work one milestone at a time. **Pause at each "Done when" for
  the owner to validate on a real device.** Keep commits scoped to one milestone.
- **Migrations are applied by the owner, manually, in Supabase.** Cadence for any
  schema change: write the migration → **STOP and have the owner apply it** → then
  app-layer code → regression → owner validates. The migration apply is a natural
  pause point (ROADMAP §3, `docs/RELEASE-CHECKLIST.md`).
- **Regression-test every change against ALL prior features, not in isolation**
  (AGENTS.md §6). Run `docs/RELEASE-CHECKLIST.md`. Realtime and RLS are the two
  things most likely to silently regress — re-test them after every milestone.
- **Never commit, push, or deploy without explicit go-ahead** (AGENTS.md §6).
- **Security invariants are non-negotiable** (AGENTS.md §5): the service-role key
  is server-only (`lib/supabase/service.ts`, `server-only` import); participants
  never become auth users; RLS is deny-by-default; **read access and write access
  are always separate policies** (this matters a lot in M-VIS).
- **The glance test governs every UI addition** (AGENTS.md §7): if a change makes
  the board harder to read one-handed in three seconds, it does not ship.
- **Tier-gate by capability flag, never by hardcoded company name.** Derive an
  org-level capability set from the plan (Base / Pro / Enterprise) **plus**
  per-company overrides (so Trinity can be grandfathered into a Pro feature at
  their price — ROADMAP §1). Base = core board + visibility + notes + logging +
  i18n + export. Pro adds photos (+ scoreboard, later). Enterprise adds
  video/docs/SSO (out of scope this round).
- **Diagnose before you rewrite.** For both Phase 0 fixes, produce a short written
  diagnosis (root cause, evidence from logs/DB/config) **before** changing code.
  Do not "fix" by rewriting working subsystems.

**Milestone numbering.** Existing roadmap numbers are reused where they map
(M13 i18n, M17 notes, M18 logging, M22 photos). New/cross-cutting items get
descriptive tags (M-VIS, M-DASH, M-EXPORT). **At each milestone, update
`AGENTS.md` §9 and `docs/ROADMAP-AND-PRICING.md`** to record what shipped and any
scope/tier change, and keep the `README.md` milestone list current.

---

## PHASE 0 — Urgent fixes (do first; validate on a real device before Phase 1)

### FIX-1 — Live refresh: audit all live pages, find the regression, repair it

**Symptom (owner).** Live refresh of **job updates is missing on the owner-side
dashboard**. More broadly: confirm live refresh works on **every** page/action
that is spec'd to update without a manual refresh; where it doesn't, identify
**why** and **what change broke it**, then fix.

**What exists today (do not blindly replace):**
- `components/RealtimeRefresh.tsx` — client `postgres_changes` subscription,
  RLS-scoped; calls `router.refresh()`. Dashboard mounts it with
  `tables={["phases","jobs","org_members"]}` (no filter); `/jobs/[id]` mounts it
  with `filter={"job_id=eq.<id>"}`.
- `components/BroadcastRefresh.tsx` — broadcast-channel listener for participant
  boards (anon-friendly, no RLS), with backoff retry.
- `lib/realtime.ts` `broadcastJobChange()` — server-side broadcast on `job-<id>`
  so crew (anon) boards refresh.
- Realtime publication migrations: `..._realtime_phases.sql`,
  `..._realtime_jobs.sql`, `..._realtime_org_members.sql`.

**Hypotheses to verify, ranked (confirm with evidence — don't guess):**
1. **Publication not actually applied in prod (most likely).** `postgres_changes`
   only fires for tables in the `supabase_realtime` publication. Run against the
   **live** DB: `select schemaname, tablename from pg_publication_tables where
   pubname = 'supabase_realtime';` — confirm `phases`, `jobs`, **and**
   `org_members` are all present. A migration written but not applied = no events.
   "Job updates missing on the owner side" fits a `jobs`-not-in-publication state.
2. **Multi-table channel / client-version syntax.** The dashboard chains several
   `.on("postgres_changes", …)` before one `.subscribe()`. Verify this pattern is
   correct for the installed `@supabase/supabase-js` (^2.45) — channel/event
   binding has changed across versions. Confirm one channel can carry three table
   bindings, or split per table.
3. **RLS delivery scope.** `postgres_changes` delivers only rows the subscriber
   can `SELECT`. The owner can select all org jobs/phases (`is_org_owner`), so the
   owner *should* receive everything — verify. **This interacts with M-VIS:** once
   salesmen get org-wide read, their dashboards must also receive those events —
   re-verify after M-VIS.
4. **Service-role writes.** Crew updates are written via the service-role client.
   Those are real DB writes and **do** emit `postgres_changes`; confirm the
   owner's subscription receives crew-originated phase changes (and that
   `broadcastJobChange` still drives the participant path).
5. **Socket auth expiry.** On a long-open dashboard the realtime socket's JWT can
   expire; confirm the client re-authenticates so refresh doesn't silently die
   after a while.

**Deliverable.** (a) A short written audit: enumerate every page/action requiring
live refresh, the mechanism each uses, what was broken, the root cause, and the
fix. (b) The fix.

**Pages/actions that MUST live-refresh (verify each):** owner dashboard (own jobs
+ team roll-up: phase status, new/archived jobs, salesman rename); salesman
dashboard (after M-VIS); `/jobs/[id]` board (owner & salesman); `/j/[jobId]`
participant board; and the **read-only in-depth view** added in M-DASH.

**Done when:** on each listed page, a change made by another actor (crew via link,
another salesman, the owner) appears within ~1–2 s with **no manual refresh**,
verified on a real second device; job add/remove reflects automatically. Don't
break the participant broadcast path; service-role key stays server-only.

---

### FIX-2 — Login: owners bounced back to `/login`

**Symptom.** A test owner was returned to the login page in two scenarios, **both
using Outlook**:
1. Requested the link on **mobile**, opened/clicked it in **desktop** Outlook →
   bounced to `/login`.
2. Requested **and** signed in on the **same mobile device** (Outlook) → still
   bounced to `/login`.

**Current flow (map it before touching it):**
- `app/login/actions.ts` → tries `sendSignInLink()` (Resend, **token_hash** link →
  `/auth/confirm`, cross-device). **Fallback** if Resend unavailable:
  `supabase.auth.signInWithOtp()` (**PKCE code** → `/auth/callback`, same-browser
  only).
- `app/auth/confirm/route.ts` — token_hash: tries multiple OTP types, binds
  cookies to the returned `response` (a documented prior fix).
- `app/auth/callback/route.ts` — PKCE: uses `createClient()` (cookies via
  `next/headers`) then `NextResponse.redirect()` — **this is exactly the
  cookie-attach pattern `/auth/confirm` warns is unreliable**, so it may be
  latently broken.
- `lib/invites.ts` `signInLinkFor()` mints `…/auth/confirm?token_hash=…&type=magiclink`.

**First, determine which flow actually ran in prod.** Check Vercel logs for
`[sendSignInLink]`, `[auth/confirm]`, `[auth/callback]`. Confirm `RESEND_API_KEY`
and `NEXT_PUBLIC_SITE_URL` are set in prod and the `4lfr.com` domain is verified
(ROADMAP §5). If Resend isn't sending, every login is silently on the PKCE
fallback — which alone explains both scenarios.

**Hypotheses, ranked:**
1. **(HIGH) Email security scanner consuming the one-time token.** Outlook /
   Microsoft Defender **Safe Links** (and link prefetchers) issue a **GET** on
   email links *before* the human clicks. `/auth/confirm` runs `verifyOtp` on GET,
   which **consumes** the token_hash; the scanner burns it, the user's click then
   fails → bounce. Outlook is the constant across both scenarios (Outlook mobile
   also routes many tenants through Safe Links). **Fix:** move verification off the
   bare GET — render a lightweight **confirmation interstitial** on GET (no
   verify) with a button that **POSTs** to perform `verifyOtp`; automated GETs
   won't consume the token. Verify Supabase's current recommended pattern for this.
2. **(MODERATE) PKCE fallback + Outlook in-app browser.** PKCE stores a
   `code_verifier` cookie in the requesting browser. Mobile Outlook opens links in
   its **own in-app webview** (separate cookie jar), so even the same-device case 2
   fails; cross-device case 1 definitely fails. **Fix:** ensure the **token_hash**
   path is what actually runs in prod (Resend configured + domain verified), since
   PKCE fundamentally can't survive a different browser context.
3. **(MODERATE) `/auth/callback` cookie-attach bug.** Mirror the `/auth/confirm`
   fix: bind the Supabase client's cookies to the `NextResponse` object you return,
   so the PKCE fallback actually delivers the session.
4. **(LOW) token_hash type/TTL.** Multi-type loop already mitigates type ambiguity;
   confirm link TTL is long enough for real email delivery delay.

**Deliverable.** Written diagnosis identifying the **actual** prod cause from
logs/config, then a fix that is robust to **both** email scanners (interstitial /
POST verify) **and** in-app browsers (token_hash, not PKCE-dependent).

**Done when:** both repro scenarios pass on a real device with Outlook — (a)
request on phone, open in desktop Outlook → lands on `/dashboard`; (b) request +
open on the same phone in Outlook → lands on `/dashboard`. Salesman invite links
(same `/auth/confirm`) still work, and the same-browser PKCE fallback still works.
Don't weaken token single-use/short-TTL beyond what's needed to survive prefetch.

---

## PHASE 0.5 — M17 regression fixes (owner validation results, 2026-06-29)

> Owner-reported results from validating the **M17 (phase notes)** app-layer
> changes, plus two adjacent issues. **R1–R2 ship before resuming Phase 1**; R3 is a
> scoped new milestone; R4 is a quick layout fix. For each, **confirm the cited root
> cause before changing code** (diagnose-before-rewrite, §0). Cited line numbers are
> from the current files — re-check them, code may have shifted.

### R1 — Crew note **deletion** doesn't live-refresh the member board (add/edit do)

**Symptom.** A crew member adding or editing a note on their assigned phase
live-refreshes on the salesman's screen. When the crew member **deletes** their own
note, the deletion does **not** show on the salesman's screen until the crew member
takes a **separate** action (e.g. flipping the phase In progress → Done), which is
when the deleted note finally disappears.

**Root cause (high confidence).** The member job board
(`app/jobs/[id]/page.tsx` `RealtimeRefresh`, ~line 87) live-refreshes via
**`postgres_changes`** on `["phases","notes"]` filtered `job_id=eq.<id>`. `notes` is
in the realtime publication (M17 migration) but is left at Postgres' **default
`REPLICA IDENTITY`**, so a **DELETE** event's old row carries **only the primary key
(`id`)** — not `job_id`. So the `job_id=eq.<id>` filter can't match and RLS
`can_read_job(job_id)` can't be evaluated → **the DELETE event is dropped** and
never reaches the salesman. INSERT/UPDATE carry the full new row (with `job_id`) so
they pass; the next phase **UPDATE** (status change) carries `job_id`, fires
`router.refresh()`, and that re-fetch is when the already-deleted note vanishes —
exactly "not until a separate action." (The crew's *own* board refreshes because
the note actions call `broadcastJobChange()` via `revalidateCrew()`; the member
board listens to `postgres_changes`, not that broadcast.)

**Fix (primary).** New migration: `alter table notes replica identity full;` so
DELETE events include all columns (incl. `job_id`), letting the filter match and RLS
authorize delivery. Owner applies it manually (migration cadence).

**Systemic note (ties to R3).** Any table whose **DELETEs** must live-refresh under
a filter/RLS needs `REPLICA IDENTITY FULL`. A hard **job delete (R3)** or hard phase
delete will hit the *same* invisible-until-next-event bug on the dashboard unless
`jobs`/`phases` are `REPLICA IDENTITY FULL`. **Additional (optional) hardening:**
also mount `BroadcastRefresh` on `app/jobs/[id]` (the crew note actions already
broadcast) — it carries no data and triggers an RLS-scoped re-fetch, so it's safe
and catches any future DELETE-delivery gap. Prefer `REPLICA IDENTITY FULL` as the
surgical fix; add the broadcast listener only if you want belt-and-suspenders.

**Done when:** a crew member deleting their own note removes it from the salesman's
open board within ~1–2 s with **no** other action, on a second device; add/edit
still refresh; the owner dashboard also reflects deletions.

### R2 — Owner can **add notes (and edit)** on a salesman's job — should it?

**No — not under the documented design; this is a regression against it.**
The team roll-up is designed **read-only** (`ROADMAP §4` "Owner roll-up grid";
earlier dashboard code stated the owner "reads but never edits a salesman's job"),
and the roll-up section is labelled **read-only** in the UI. It happens because
`app/jobs/[id]/page.tsx` (~line 41) sets `canEdit = ctx.isOwner ||
job.salesman_member_id === ctx.member.id` — the blanket `ctx.isOwner` grants the
owner edit on **every** job. That flows to `Board readOnly={!canEdit}` → `PhaseNotes
canAdd={!readOnly}` (`app/jobs/[id]/Board.tsx` ~line 280), so on a salesman's job the
owner sees status controls, phase editing, **and** the "+ note" affordance. The
notes INSERT policy also allows it (its `can_access_job(job_id)` is true for the
owner on any org job).

**Decision for Leo (recommended: A).**
- **(A — recommended) Make every member read-only on jobs they don't own, owner
  included.** Set `canEdit = job.salesman_member_id === ctx.member.id ||
  (ctx.isOwner && !job.salesman_member_id)` — the owner still edits their own (and
  legacy null-salesman) jobs, but is **read-only** on salesmen's jobs. Optionally
  tighten the notes INSERT policy to drop the owner-override so the data layer
  matches the UI. Honors the read-only roll-up; the owner still **reads** all notes.
- **(B) Keep owner-edits-everything** (status quo) and treat note-adding as intended
  oversight — then update `ROADMAP §4` to drop "never edits."

Pick one (they conflict). Default to **A**; once chosen, record it in `AGENTS.md §9`.
**Done when:** the chosen policy holds in **both** UI and RLS, and salesman→salesman
viewing stays read-only.

### R3 — Jobs can be created/archived/unarchived but **not deleted**

**Confirmed.** `app/jobs/[id]/actions.ts` exposes `archiveJob` / `unarchiveJob`
only — no delete path. This is the backlog item **M10 (soft-delete + restore +
purge)**; promote it to a scheduled milestone in `ROADMAP-AND-PRICING.md`.

**Spec (recommended).** Prefer **soft-delete**: add `deleted_at timestamptz` (or a
`deleted` status) set via an **UPDATE** (live-refreshes cleanly — no REPLICA
IDENTITY issue), filtered out of all job queries, with a **Restore** action and an
explicit **owner-only hard Purge** (schema already `on delete cascade`s
phases/participants/notes, so purge is safe). Authorization: the job's owning
salesman + the owner (whoever `canEdit`s it per R2). If you build **hard** delete
instead, set `jobs` to `REPLICA IDENTITY FULL` (see R1) or the dashboard won't drop
the row live for other watchers. **Done when:** an authorized member soft-deletes a
job (disappears live everywhere), can restore it, and the owner can hard-purge.

### R4 — Dashboard header: name field collides with Language + Sign out

**Confirmed (layout).** Header is `flex items-start justify-between gap-2` with the
editable name (`OrgName`/`MemberName`) on the left and `LangToggle` + Sign out on
the right (`app/dashboard/page.tsx` ~lines 152–179). The name button and its inner
`<span class="text-2xl font-bold">` have **no `truncate` / `min-w-0`**
(`app/dashboard/OrgName.tsx` ~48–56, `MemberName.tsx` ~48–63), so a long
company/member name overflows its container and runs under the right-hand controls;
the inline edit `<input class="w-full">` widens for the same reason.

**Fix.** Give the left wrapper `min-w-0 flex-1`; add `truncate` (and `min-w-0
max-w-full`) to the name button and its span; keep the right control group
`shrink-0` (already is). Apply to **both** `OrgName` and `MemberName`; confirm the
edit input fits without pushing the buttons. **Done when:** the longest realistic
name truncates with an ellipsis and never overlaps Language/Sign out — in EN **and**
ES, on a ~360 px phone, in both display and edit states.

---

## PHASE 0.6 — New bugs & billing (Round 3, owner-filed 2026-07-01)

> The three items below are the **current active work order** (see "Where to start").
> Diagnose-before-rewrite (§0). N1 extends the FIX-2 auth work; N2 is a billing
> milestone; N3 is the general-language sibling of R4.

### N1 — Sign-in link opens the email app's in-app browser → session doesn't persist + invite-accept doesn't live-refresh

**Symptom.** On some phones, tapping the sign-in button/link in the email opens it in
the **email app's in-app browser (webview)** instead of the device's default browser.
A session created in that webview **doesn't persist** (the user isn't kept signed in),
and — for an invited salesman — the owner's Team view **doesn't live-refresh** to show
the invite was accepted. **Requirement:** every user must end up signed in **in their
system browser** so the login persists.

**Why (two compounding problems):**
1. **In-app webview session loss.** Email apps (Outlook, Gmail, etc.) open links in an
   embedded webview with an **isolated, often ephemeral cookie jar**. The Supabase
   session cookies land there and are discarded when the webview closes — or never
   carry to the system browser the user later opens — so the login "doesn't persist."
   (Same failure mode as FIX-2 hypothesis #2; N1 makes solving it a hard requirement
   for **all** users, not just Outlook.)
2. **The Team page has no realtime.** `app/dashboard/team/page.tsx` renders each
   member's **"invited" vs "joined"** pill from `m.user_id`, but mounts **no
   `RealtimeRefresh`** — so even when a salesman signs in and `claimPendingInvite`
   links their `user_id`, the owner's open Team page never updates. (The dashboard
   subscribes to `org_members`; the Team page does not.)

**Fix.**
- **Push sign-in into the system browser.** The emailed link should land on the
  **confirmation interstitial** introduced for FIX-2 (verify runs on the user
  click/POST, not the bare GET). On that page, **detect an in-app webview** (user-agent
  sniff) and, when detected, show a prominent **"Open in your browser to finish signing
  in"** step **and** attempt an automatic hand-off where the platform allows it — Android
  `intent://…#Intent;scheme=https;…;S.browser_fallback_url=…;end`; iOS has no reliable
  programmatic force, so show the instruction plus a copyable link. `verifyOtp` then
  completes in whatever browser the user finishes in.
- **Guarantee persistence.** Verify the auth cookies are `httpOnly`, `Secure`,
  `SameSite=Lax`, with a real (non-session) expiry, set on the returned response
  (the `/auth/confirm` response-bound pattern). Persisting in the system browser is the
  goal; a webview must at minimum not silently drop the session.
- **Make invite-accept live.** Add `RealtimeRefresh` (postgres_changes on `org_members`,
  org-scoped) to `app/dashboard/team/page.tsx` so "invited → joined" flips live. (It's
  an UPDATE that sets `user_id`, which carries the new row — no REPLICA IDENTITY FULL
  needed, unlike the DELETE case in R1.)

**Done when:** on iOS **and** Android, tapping the emailed link — including from inside
Outlook/Gmail — yields a **persisted** signed-in session (survives closing the email app
and reopening the browser), and the owner's open Team page flips the invitee from
"invited" to "joined" live with no manual refresh. Cross-check FIX-2 (shared interstitial).

### N2 — Configure Base/Pro/Enterprise pricing in Stripe + auto-transition off the promo

**Current state.** Billing is **single-price**: one `STRIPE_PRICE_ID`; `startCheckout`
(`app/billing/actions.ts`) subscribes to that one price; `lib/stripe.ts` tracks only
`subscription_status` (trialing/active/past_due/canceled) via `mapStripeStatus` — **no
plan tier, no per-tier caps, no promo tracking.** Webhook: `app/api/stripe/webhook/route.ts`.

**⚠ Pricing correction (reconcile before building).** Leo now sets **Base = $49/mo**,
but `ROADMAP §1` says **$39**. Use **$49**; update `docs/ROADMAP-AND-PRICING.md §1`
(Base $49, Pro $99, Enterprise from ~$299) and flag any other stale price there.

**Build.**
- **Three Stripe prices** (Leo configures them in Stripe; the app reads price/product IDs
  from env, replacing the single `STRIPE_PRICE_ID`): Base $49, Pro $99, Enterprise
  (custom/$299).
- **Store a plan tier** on `organizations` (e.g. `plan text` ∈ `base|pro|enterprise`),
  synced from the subscription's price by the webhook on
  `customer.subscription.created/updated/deleted` — alongside the existing
  `subscription_status`.
- **Tier → capability mapping = the §0 capability-flag model** (features **and**
  usage/storage caps): Base = core board + notes + logging + i18n + export + visibility;
  Pro adds photos (R2 storage cap) + scoreboard; Enterprise adds video/docs/SSO. Keep
  per-company overrides (Trinity's photo grandfather). Gate on the derived capability
  set, **never** the raw price ID.
- **Checkout picks the tier's price** (per-tier price IDs, not the single env var).
- **Promo → Base transition (the specific ask).** Promo = **$20/mo for the first 3
  months**, then **Base $49/mo**. Implement with **Stripe Subscription Schedules**:
  phase 1 = promo price × 3 months → phase 2 = Base price, so **Stripe flips the price
  itself** at month 3 (do not hand-roll a mid-subscription price change). Store
  `promo_ends_at` on the org (phase-1 end date), synced via webhook.
  - **Notification (required):** while on promo, show an **advance** banner on the
    dashboard/billing — *"Your promotional price ends on {promo_ends_at}. You'll move to
    the Base plan at $49/month."* — with the **exact date**, in EN **and** ES (M13
    catalog).
  - The app must **recognize** promo state (phase 1 / `promo_ends_at` in the future) vs
    post-promo (moved to Base). Stripe's schedule is the source of truth (synced via
    webhook); `promo_ends_at` drives the banner.

**Done when:** an owner can subscribe to Base/Pro/Enterprise via Checkout at the correct
price; the stored `plan` + capabilities update from the webhook; a promo customer sees
the dated "promo ending" notice in advance and is **automatically** moved to $49 Base at
the 3-month mark with no manual step; `ROADMAP §1` updated to $49. (Schedule as a
milestone; extends/supersedes the old single-price M8 — add to the ROADMAP build order.)

### N3 — Spanish toggle shrinks the mobile screen width

**Symptom.** On mobile, switching the language to Spanish **narrows the screen** — the
layout stops fitting and the browser appears to shrink/zoom out. It should reformat to
fit all elements regardless of language.

**Root cause (high confidence).** Spanish strings are **longer** than their English
equivalents; a row/element that doesn't wrap (or has a fixed width / `whitespace-nowrap`)
then **exceeds the viewport**, forcing horizontal overflow — and the mobile browser zooms
out to fit, which reads as "the screen got narrower." Likely culprits: the dashboard
**nav tab row** (`Active / Archived / Team / Billing / Admin`, `flex items-center gap-2`),
the **status control buttons** and **status pills**, the **critical-path headline**, and
the header (R4). None currently guard against long-label overflow.

**Fix.** Audit every horizontal flex row for overflow in **ES at 360 px** and make them
width-robust: allow `flex-wrap` (or intended horizontal scroll), add `min-w-0`/`truncate`
where labels can grow, drop fixed widths and `whitespace-nowrap` on growable text, and
shorten over-long ES catalog strings where wrapping isn't acceptable. Add a **root
`overflow-x-hidden` backstop** only as a safety net — **not** a substitute for fixing the
offending element. (General-language version of R4, which fixes the header specifically.)

**Done when:** at **320–414 px** width, no page overflows horizontally or changes
effective zoom when switching EN⇄ES; every control and label stays fully visible and
tappable in both languages. Verify at a fixed mobile width in both languages.

---

## PHASE 1 — Feature milestones (after Phase 0 is validated)

> Build order: **M-VIS → M-DASH → M13 → M17 → M18 → M22 → M-EXPORT.** M-VIS is the
> spine; M-DASH depends on it. M22 (Pro) and M-EXPORT are later — scaffold gates if
> cheap, but pause before the heavy build.

### M-VIS — Company-wide read-only job visibility (Base; all tiers)

**Decision (confirmed by owner — this is now the standing architecture for all
future companies).** Every member (owner **and** every salesman) gets **READ-ONLY**
access to **all** jobs in their org. Each member still **creates and edits only
their own** jobs; the owner edits all. This **supersedes** the "own-jobs-only
default" in `ROADMAP §3` and resolves the open question in `AGENTS.md §9` — update
both to record company-wide read-only visibility as policy.

**This is NOT a one-line RLS change** (ROADMAP overstated it). The current `jobs`,
`phases`, and `participants` policies are `for all` — read and write fused — keyed
to owner-or-owns (`lib/.../20260624130000_multi_seat_rls_security_definer.sql`).
You must **split read from write**:
- **jobs:** add a `SELECT` policy `using ( public.is_org_member(org_id) )`. Keep
  writes restricted: `is_org_owner(org_id)` OR `owns_member(salesman_member_id)`.
  (Policies OR within a command, so a salesman gets SELECT on all org jobs via the
  new policy and INSERT/UPDATE/DELETE only on their own via the existing policy.)
- **phases:** add a read helper (org member of the phase's job's org) and a `SELECT`
  policy using it; keep write via the existing `can_access_job` (owner or owns).
  Do **not** leave phases on a single `for all` policy.
- **participants:** **security decision — keep restricted.** A crew row holds a
  secret `invite_token` (a credential). Do **NOT** expose other salesmen's
  participant rows/tokens org-wide. Keep `participants` SELECT to owner + owning
  salesman. The read-only in-depth view (M-DASH) shows phase **assignee names**
  (resolve names server-side) but never another salesman's invite links or crew
  management. State this invariant in the migration comment.

**Tasks:** write the migration → owner applies it manually → add an RLS smoke test
in `supabase/tests/` covering: salesman A **can** SELECT salesman B's job+phases;
A **cannot** UPDATE B's phase; A **cannot** read B's participant tokens; owner can
do all. Then the app-layer changes (M-DASH).

**Done when:** a salesman sees every org job read-only, cannot edit others', cannot
see others' crew links; owner behavior unchanged; RLS smoke passes; FIX-1 realtime
re-verified for the salesman now receiving org-wide rows.

---

### M-DASH — Dashboard restructure, owner **and** salesman (Base)

Rolls up the JOBS SUMMARY, JOBS PLACEMENT, and JOBS VISIBILITY layout feedback.
After M-VIS the owner and salesman dashboards are **symmetric** — generalize the
partition logic in `app/dashboard/page.tsx` (today it gates the roll-up on
`isOwner` and sets `ownJobs = jobs` for salesmen) so **both** roles partition jobs
into "mine" vs "everyone else's by member."

**Layout, top → bottom:**
1. **Header** — name, counts, Active/Archived tabs, and Team/Billing/Admin links
   as applicable to the role.
2. **My jobs** — the viewer's own jobs, **editable**. Change from the current
   vertical full-detail cards to a **horizontal left-right scrollable shelf** using
   the same snap-scroll pattern as today's read-only roll-up, with the full
   in-depth content (phases + statuses + headline). Each card clicks into the
   **editable** `/jobs/[id]`. *(Owner feedback: bring the detailed phase/status
   design currently used in the read-only roll-up to the salesman's own editable
   jobs too.)*
3. **New job** form — **move it from the page bottom to directly under "My jobs."**
   Today it's the last `<section>` so it gets pushed down by the team shelves; it
   must sit right beneath the viewer's own jobs and not be displaced when many jobs
   or salesmen are listed. (Resolves `notes/Coordination-Board-Improvements.txt`.)
   Keep create → auto-creates default phases.
4. **Team jobs** (read-only) — one horizontal shelf **per other member** (by
   display name + job count), each card **"at a glance" only**: **job name**, then
   one line of **customer name · address** (each optional, left→right), then the
   **headline pill only** beneath. **Remove the full phase list from these compact
   cards** — today `summary()` renders the whole `<ul>` of phases for both own and
   roll-up cards; the roll-up cards must be compacted to name/customer/address +
   headline to save screen space. Each compact card clicks into a **read-only
   in-depth view**.

**Read-only in-depth view.** Clicking a team card opens the **same in-depth layout
as the editable board** (phases, statuses, headline, blocked reasons, and notes per
M17) but with **no write controls** — no status buttons, no "Edit phases," no crew
management, no archive. Implement by having `/jobs/[id]` resolve
`getSessionContext()` (it currently uses only `requireUser()`), compute
`canEdit = isOwner || job.salesman_member_id === member.id`, and render the editable
`Board` vs a read-only presentational variant — **reuse one presentational
component** for both so they can't drift. Must live-refresh (FIX-1).

**Done when:** owner and salesman both see My jobs (editable, horizontal,
click→edit) + New job directly beneath + Team jobs (read-only compact shelves,
click→read-only detail); compact cards show only name/customer/address/headline;
no layout pushes New job to the bottom; verified one-handed on mobile.

---

### M13 — Spanish / English UI (Base; all tiers)

Native EN/ES toggle **plus** auto-detect from the device/browser
(`navigator.language` / `Accept-Language`); a manual override **persists** (member
preference column or cookie — not `localStorage`). **Display only — must not change
any app behavior or logic.**

Translate **all** user-facing text app-wide, leaving no hardcoded English:
- cards, buttons, tabs, empty states, form labels/placeholders;
- statuses (`lib/status.ts` `STATUS_LABEL`);
- **critical-path headlines** (`lib/critical-path.ts` — currently English strings
  with emojis; **separate the string templating from the computation** so both
  languages share identical logic);
- login/auth error strings, billing/admin copy;
- the **emails** (`lib/invites.ts` sign-in + invite HTML).

Centralize strings in a dictionary / message catalog. Add a check (lint/test or a
script) that flags untranslated user-facing strings.

**Done when:** switching language — or a device set to Spanish — renders the entire
UI (including dynamically built headlines and emails) in Spanish with identical
functionality and no untranslated strings.

---

### M17 — Phase notes (Base; all tiers)

Per-phase notes with the schema below and a strict visibility matrix. **Not chat:
no threaded replies, no @mentions** (AGENTS.md §7).

**Schema (`notes`):** `note_id uuid pk default gen_random_uuid()` · `phase_id`
(→ `phases`, with `job_id` for convenient scoping/queries) · **two-sided author**
— exactly one of `author_member_id` (→ `org_members`) or `author_participant_id`
(→ `participants`) · `body text` (long-form / URLs / markdown) · `created_at`,
`updated_at timestamptz`. Index by phase.

**Visibility / permission matrix (the crux — implement exactly):**
- **Crew participant:** READ + EDIT only the notes **they** authored, on phases
  **assigned to them**; READ (not edit) notes authored by members (salesman/owner)
  on those same assigned phases. No visibility into phases not assigned to them.
- **Salesman / Owner:** READ all notes on jobs they can see (owner = all org;
  salesman = all org read, per M-VIS). EDIT only **their own** notes. READ (not
  edit) crew notes. On another salesman's job (read-only), you may READ notes but
  still edit only your own.
- **No one edits another person's notes** — enforce for member notes via RLS
  (split read vs edit like M-VIS), and for crew notes via the existing
  token-scoped server-action path (validate token → participant → assigned phase).

**UI.** Notes live inside the phase row / phase detail — in the editable `Board`,
the **read-only in-depth view** (M-DASH), and the participant board (assigned
phases only). Small add/edit affordance; show author name + relative timestamp.
Keep the board headline uncluttered (glance test) — notes are in phase detail, not
the headline.

**Done when:** each role sees exactly the notes the matrix allows and edits only
their own; crew limited to assigned phases; create/edit timestamped (feeds M18).

---

### M18 — Timestamps & activity logging (Base; all tiers)

Log create / update / delete on **notes** and on **phase** changes (status, label,
assignment), each with **actor + timestamp**. `created_at`/`updated_at` on notes
(M17) plus an `activity_log` (or `phase_events`) table for phase changes; derive
**blocker duration** ("how long blocked") from it. Actor is the same two-sided
identity as notes (member or participant).

**Surface (Leo flagged this as needing design — propose, then pause for his pick).**
Show logs/timestamps **without colliding with cards** and **minimally
distracting** — e.g. a collapsible **"History"** disclosure inside the phase
detail / read-only detail, and inline relative timestamps (e.g. "Blocked 3d"). **Do
not** add a noisy global activity feed. Bring 1–2 concrete options to the owner
before the heavy UI build. Pick one mechanism for `updated_at` maintenance (DB
trigger or app-layer) and use it consistently.

**Done when:** every note and phase change is timestamped and attributed; blocker
duration is derivable and shown minimally; no UI collision; glance test holds.

---

### M22 — Photo uploads (Base + Pro — the storage cap is the tier)

> ✅ **SHIPPED 2026-06-30.** The original "Pro + Enterprise ONLY" framing in this
> section is **SUPERSEDED** (owner-confirmed): photos are a **Base + Pro** feature
> gated by a **storage cap** (Base 10 GB, Pro 100 GB), not a hard Pro gate. Trinity
> is on Base (no grandfather). Authoritative record: `AGENTS.md` §9 +
> `docs/ROADMAP-AND-PRICING.md`. The detail below is kept for history.

> Leo: "critical for me to sell the Pro plan." Build at this milestone; **pause
> before the heavy R2 work.**

Status-evidence photos on **Blocked / Done / In-progress** transitions, via
**Cloudflare R2** (≈$0.015/GB, **$0 egress**) + **client-side compression**
(resize ~1600px, JPEG ~70%) + thumbnails + a **per-org storage cap**. This is
status evidence — **not** document management, **not** invoicing (AGENTS.md §7).
Metadata follows the M18 schema (`uploaded_by` member/participant, `created_at`,
`phase_id`).

**Tier gate (hard):** Pro ($99) + Enterprise ($299) only. Base sees **no** upload
UI and **no** upload endpoints, **unless** an org-level capability override is set
(Leo grandfathers Trinity per ROADMAP §1). Implement via the **capability flag**
from §0 — never a hardcoded company name. **Never** use Supabase Storage or
self-hosted storage for media (ROADMAP §1 cost model).

**Done when:** a Pro/Enterprise (or overridden) org can attach a compressed photo
to a status change; Base cannot (UI and API both gated); storage capped; metadata
logged; R2 is the store.

---

### M-EXPORT — Owner data export (Base; all tiers) — NEW milestone

> Later milestone — add it to `docs/ROADMAP-AND-PRICING.md` build order and to
> memory; **don't build until scheduled.**

Business owners (email on the Owner List) can export their org's data. **Owner-only**
— salesmen never see it (gate like `/billing`).

**Placement.** Leo specified "the admin portal of the owner's account, under the
Manage Subscription card." The owner's subscription management is the **`/billing`
page** (the "Manage billing" / subscription section), **not** the operator
`/admin` portal. Put the Export control on **`/billing`** beneath the subscription
card. *(If Leo meant the operator `/admin` portal instead, confirm before building
— flag this.)*

**Scope.** Export jobs + phases (+ notes + activity log) for the org. **CSV first**
(owners open it in Excel); JSON optional. Server action, **owner-gated**, streamed
so large orgs don't time out. No data beyond what the owner already owns.

**Done when:** an owner clicks Export on `/billing` and downloads their org's data;
a salesman has no access; large orgs export without timing out.

---

### M-MULTI — Multiple crew (subcontractors) per phase (Base; all tiers) — Round 4, 2026-07-07

> **Current active work order** (see "Where to start"). Customer ask: assign **more
> than one** crew member (subcontractor) to a single phase, or to any number of
> phases. Each co-assignee has the **identical** read/write permissions a single
> assignee has today. Still one status per phase — this stays inside §7 (no per-person
> task tracking). Schedule as **M24** in the roadmap.

**Confirmed design decisions (Leo, 2026-07-07):**
- **Status = shared, last-writer-wins.** One status per phase; **any** assignee may set
  In progress / Blocked / Done; last write wins. **No** per-assignee status, **no**
  roll-up. The critical-path headline and the 3-second glance are unchanged. The M18
  activity log attributes who changed it (so a premature "Done" is visible/reversible).
- **Cap n = 10 per phase, configurable per org** (org-level default 10; raiseable
  without a code change).
- **Co-assignee notes = read shared, edit own.** Crew assigned to the same phase READ
  each other's crew notes (plus member notes) on that phase; EDIT only their own (the
  M17 "no one edits another's note" rule holds).

**Data model — junction table replacing the single FK.**
```sql
create table phase_assignees (
  phase_id       uuid not null references phases(id)       on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  job_id         uuid not null references jobs(id)         on delete cascade, -- denormalized for RLS/realtime scope (as notes does)
  created_at     timestamptz not null default now(),
  primary key (phase_id, participant_id)
);
-- indexes on (participant_id) and (job_id); (phase_id) covered by the PK.
```
Reject an array column (`uuid[]`): no FK integrity, awkward RLS, doesn't extend. The
old `phases.assignee_participant_id` becomes redundant — **do not read it after the
switch**; drop it in a cleanup migration once validated.

**Migration — two-phase, reversible (owner applies each manually).**
1. **Additive migration:** create `phase_assignees` + RLS + realtime + cap trigger;
   **backfill** one row per phase whose `assignee_participant_id` is non-null. **Keep**
   the old column for now (rollback safety).
2. Switch **all** app code (reads + writes) to the junction (file list below).
3. **Cleanup migration (after validation):** `grep` the repo to confirm **zero**
   remaining `assignee_participant_id` references, then drop the column.

**RLS (deny-by-default; read vs write split — §5 / M-VIS).**
- SELECT: any org member reads assignments on org jobs — `using (public.can_read_job(job_id))`.
- INSERT/UPDATE/DELETE: only a member who can **edit** the job —
  `using / with check (public.can_access_job(job_id))`. **Crew never self-assign** —
  assignment is a member action. Grants: select/insert/update/delete to `authenticated`;
  all to `service_role` (crew read path); `anon` nothing.

**Cap enforcement (n ≤ 10, configurable).**
- Store the cap as an org config: `organizations.max_assignees_per_phase int not null
  default 10` (consistent with the §0 capability/config model).
- Enforce in **two** places: the member assign server action (count existing assignees
  for the phase; reject over cap with a clear i18n message) **and** a **DB trigger
  backstop** on `phase_assignees` insert that raises if the phase's assignee count would
  exceed that org's cap. Belt-and-suspenders — the constraint can't be bypassed.

**Realtime (FIX-1 carry-forward + the R1 lesson — do not skip).**
- Assign = **INSERT**, unassign = **DELETE** on `phase_assignees`. The DELETE must
  live-refresh under filter/RLS — the **exact R1 failure mode** — so set the table
  **`REPLICA IDENTITY FULL`** and add it to the `supabase_realtime` publication.
- Add `phase_assignees` to the `/jobs/[id]` board's `RealtimeRefresh` `tables` (currently
  `["phases","notes"]`).
- The member assign/unassign action must call `broadcastJobChange(jobId)` (as
  `assignPhase` does today) so crew boards live-update: a newly-assigned crew member's
  board shows the phase **appear**; an unassigned one sees it **disappear**.

**App-layer changes (switch to the junction). Files (verified references):**
- `supabase/migrations/*` — the two migrations above.
- `lib/types.ts` — drop `Phase.assignee_participant_id` (after cleanup); add a
  `PhaseAssignee` type; the board/notes now carry a **list** of assignees per phase.
- `app/jobs/[id]/page.tsx` — load `phase_assignees` for the job and pass the assigned
  participant-id set per phase to `Board`; resolve co-assignee **names** for display
  (read-only viewers still get names only, no controls — M-DASH).
- `app/jobs/[id]/Board.tsx` — replace the single `<select>` "Assign to" with a
  **mobile-friendly multi-select** (checkbox list / chip toggles) over the job's crew;
  toggling adds/removes a junction row. Show **all** assigned crew names on the phase.
  Disable adding past the cap with a hint. Read-only mode unchanged (no controls).
- `app/jobs/[id]/actions.ts` — replace `assignPhase` (single FK set) with
  `assignParticipant` / `unassignParticipant` (or one idempotent toggle) that add/remove
  a junction row; enforce the cap; call `revalidateJob` (which broadcasts).
- `app/j/[jobId]/page.tsx` — "phases assigned to me" changes from
  `assignee_participant_id = me` to `phase_id IN (select phase_id from phase_assignees
  where participant_id = me)`. Crew board still shows only their phases.
- `app/j/[jobId]/actions.ts` — in `updateAssignedPhase`, `addCrewNote`, `editCrewNote`,
  `deleteCrewNote`, replace the `phase.assignee_participant_id === participant.id` guard
  with "**EXISTS** a `phase_assignees` row for (phaseId, participant.id)". Shared
  last-writer-wins means the status write itself is otherwise unchanged.
- `app/j/[jobId]/ParticipantBoard.tsx` — verify it renders passed-in phases unchanged
  (likely no logic change; confirm).
- `lib/notes.ts` — **co-assignee read expansion (agreed):** in `notesForParticipant`,
  on a phase the participant is assigned to, also return **other co-assignees' crew
  notes** (read-only; `canEdit` stays true only for the viewer's own). Scope strictly to
  assigned phases. Crew note **edit/delete** guards remain author-only.
- `lib/export.ts` — the data export currently emits a single assignee per phase; emit
  **all** assignees (list/joined names) so exports stay correct.
- `docs/ROADMAP-AND-PRICING.md` — add **M-MULTI (M24)** to the build order (Base).
- `AGENTS.md §9` — record the decision (multi-assignee per phase; shared
  last-writer-wins; cap 10 configurable; co-assignee read-shared/edit-own notes), noting
  it stays within §7 (one status per phase; no per-person task tracking).

**Smoke + regression (hard requirement — verify no regression of prior features).**
- New `supabase/tests` RLS smoke for `phase_assignees`: a member reads org assignments;
  a salesman can't write assignments on another member's job (unless owner); crew can't
  self-assign; the **cap trigger rejects the 11th** assignee.
- Regress the whole board on a real second device: single-assignee still behaves as
  before (one junction row); one crew member across multiple phases; **two crew on one
  phase** — both can flip status (last-writer-wins) and both add notes and **see each
  other's** notes; unassigning one **live-drops** the phase from their board (R1 DELETE
  case); critical-path headline unchanged; M-DASH read-only view shows multiple
  assignees and no controls; the full M17 member/crew note matrix intact.
- Live-refresh checks (second device): assign → phase appears on the new crew's board;
  unassign → disappears; status change by any co-assignee → all boards + owner dashboard
  update; note add/edit/delete by co-assignees. Run `docs/RELEASE-CHECKLIST.md`.

**Done when:** an owner/salesman can assign up to the cap (default 10) crew to any
phase; every assignee has identical read/write (status + own notes) to a single assignee
today; any assignee's status change and any co-assignee's notes appear live on all
relevant boards + the owner dashboard on a second device; unassigning removes the phase
from that crew's board live; the cap is enforced in UI **and** DB; single-assignee and
all prior features regress clean; smoke tests pass.

---

## Cross-cutting requirements (every milestone)

- **i18n carry-forward:** any **new** user-facing string (notes, logs, export,
  photo UI, read-only view) goes through the M13 catalog. If a milestone lands
  before M13, keep its strings centralized and ready — don't reintroduce hardcoded
  English afterward.
- **Realtime carry-forward:** any new page/action showing shared state wires FIX-1
  live refresh and is regression-checked on a second device.
- **Security:** service-role server-only; participants never become auth users;
  **read vs write always separate** in RLS; deny-by-default (AGENTS.md §5).
- **Docs sync:** at each milestone update `AGENTS.md §9` + `docs/ROADMAP-AND-PRICING.md`
  (and `README.md` milestone line) to match what shipped and any scope/tier change.
- **Migration cadence:** migration → **owner applies manually in Supabase** → app
  code → regression → owner validates (ROADMAP §3, RELEASE-CHECKLIST).
- **Regression:** test against **all** prior features, not in isolation; run
  `docs/RELEASE-CHECKLIST.md`.
- **No commit/push/deploy without explicit go-ahead.**

## Anti-scope (still banned — AGENTS.md §7)

Gantt / scheduling / calendar · invoicing / estimating · a full roles **matrix**
(owner/salesman split only) · client portal · dependency-graph editor (linear
`sequence_index` only) · **threaded chat** (notes are not chat) · arbitrary
document libraries (Enterprise-only) · video (Enterprise-only). Every new idea
faces the three-second glance test; if unsure something is in scope, **ask before
building.**

## Sequencing summary

1. **Phase 0:** FIX-1 (live refresh) → FIX-2 (login). Diagnose, fix, validate on a
   real device with Outlook.
2. **Phase 0.5 (M17 regression):** R1 (note-delete refresh → `notes` REPLICA
   IDENTITY FULL) + R2 (owner read-only on salesmen's jobs — confirm with Leo)
   before resuming Phase 1; R4 (header truncation) any time; R3 (job delete) is
   scheduled as **M10**.
3. **Phase 0.6 (Round 3):** N1 (system-browser sign-in persistence + Team
   invite-accept live refresh), N2 (Stripe Base/Pro/Enterprise + promo→Base $49
   auto-transition with dated notice), N3 (Spanish mobile layout overflow).
4. **M-MULTI (Round 4 — current):** multiple crew per phase (junction table, shared
   last-writer-wins status, cap 10 configurable, co-assignee read-shared/edit-own
   notes, REPLICA IDENTITY FULL for un-assign live-refresh).
5. **Phase 1:** M-VIS → M-DASH → M13 (i18n) → M17 (notes) → M18 (logging) → M22
   (photos, Pro) → M-EXPORT. Each: migration (if any → manual apply) → code →
   regression → owner validates → update docs → pause.
