# M18 Handoff Brief — Activity Log + Blocker Duration

> For a fresh Claude Code session continuing **M18**. Self-contained, but the
> governing docs still win. **M17 and Phase 0.5 are DONE + DEPLOYED — do not redo
> them.** This brief is about finishing **M18 only**.

## 0. Read first (in order)
1. `AGENTS.md` — the constitution (binding; **wins on any conflict** — stop & flag).
2. `docs/ROADMAP-AND-PRICING.md` — tiers, build order.
3. `INSTRUCTIONS.md` — the live work order. M18 spec is the `### M18` section;
   Phase 0.5 (now done) is the M17 regression context.
4. This file.

## 1. Where things stand (2026-06-29)
- **M13 (i18n) + M17 (phase notes) — shipped & deployed to prod.** `main` HEAD
  `73b5259`, Vercel green. Prod branch = `main` (push `main` → Vercel auto-deploys).
- **Phase 0.5 (M17 regression R1/R2/R4) — done & deployed.** Migration
  `20260629130000_m17_regression.sql` applied to prod (R1: `notes` REPLICA IDENTITY
  FULL so deletes live-refresh; R2: owner read-only on jobs they don't own via
  `can_edit_job()` + `canEdit` UI; R4: dashboard header truncation).
- **R3 (job delete) → scheduled as M10** in ROADMAP — NOT built.
- **M18 — IN PROGRESS:** design decided, migration written + smoke-verified, **app
  layer NOT built yet.**

## 2. M18 goal + the DECIDED design (owner-confirmed)
Goal: log create/update/delete on **phase** changes (status, label, assignment,
add, delete) and **note** changes (add, edit, delete), each with **actor +
timestamp**; derive **blocker duration**; surface minimally (no global feed, §7).

Owner picked **Option A — History + blocker pill**:
- An at-a-glance **"Blocked Nd"** pill on blocked phases.
- A **collapsible per-phase "History"** disclosure (actor + event + relative time),
  collapsed by default.

Mechanism (decided): **app-layer logging via the service-role client.** Only the
app knows the crew **participant** actor (their writes come through the service
role), so a DB trigger can't attribute them. Keep `updated_at` app-layer too
(consistent with M17). `activity_log` is **append-only**.

## 3. What's already built for M18
- `supabase/migrations/20260629140000_m18_activity_log.sql` — the `activity_log`
  table + RLS. Members **read** org-wide (`can_read_job`); **append-only**:
  `authenticated` is granted **only SELECT** (a member write fails at the privilege
  layer with `42501`, before RLS). The server appends via service-role.
- `supabase/tests/rls-m18-activity-smoke.sql` — pre-flight smoke (**5 PASS**: A
  reads; A insert/update/delete denied 42501; owner reads).
- **Both files are UNCOMMITTED** — they commit together with the app layer.
- **Migration apply:** owner applies `20260629140000` manually in Supabase BEFORE
  app code is deployed (the app queries the table). Confirm it's applied in prod.

## 4. What's LEFT to build (the M18 app layer)

**A. Logging** — append one `activity_log` row per write, via `createServiceClient`
(NOT the authed client — members have no write grant). Suggest a server-only helper
`lib/activity.ts` `logActivity({ jobId, phaseId?, noteId?, eventType, actorMemberId?,
actorParticipantId?, detail })` used by both action files.
- Member actions in `app/jobs/[id]/actions.ts` (actor = `ctx.member.id` via
  `getSessionContext()`): `setPhaseStatus` → `status_change` `{from,to,reason}`
  (read the phase's old status first); `addPhase` → `phase_added` `{label}`;
  `renamePhase` → `label_change` `{from,to}`; `deletePhase` → `phase_deleted`
  `{label}` (log BEFORE delete); `assignPhase` → `assignment_change`
  `{from,to}` (resolve participant names); `addNote`/`editNote`/`deleteNote` →
  `note_added`/`note_edited`/`note_deleted` (`noteId`, `phaseId`).
- Crew actions in `app/j/[jobId]/actions.ts` (actor = `participant.id`):
  `updateAssignedPhase` → `status_change`; `addCrewNote`/`editCrewNote`/
  `deleteCrewNote` → `note_*`.
- `movePhase` (reorder) is **NOT** in the spec's logged set — skip it.
- `event_type` allowed values are constrained by a CHECK in the migration — match
  them exactly.

**B. Blocker-duration pill** — "Blocked Nd". Derive from the latest
`status_change` whose `detail.to = 'blocked'` for that phase (blocked-since
timestamp; duration = now − that). Show next to the status pill on blocked phases.
Add a compact duration formatter (e.g. "3d"/"5h") — localize via the dictionary
(don't hardcode). `lib/relative-time.ts` gives "3 days ago"; a compact variant or a
`t.history.blockedFor` template is cleaner for the pill.

**C. History disclosure** — a new `components/PhaseHistory.tsx` (mirror the
action-agnostic, `useT()`/`useLang()` pattern of `components/PhaseNotes.tsx`),
collapsed by default, rendered inside each phase in `app/jobs/[id]/Board.tsx`
(covers the editable board AND the read-only in-depth view — same component via the
`readOnly` prop). Localize event descriptions via the dictionary (e.g.
`"{actor} set {status}"`, `"{actor} added a note"`). **Crew board: SKIP history**
(owner decision — keep the crew board lean; it already has status + notes). Confirm
with the owner if they later want it there.

**D. i18n** — add a `history` section to `lib/i18n/dictionaries.ts` (EN **and** ES;
the `es: Dict` type fails `tsc` if a key is missing). Every new user-facing string
goes through the catalog (M13 carry-forward).

**E. Realtime — nothing new needed.** Every `activity_log` row is written alongside
a phase/note change that ALREADY live-refreshes (`/jobs/[id]` subscribes to
`["phases","notes"]`; crew note/phase actions call `broadcastJobChange`). The
re-fetch picks up the new log. Just verify History updates live on a 2nd device.

**F. Data loading** — in `app/jobs/[id]/page.tsx`, load activity per phase (mirror
`notesForJob` in `lib/notes.ts`: service-client read scoped to the already-authorized
job, resolve member/participant actor names, group by `phase_id`), pass to `Board`.

## 5. Constraints (binding)
- **Migration cadence:** migration → **owner applies manually** → then app code.
  Never deploy code querying `activity_log` before the owner confirms it's applied.
- **No commit/push/deploy without explicit owner go-ahead.**
- **Regression gate (binding, AGENTS §6):** re-verify ALL prior features, not in
  isolation — especially **realtime live-refresh, sign-in, RLS read/write + tenant
  isolation, critical-path headline.** Realtime + RLS regress silently.
- **Security (AGENTS §5):** service-role key is server-only (`lib/supabase/service.ts`,
  `server-only` import); participants never become auth users; crew writes go
  token → participant → assigned-phase, then service-role; RLS deny-by-default;
  read vs write are separate. **`activity_log` is append-only** (members SELECT only).
- **Two-sided actor** everywhere (member XOR participant), like `notes`.
- **Glance test (§7):** History collapsed by default; pill compact; NO global feed;
  never clutter the critical-path headline.
- **Tier:** M18 is **Base** (all tiers) — no tier gating.

## 6. Key file paths
**Migrations / RLS helpers**
- `supabase/migrations/20260629140000_m18_activity_log.sql` (apply first)
- `supabase/tests/rls-m18-activity-smoke.sql` (pre-flight, 5 PASS)
- RLS helpers live in `supabase/migrations/20260624130000_multi_seat_rls_security_definer.sql`
  (`is_org_owner`, `owns_member`, `is_org_member`, `can_access_job`) +
  `20260628120000_mvis_company_read.sql` (`can_read_job`) +
  `20260629130000_m17_regression.sql` (`can_edit_job`).

**App code to instrument**
- `app/jobs/[id]/actions.ts` — member phase + note actions
- `app/j/[jobId]/actions.ts` — crew phase + note actions (`revalidateCrew` helper)
- `app/jobs/[id]/page.tsx` — load activity, pass to `Board`
- `app/jobs/[id]/Board.tsx` — render blocker pill + `PhaseHistory` (respect `readOnly`)
- `app/j/[jobId]/page.tsx`, `app/j/[jobId]/ParticipantBoard.tsx` — crew (history skipped)

**Libs / components (patterns to mirror)**
- `lib/notes.ts` — loader pattern for the new `lib/activity.ts`
- `lib/relative-time.ts` — `relativeTime(iso, lang)`
- `lib/types.ts` — add `ActivityEvent` row + `ActivityView` display types
- `lib/membership.ts` (`getSessionContext`, `Member`), `lib/participant.ts`
  (`getParticipantByToken`, `participantCookieName`)
- `lib/supabase/service.ts` (`createServiceClient`), `lib/supabase/server.ts`
  (`createClient`, authed/RLS), `lib/realtime.ts` (`broadcastJobChange`)
- `components/PhaseNotes.tsx` — pattern for `components/PhaseHistory.tsx`
- `components/I18nProvider.tsx` (`useT`, `useLang`), `lib/i18n/dictionaries.ts`
  (add `history` section), `lib/i18n/interpolate.ts`

**Docs to sync at M18 close**
- `AGENTS.md` §9, `docs/ROADMAP-AND-PRICING.md` (mark M18 done), `README.md` line.

## 7. Verification gates (all must pass before commit)
```
npx tsc --noEmit
npm run lint
npx tsx scripts/test-headline.mts      # 6/6 PASS
npm run build
```
Plus the migration RLS pre-flight (owner runs in Supabase, 5 PASS).

## 8. Gotchas / lessons
- **`activity_log` writes are GRANT-gated** (members have no write grant → `42501`).
  Always append via `createServiceClient`, never the authed client.
- **DELETE realtime needs `REPLICA IDENTITY FULL`** (learned in M17 R1: a DELETE
  event otherwise carries only the PK, so a `job_id` filter / RLS can't match).
  `activity_log` is effectively insert-only so N/A — but remember it for any future
  table whose deletes must live-refresh under a filter/RLS.
- `es` in `dictionaries.ts` is typed `Dict` → a missing ES key fails `tsc` (this is
  the "untranslated string" check).
- Env: Windows/PowerShell; `.env.local` has `NEXT_PUBLIC_SITE_URL=http://localhost:3000`
  (correct — prod URL is set in Vercel). Local two-window testing works against prod
  Supabase (see prior session's Option 1 steps).
- `/goal` in effect: complete M18, then continue. Owner gates remain (migration
  apply + real-device validation) — pause for them.
