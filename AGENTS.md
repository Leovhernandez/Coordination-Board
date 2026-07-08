# Coordination Board — Constitution (binding guardrails)

> Imported by `CLAUDE.md` (`@AGENTS.md`). This file holds the **durable rules**;
> `BUILD-PROMPT.md` drove the original v1 build. Where the two ever disagree,
> this file wins. **Reconstructed 2026-06-22** from `BUILD-PROMPT.md` after the
> original `@AGENTS.md` import was found missing — the section numbers (§4/§5/§7/§8)
> match the references already used throughout `BUILD-PROMPT.md`.

## §1 — Mission
A single shared, per-job status board where each trade taps **Done / In progress /
Blocked (waiting on ___)**, and the GC/owner sees at a glance **the one thing
blocking the next phase.** Mobile-first, one-handed, bad-signal, zero-friction.

## §2 — The one feature that must be excellent
**Critical-path surfacing.** The dashboard computes and prominently shows the one
sentence the GC needs — *"next phase X can't start because Y is blocked, waiting
on Z"* — not a list of statuses. This is the whole reason we beat horizontal PM
tools. It is the centerpiece, never a footnote. Algorithm lives in
`lib/critical-path.ts`; tested by `scripts/test-headline.mts`.

## §3 — Stack (confirmed — do not substitute)
Next.js **15** (App Router) + TypeScript · Tailwind · Supabase (Postgres + Auth +
Realtime + Storage) · Stripe Checkout · deploy on Vercel · single domain · PWA.
Verify current Supabase/Next.js APIs against today's docs before depending on
them — do not hardcode from memory.

## §4 — Scope discipline
Build exactly what a milestone needs; **no tables, abstractions, or features "for
later."** If something seems missing, **ask before adding.** Each milestone ends
as a working, deployed, live URL. Keep PRs/commits scoped to one milestone.

## §5 — Security & auth invariants (non-negotiable)
- **The service-role key never reaches the client.** It is used exclusively
  through `lib/supabase/service.ts`, guarded by a `server-only` import.
- **Owner** (Supabase-authed) can do everything within **their own org**, enforced
  by RLS. (Post-v1: "own org" now means *org they are a member of* — see §9.)
- **Participants are not Supabase users.** Their reads/writes go through Next.js
  server actions that (1) read the httpOnly token cookie, (2) validate it against
  a non-revoked `participants` row, (3) use the service-role client **server-side
  only**. A participant token may read its job's board and update only phases where
  `assignee_participant_id` = that participant. It can touch no other job, ever.
- RLS is deny-by-default; `anon` is granted nothing.

## §6 — Working style
Mobile-first always (contractor, one hand, bad signal). Pause at each milestone's
"Done when" for real-device validation. Never commit, push, or deploy without
explicit go-ahead. The autonomous loop pauses before starting a new milestone and
whenever manual action is required from the owner.

**Regression is a hard gate, not a courtesy (binding).** No addition or fix ships
until it has been re-verified against **ALL** previously-working features — never
in isolation — per `docs/RELEASE-CHECKLIST.md` Step 4. An update that breaks a
working feature is a failed change, full stop; revert or fix before proceeding.
The subsystems that regress **silently** must be re-checked on **every** change:
- **Realtime live-refresh** (FIX-1 — one channel per table; verify owner *and*
  salesman dashboards + the participant board still refresh; a table missing from
  the `supabase_realtime` publication must not kill the others).
- **Sign-in** (FIX-2 — the GET interstitial → POST `verifyOtp`; verify it survives
  an Outlook/Safe-Links prefetch, works **cross-device / different browser**, and
  the salesman-invite link + PKCE fallback still work).
- **RLS read-vs-write + tenant isolation** (a member reads what they should, writes
  only what they own, and never sees another org's data or another salesman's crew
  tokens).
- **Critical-path headline** (§2 — the centerpiece must still compute correctly).

**Live-refresh is a perpetual, affirmative invariant (binding — owner-mandated).**
The board's entire value is that whoever is watching sees a change the instant it
happens, hands-free; a board that can sit stale is useless for coordination.
Therefore **every data-bearing feature — those built today and every one added in the
future, without exception — that appears on a surface another session may be viewing
MUST live-refresh that surface with no manual reload.** "It updates on the next page
load" is a **failed feature**, not an acceptable shortcut — it does not ship. This
binds in perpetuity to all applicable actions: job/phase status, label, assignment,
add, and delete; blocker reason and duration; phase notes; the History / activity
log; the dashboards and owner roll-up; and anything not yet conceived.

A feature is **not "done"** (and a milestone's "Done when" is unmet) until its
live-refresh is **verified on a SECOND device/session** — never the actor's own
screen, whose server-action revalidation hides the gap. Each time you add or change a
data-bearing feature, clear this checklist (every item is a bug that already shipped
once):
  1. The backing table is in the `supabase_realtime` publication, **or** the write
     fires `broadcastJobChange` (anon crew get no RLS-filtered `postgres_changes`, so
     they refresh via the broadcast channel).
  2. **One channel per table** (FIX-1): a table missing from the publication must not
     drop the other tables' channels.
  3. A **DELETE** that must match a `job_id`/RLS filter needs `REPLICA IDENTITY FULL`
     — a default-identity DELETE carries only the PK, so the filter/RLS can't match and
     the event is silently dropped (M17 R1).
  4. The event that DRIVES the refresh must commit **after** the data it must show, or
     **publish the backing table itself** so its own insert/update drives the re-fetch
     (M18: a row co-written a round-trip later is missed by a refresh fired off the
     earlier commit — the activity_log live-refresh race).
  5. Confirm the owner dashboard, the salesman dashboard/roll-up, **and** the
     participant board each refresh for the relevant change.

Schema/RLS and auth changes additionally require the **RLS pre-flight**
(RELEASE-CHECKLIST Step 2) to pass before they reach `main`.

## §7 — Anti-scope

**Still hard-banned (do NOT build):**
- Gantt / scheduling / calendar
- Invoicing / estimating
- A full permissions/roles **matrix** (the limited owner/salesman split in §9 is the
  only role distinction allowed)
- Client portal
- Dependency-graph editor — phase order is the linear `sequence_index` **only**
- Threaded chat / messaging
- Document management (arbitrary file libraries per house) — Enterprise-only, not
  base/pro; see §9
- Video upload — deferred (cost is fine on R2, but jobsite-upload UX/complexity
  isn't validated); Enterprise-only if ever

**The test for anything new:** *does it survive the three-second glance?* If a
change makes the board harder to read one-handed, it does not ship.

## §8 — Definition of Done (v1 acceptance — all held; passed M9 pilot)
1. A real Four L job runs on it in production.
2. The owner sees the single current blocker / next action at the **top** of the
   dashboard without reading a list.
3. A crew member opened a **texted link**, **no signup**, flipped a phase to
   **Blocked** with a reason, and the owner's board updated **live**.
4. **None** of the §7 anti-scope items exist.

## §9 — Post-v1 amendments (deliberate scope changes, recorded for honesty)

v1 shipped and passed the M9 pilot gate. Trinity Floor Co. (first paying customer)
created real, validated pull for the following. These are **intentional**
relaxations of §7, each constrained to stay inside the §7 glance test, and each
gated behind a pricing tier (see `docs/ROADMAP-AND-PRICING.md`).

- **Multi-seat orgs (Base).** One company = one org with one **owner** + multiple
  **salesman/GC** members sharing one crew pool and one subscription. This adds a
  *two-role* distinction (owner vs salesman) — **not** a general permissions matrix.
  Replaces the old one-org-per-user model (§5 "own org" now = org membership).
- **Owner roll-up grid (Base).** A read-only, glanceable grid of each salesman's
  live job headlines. **Not** analytics/charts — relaxes "no multi-job analytics"
  only to a roll-up of the same one-line headlines the dashboard already shows.
  **Write boundary (R2, 2026-06-29):** every member is **read-only on jobs they
  don't own — the owner included.** You edit only the jobs you own (the owner also
  owns legacy null-salesman jobs); everyone reads all org jobs (M-VIS). The roll-up
  and the read-only in-depth view never expose write controls for others' jobs.
- **Phase notes (Base).** Small structured notes per phase (e.g. gate/lockbox
  codes), visible to GC and assigned crew. **Not** chat — no threaded reply UI.
  **Shipped (M17):** two-sided author (member or crew); every member reads all org
  notes but edits only their **own**; crew read member notes + their own, limited
  to their **assigned** phases. Live-refreshes (`notes` published + REPLICA
  IDENTITY FULL so deletes propagate).
- **Activity log + blocker duration (Base).** Timestamped record of status/note
  changes; "how long blocked" derived from it. **Shipped (M18):** append-only
  `activity_log` with a two-sided actor (member or crew); members read org-wide,
  but writes are server-only via the service role (members are SELECT-only — an
  append fails `42501` at the privilege layer). Surfaced as a collapsed-by-default
  per-phase **History** disclosure + a "Blocked Nd" duration pill — no global feed
  (§7); the crew board omits History. Live-refreshes (`activity_log` published so
  the log's own insert drives the refresh, sidestepping a commit-ordering race).
- **Insurance attestation + preferred payment method (Base).** Light crew-side
  fields; attestation stores exact agreed text + identity + timestamp.
  **Preferred payment method shipped (M21):** owner opt-in
  `organizations.collect_payment_method` (default OFF — no prompt/field unless the
  owner turns it on, from the Team page). When ON, crew set a `payment_type`
  (zelle|venmo|check|cash|other, DB-CHECK-constrained) + free-text `payment_detail`
  on `participants` via a token-scoped server action (own row only); the owner /
  owning-salesman see it in the Crew panel. Per job/link row — a cross-job crew
  directory is §7 anti-scope. **Not** invoicing/payments. Live-refreshes
  (`participants` published + REPLICA IDENTITY FULL; RLS `can_access_job` keeps the
  invite_token from leaking via `postgres_changes`).
- **Photo uploads on Blocked/Done/In-progress (Base + Pro).** Status-evidence
  photos **only**, via **Cloudflare R2** (zero egress; served from a CDN custom
  domain, never proxied through Vercel) + client-side compression + thumbnails.
  **Shipped (M22):** a Base+Pro feature gated by a **storage cap** — the cap is the
  upsell, not the feature (Base 10 GB, Pro 100 GB; `organizations.plan` + optional
  `storage_cap_bytes`). Two-sided uploader (member or crew on assigned phases);
  writes are server-only (members SELECT-only via `can_read_job`) with the per-org
  cap re-checked on presign **and** confirm; `photos` published + REPLICA IDENTITY
  FULL (thumbnails live-refresh, deletes propagate); M10 `purgeJob` frees the job's
  R2 objects. **Not** document management, video, or invoicing. **Supersedes the
  earlier "Pro-only" framing** — Trinity is on Base and gets photos at the Base cap.
- **Incentive scoreboard (Pro).** Points for crew actions. Validate with Trinity
  before heavy build.
- **Multiple crew per phase (Base; all tiers).** Customer ask, Round 4. **Shipped
  (M-MULTI / M24, 2026-07-08):** a `phase_assignees` junction replaces the single
  `phases.assignee_participant_id` FK (column kept until the cleanup migration;
  a DB bridge trigger mirrors legacy writes meanwhile). Up to
  `organizations.max_assignees_per_phase` crew per phase (default 10, per-org
  raiseable — config, not code), enforced in the assign action AND a DB trigger
  that also rejects cross-job junction rows. **Status stays ONE per phase,
  shared, last-writer-wins** — any assignee may set it; the M18 log attributes
  who did (so a premature "Done" is visible/reversible). NO per-person task
  tracking — stays inside §7; the headline and 3-second glance are unchanged.
  Co-assignees on a shared phase READ each other's crew notes; edit stays
  own-only (M17 rule). RLS: members read assignments org-wide (`can_read_job`),
  write via `can_access_job` (mirrors phases); crew NEVER self-assign (anon has
  no grants; crew writes stay on the token-scoped service path). Live-refreshes
  (`phase_assignees` published + REPLICA IDENTITY FULL so an UNASSIGN delete
  propagates — the R1 lesson; assign/unassign also broadcast for anon crew
  boards, so an assigned phase appears / an unassigned one disappears live).

Anything not listed here remains under §7. New asks still get the glance test and
an explicit tier before they ship.
