# Handoff Brief — Cancel-retention cron (owner to-do) + M21 Preferred Payment Method

> For a fresh Claude Code session. Self-contained, but the governing docs still win.
> **Order of work:** (1) the cancel-retention **cron** follow-up — starts with an
> **owner to-do** (generate + store `CRON_SECRET`); (2) the next milestone, **M21
> preferred payment method.** `AGENTS.md` is binding and **wins on any conflict —
> stop and flag.**

## 0. Read first (in order)
1. `AGENTS.md` — the constitution (binding). Pay attention to **§5** (security/RLS:
   service-role server-only, participants never become auth users, read vs write are
   separate policies, deny-by-default), **§6** (the hardened **live-refresh invariant**
   — every data-bearing surface another session may view MUST live-refresh, verified
   on a 2nd device; + the regression gate against ALL prior features), **§7**
   (anti-scope + the 3-second glance test), **§9** (post-v1 amendments; M21 listed as
   Base: "preferred payment method (crew field) — minor").
2. `docs/ROADMAP-AND-PRICING.md` — tiers + the M21 row.
3. `INSTRUCTIONS.md` §0 (ground rules) + Anti-scope.
4. This file.
5. Auto-memory worth loading: `build-round-2` (sequence + current position),
   `m22-plan`, `pricing-tiers`, `supabase-connector`, `signin-interstitial-required`,
   `live-refresh-invariant`, `regression-test-all-features`.

## 1. Where things stand (2026-06-30) — what we built
- **v1 shipped** (M9 pilot). **Post-v1 all shipped & deployed to prod** (`main` →
  Vercel auto-deploy): **M14** multi-seat orgs, **M-VIS** company-wide read-only
  visibility, **M-DASH** symmetric dashboard, **M13** EN/ES i18n, **M17** phase notes,
  **M18** activity log + blocker pill, **M10** soft-delete/restore/purge, **M22**
  status-evidence photo uploads (Cloudflare R2, Base+Pro storage cap), **M-EXPORT**
  owner data export. `main` HEAD ≈ `8850b0c` (PR #2). **This completes the Round-2
  Phase-1 sequence.**
- **M22 specifics now live:** photos on Blocked/Done/In-progress phases →
  `photos` table (SELECT-only RLS via `can_read_job`, server-only writes, published +
  `REPLICA IDENTITY FULL`); `lib/r2.ts` (server-only S3 client: presign + HEAD-on-
  confirm + `deleteByPrefix`); `lib/capabilities.ts` (Base 10 GB / Pro 100 GB via
  `organizations.plan` + optional `storage_cap_bytes`); `components/PhasePhotos.tsx`
  (camera capture, client compress ~1600px/0.7 + thumb, direct browser→R2 PUT, plain
  `<img>` from the CDN — **never** `next/image`, to keep serving off Vercel).
- **R2 infra is live:** bucket `coordination-board`, custom domain
  `media.coordination.4lfr.com` (Active), CORS allows `coordination.4lfr.com` +
  `localhost:3000`; env vars in `.env.local` + Vercel: `R2_ACCOUNT_ID`,
  `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT`,
  `NEXT_PUBLIC_R2_PUBLIC_BASE`.
- **Supabase connector is connected** (project `coordination-board`, id
  `gfvemminanesyjhcsmua`): apply migrations **directly** — protocol is **test-first**
  (`BEGIN; <migration> <smoke> ROLLBACK;` via `execute_sql`, no raised error = pass,
  verify nothing persisted) **then** `apply_migration`. **Pause for owner go-ahead
  before applying to prod.**
- **Process invariants (binding):** diagnose before rewrite; regression-test against
  ALL prior features (realtime + RLS regress most silently); **never commit/push/
  deploy without explicit owner go-ahead**; pause at each "Done when" for real-device
  validation. **Tier-gate by capability flag, never a hardcoded company name.**
- **Tooling reality:** `gh` CLI is **NOT installed** (Bash or PowerShell). PRs are
  created+merged via the **GitHub REST API** using the cached git credential:
  `token=$(printf "protocol=https\nhost=github.com\n\n" | git credential fill | sed -n 's/^password=//p')`
  then a small node script POSTs `/repos/Leovhernandez/Coordination-Board/pulls` and
  PUTs `/pulls/{n}/merge`. Flow each milestone: branch → commit → `git push -u` →
  PR via API → merge → `git checkout main && git pull --ff-only` → delete branch.
- **Windows gotchas:** `next build` throws a harmless `kill EPERM` at worker teardown
  *after* a successful build — check for `✓ Compiled successfully` + a present
  `.next/BUILD_ID`, not the exit code. **Do NOT run `next build` while `next dev` is
  running** (both lock `.next`; stop dev first — kill the listener on port 3000).
- `<html translate="no">` + `notranslate` is set in `app/layout.tsx` — **do not
  remove**; it stops Chrome auto-translate from corrupting hydration on this bilingual
  app (it stripped classes → header collision + suppressed conditional client UI).

---

## 2. FIRST: Cancel-retention purge — owner to-do, then the build

**Context (owner policy, deferred from M22/M-EXPORT).** On subscription **cancel**, the
org's data + media (R2 photos) are **retained and exportable for 30 days** (via
M-EXPORT on `/billing`), the owner gets an **email notice** stating the export
deadline, and after 30 days the org's R2 objects are **purged**. This needs a
**scheduled job** keyed off the cancel date.

### 2a. ⚙️ OWNER TO-DO — generate + store `CRON_SECRET` (do this first)
The scheduled route must reject anyone but the cron. Vercel Cron automatically sends
`Authorization: Bearer $CRON_SECRET` on each invocation **iff** a `CRON_SECRET` env var
exists; the route verifies that header. You provide the secret:

1. **Generate a long random secret** (any one of these):
   - PowerShell: `[Convert]::ToHexString((1..32 | ForEach-Object {Get-Random -Maximum 256}))`
   - Git Bash: `openssl rand -hex 32`
   - Node: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   → copy the ~64-char hex string.
2. **Store it (server-only — NEVER a `NEXT_PUBLIC_` prefix):**
   - **Vercel** → your project → **Settings → Environment Variables** → add
     `CRON_SECRET` = `<value>` for **Production** (and **Preview** if you want cron on
     previews — usually Production only). Save.
   - **Local** → add `CRON_SECRET=<value>` to `.env.local` (gitignored; keep the
     `KEY=value` form, no spaces around `=`).
   - Optional backup copy in `.claude/secrets/` (that dir is gitignored).
3. **Confirm your Vercel plan supports the schedule.** A **daily** cron is fine on both
   Hobby and Pro (Hobby allows cron but limits frequency/count; daily is within limits).
4. Tell the new session: "`CRON_SECRET` is set in Vercel + `.env.local`." (No need to
   paste the value into chat.)

> "Wiring the cron" itself is **code the session writes**, not a dashboard step: the
> schedule is declared in a committed `vercel.json` (`{"crons":[{"path":
> "/api/cron/purge-canceled","schedule":"0 8 * * *"}]}`), and Vercel runs it
> automatically once deployed. Your only manual part is the secret above + the plan
> check.

### 2b. The build (session does this, with owner go-ahead at the gates)
- **Track the cancel date (migration).** `organizations` has no cancel timestamp today.
  Add `organizations.canceled_at timestamptz` (nullable). Set it in the Stripe webhook
  on `customer.subscription.deleted` (and clear it on re-activation). Test-first via the
  connector, pause for go-ahead, apply.
- **Cancellation email notice.** In `app/api/stripe/webhook/route.ts`, on
  `customer.subscription.deleted`, send a Resend email to `organizations.owner_email`
  stating the **30-day** export deadline + how to export (M-EXPORT on `/billing`). Reuse
  the Resend pattern in `lib/invites.ts` (`RESEND_API_KEY`, `INVITE_FROM_EMAIL`). i18n
  the email (EN/ES) via `lib/i18n`.
- **Scheduled purge route.** `app/api/cron/purge-canceled/route.ts` (GET):
  - Verify `request.headers.get("authorization") === \`Bearer ${process.env.CRON_SECRET}\``
    → else `401`. (Defense-in-depth: also fine to bail if `CRON_SECRET` unset.)
  - Find orgs where `subscription_status='canceled'` AND `canceled_at < now() - interval '30 days'`.
  - For each, **purge R2** via `deleteByPrefix(\`org/<orgId>/\`)` (`lib/r2.ts`) and
    optionally hard-delete the org's rows. **Irreversible — only touch orgs canceled
    > 30 days; never active/trialing/past_due.** Mark them processed (e.g., a
    `media_purged_at` column) so re-runs are idempotent.
  - `vercel.json` cron entry (daily).
- **Constraints:** R2 deletion is irreversible (guard hard on the 30-day + canceled
  check); route is auth'd by `CRON_SECRET`; service-role server-only; never purge a
  non-canceled org. Regression-test billing + webhook.
- This is roughly a small milestone on its own — **flag scope** and confirm with the
  owner whether to also hard-delete DB rows or only free R2.

---

## 3. NEXT MILESTONE — M21: Preferred payment method (Base; all tiers)

**Goal.** Let a **crew member (contractor)** record a **preferred payment method**, but
**only when the owner opts in.** Some companies want this; others don't. So gate it
behind an **owner-side toggle (checkbox), DEFAULT OFF** — "Ask crew for their preferred
payment method." When ON, crew are prompted on their board and the owner/salesman can
see it; when OFF, no prompt and no field anywhere.

This is a **light** field (AGENTS §9). **Not** invoicing, **not** payments processing —
it's a note of how the sub prefers to be paid (e.g. "Zelle 555-1234", "Venmo @joe",
"Check", "Cash"). It must survive the 3-second glance test (§7) — it lives in the
crew/Crew panel detail, never the headline.

### Decided design (owner-confirmed direction 2026-06-30; confirm specifics before building)
- **Owner toggle = org-level, default OFF.** Add
  `organizations.collect_payment_method boolean not null default false`. Only when
  `true` does the crew prompt + the owner-side display appear.
- **The field lives on `participants`** (the per-job-link crew row), e.g.
  `participants.preferred_payment text` (nullable). **Important scope note:**
  participants are **per-job link rows** — the same sub gets a *new* participant row per
  job, so the payment method is **per job/link** (a sub re-enters it per job) unless a
  cross-job "crew directory" is introduced, which is **out of scope** (§7). Flag this to
  the owner; per-participant is the scoped choice. (If they want enum vs free-text,
  confirm; default = free-text single field for flexibility, or a small select
  [Zelle/Venmo/CashApp/Check/Cash/Other] + a detail field. Recommend: a `payment_type`
  select + `payment_detail` text, or just one free-text field — confirm.)

### Build outline
- **Migration** (`supabase/migrations/<ts>_m21_payment_method.sql`): add
  `organizations.collect_payment_method` (default false) + `participants.preferred_payment`
  (and/or `payment_type`). **Realtime:** see live-refresh note below — likely **publish
  `participants`** (+ `REPLICA IDENTITY FULL`). Test-first via connector → pause → apply.
- **Types:** `lib/types.ts` — `Organization.collect_payment_method`;
  `Participant.preferred_payment`. **`lib/membership.ts` `ORG_COLUMNS`** — add
  `collect_payment_method` so `ctx.org` carries it.
- **Owner toggle action + UI:** an owner-only server action (e.g.
  `app/dashboard/actions.ts` `setCollectPaymentMethod(boolean)` or in
  `app/dashboard/team/actions.ts`) gated to `ctx.isOwner`; render a checkbox somewhere
  owner-only (Team page `app/dashboard/team/page.tsx` is a natural home, or a small
  settings block on the dashboard — **confirm placement with owner**; default no
  settings page exists).
- **Crew side (only when `org.collect_payment_method`):** a small field on
  `app/j/[jobId]/ParticipantBoard.tsx` to enter/edit the sub's preferred payment; write
  via a **token-scoped** server action in `app/j/[jobId]/actions.ts` (validate token →
  participant → write **only their own** participant row), mirroring
  `updateAssignedPhase` / `addCrewNote`. Pass `collectPaymentMethod` from
  `app/j/[jobId]/page.tsx` (load the org flag).
- **Owner/salesman view (only when toggle on):** show each participant's
  `preferred_payment` in the Crew panel `app/jobs/[id]/Crew.tsx` (rendered when
  `canEdit`); pass the org flag from `app/jobs/[id]/page.tsx`.
- **i18n:** EN + ES strings in `lib/i18n/dictionaries.ts` (`es: Dict` → a missing ES key
  fails `tsc`).
- **Docs:** update `AGENTS.md` §9 (M21 shipped), `docs/ROADMAP-AND-PRICING.md` (M21 row),
  `README.md` milestone line.

### ⚠️ Live-refresh (§6 — binding)
The preferred-payment value appears on the **owner/salesman Crew panel**, a surface a
2nd session may be watching → it **MUST live-refresh** with no reload, verified on a 2nd
device. `participants` is **NOT** in the `supabase_realtime` publication today (current:
`jobs, phases, notes, activity_log, org_members, photos`). Options:
1. **Publish `participants`** (+ `REPLICA IDENTITY FULL`) and add `"participants"` to the
   `RealtimeRefresh tables` on `app/jobs/[id]/page.tsx`. `postgres_changes` is RLS-
   filtered, and participants RLS is restricted to owner/owning-salesman, so no token
   leaks — safe. (The row carries the secret `invite_token`, but `postgres_changes` only
   delivers to subscribers who can already SELECT it.)
2. Or rely on the crew action's `broadcastJobChange` + mount `BroadcastRefresh` on the
   owner board. Prefer option 1 (consistent with notes/photos) unless there's a reason
   not to publish participants.

## 4. Constraints (binding, both tasks)
- **§5 security:** crew writes go **token → participant → own row** via a service-role
  server action (crew are never auth users); the `invite_token` is a secret and is never
  exposed; `participants` SELECT stays restricted to owner + owning salesman (do **not**
  widen it org-wide). Service-role key stays server-only. RLS read vs write are separate.
- **§6 live-refresh + regression:** see above; re-verify ALL prior features (realtime,
  sign-in interstitial, RLS read/write + tenant isolation, critical-path headline,
  photos, export) — not in isolation. The sign-in interstitial (`/auth/confirm` GET→POST)
  is load-bearing; don't touch it.
- **§7 glance test:** payment method is a small detail field, never the headline; the
  board still reads one-handed in 3 seconds.
- **Default OFF:** `collect_payment_method` defaults `false`; no prompt/field unless the
  owner opts in. Tier = **Base** (all tiers).
- **Migration cadence:** test-first `BEGIN…ROLLBACK` via the connector → **pause for
  owner go-ahead** → `apply_migration` → app code → regression → owner validates.
- **No commit/push/deploy without explicit owner go-ahead.** Pause at "Done when" for
  real-device validation. PRs via the GitHub API (gh not installed).

## 5. Verification gates (all must pass before commit)
```
npx tsc --noEmit
npm run lint
npx tsx scripts/test-headline.mts      # 6/6 PASS
npm run build                          # ✓ Compiled successfully + .next/BUILD_ID present
                                       # (ignore the Windows "kill EPERM" teardown line)
```
Plus, if RLS/schema changes: the RLS pre-flight smoke wrapped in `BEGIN…ROLLBACK` via the
Supabase connector; and **real-device 2nd-session live-refresh validation**.

## 6. Key file paths
**M21 — build new / instrument**
- `supabase/migrations/<ts>_m21_payment_method.sql` (+ `supabase/tests/` smoke if RLS changes)
- `lib/types.ts` (Organization.collect_payment_method; Participant.preferred_payment)
- `lib/membership.ts` (`ORG_COLUMNS` += collect_payment_method)
- `app/dashboard/actions.ts` or `app/dashboard/team/actions.ts` (owner toggle action)
- `app/dashboard/team/page.tsx` or `app/dashboard/page.tsx` (owner checkbox UI)
- `app/j/[jobId]/actions.ts` (token-scoped crew write), `app/j/[jobId]/page.tsx` (load org flag),
  `app/j/[jobId]/ParticipantBoard.tsx` (crew field)
- `app/jobs/[id]/page.tsx` (pass org flag + add `"participants"` to RealtimeRefresh),
  `app/jobs/[id]/Crew.tsx` (owner-side display)
- `lib/i18n/dictionaries.ts` (EN+ES)

**Cancel-retention cron — build new / instrument**
- `supabase/migrations/<ts>_cancel_retention.sql` (organizations.canceled_at [+ media_purged_at])
- `app/api/stripe/webhook/route.ts` (set canceled_at + send Resend notice), `lib/stripe.ts`, `lib/invites.ts` (Resend pattern)
- `app/api/cron/purge-canceled/route.ts` (CRON_SECRET-gated; `deleteByPrefix` from `lib/r2.ts`)
- `vercel.json` (crons entry)

**Patterns to mirror** — `lib/notes.ts` / `lib/photos.ts` (loaders), `app/j/[jobId]/actions.ts`
(`updateAssignedPhase`/`addCrewNote` token-scoped writes), `components/PhaseNotes.tsx` /
`components/PhasePhotos.tsx` (compact field, `useT()`/`useLang()`), `components/RealtimeRefresh.tsx`
(one channel per table), `lib/realtime.ts` (`broadcastJobChange`), `lib/supabase/service.ts`
(`server-only`), `lib/membership.ts` (`getSessionContext`), `lib/participant.ts`
(`getParticipantByToken`, `participantCookieName`).

## 7. Gotchas / lessons (carry-forward)
- **gh not installed** → PR create+merge via GitHub API + cached git credential.
- **Windows:** `next build` EPERM teardown is harmless (check `✓ Compiled` + BUILD_ID);
  don't build while `next dev` runs (stop the port-3000 listener first).
- **`.env.local`:** `KEY=value`, no spaces; R2 + Supabase vars present; gitignored.
- **`es: Dict`** in `dictionaries.ts` → a missing ES key fails `tsc`.
- **`translate="no"`** on `<html>` is load-bearing (Chrome-translate hydration fix) — keep it.
- **Migrations via the Supabase connector** (`gfvemminanesyjhcsmua`), test-first in
  `BEGIN…ROLLBACK`, then `apply_migration`; apply before deploying code that reads new columns.
- **Participants are per-job link rows** (no cross-job crew identity) — payment method is
  per participant/job; a crew directory is out of scope (§7).
- **Local mobile testing is impractical** (magic-link points to `localhost`; R2 CORS
  excludes the LAN IP) — validate real-device on **prod**, or via DevTools device mode
  for layout only.
