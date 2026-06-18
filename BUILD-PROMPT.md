# Claude Code — Kickoff Build Prompt: Coordination Status Board (App 1)

> **How to use this:** Drop the companion `CLAUDE.md` at the root of a fresh repo, then paste everything below (from "BEGIN PROMPT") as your first message to Claude Code. `CLAUDE.md` holds the durable guardrails; this prompt drives the actual build. Replace the few `<<...>>` placeholders first.

---

## BEGIN PROMPT

You are building **Priority 1 of a three-app plan: the Coordination Status Board** (working name **PhaseBoard** — rename freely). Read `CLAUDE.md` in the repo root **now** and treat it as binding for the entire project. The mission, the confirmed stack, the auth model, and especially the **Anti-Scope list (§7)** and **Scope-Discipline mandate (§4)** govern everything you do. If anything I ask below appears to conflict with `CLAUDE.md`'s anti-scope, stop and flag it rather than building it.

### The one-sentence mission
A single shared, per-job status board where each trade taps **Done / In progress / Blocked (waiting on ___)**, and the GC/owner sees at a glance **the one thing blocking the next phase.**

### The single feature that must be excellent
**Critical-path surfacing.** The owner dashboard must compute and prominently display the one sentence the GC needs — *"The next phase X cannot start because Y is blocked/incomplete, waiting on Z"* — not merely list statuses. This is the core value and the reason we beat horizontal PM tools. Build it as the centerpiece, not a footnote.

---

### Stack (confirmed — do not substitute)
Next.js 15 (App Router) + TypeScript · Tailwind CSS · Supabase (Postgres + Auth + Realtime + Storage) · Stripe Checkout · deploy on Vercel · single dedicated domain · PWA, mobile-first.

Before writing feature code, **verify the current Supabase APIs you'll depend on** (Realtime Postgres Changes subscription syntax, RLS policy patterns, and the JS client version) against today's Supabase docs — do not hardcode from memory, as these evolve. Same for Next.js 15 App Router server-action conventions.

---

### Placeholders to resolve first
- `<<DOMAIN>>` — the production domain (e.g., `phaseboard.app`). Ask me if unset.
- `<<SUPABASE_PROJECT>>` — confirm I've created a Supabase project and have the URL + anon + service-role keys ready, or tell me how to provision.
- `<<STRIPE>>` — Stripe is the **last** milestone; you can stub the subscription flag until then.

---

## Data model (build exactly this; do not add tables "for later")

```sql
-- enums
create type phase_status as enum ('not_started', 'in_progress', 'blocked', 'done');
create type job_status   as enum ('active', 'archived');

-- the contractor's account
create table organizations (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  owner_user_id         uuid not null references auth.users(id),
  stripe_customer_id    text,
  subscription_status   text not null default 'trialing', -- trialing | active | past_due | canceled
  created_at            timestamptz not null default now()
);

create table jobs (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  name          text not null,
  address       text,
  customer_name text,
  status        job_status not null default 'active',
  created_at    timestamptz not null default now()
);

-- lightweight, link-token-only invitees (NOT auth.users) — defined before phases for the FK
create table participants (
  id            uuid primary key default gen_random_uuid(),
  job_id        uuid not null references jobs(id) on delete cascade,
  name          text not null,
  phone         text,
  invite_token  text not null unique,           -- 32-byte cryptographically random, base64url
  revoked       boolean not null default false,
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now()
);

-- ordered list of phases per job; dependency is the linear sequence_index ONLY
create table phases (
  id                      uuid primary key default gen_random_uuid(),
  job_id                  uuid not null references jobs(id) on delete cascade,
  label                   text not null,
  sequence_index          int  not null,
  status                  phase_status not null default 'not_started',
  blocked_reason          text,                 -- the "waiting on ___" line; required when status='blocked'
  assignee_participant_id uuid references participants(id) on delete set null,
  updated_at              timestamptz not null default now(),
  unique (job_id, sequence_index)
);
```

Provide default trade phases on job creation (editable): **Demo → Rough-in → Inspection → Finish.** Keep the seed list short and trade-real; let the owner reorder/rename/add/remove.

**RLS / authorization (state the invariant, implement the mechanics against current Supabase docs):**
- Owner (Supabase-authed user) can do everything within **their own org** — enforce with RLS keyed to `organizations.owner_user_id = auth.uid()`.
- Participants are **not** Supabase users. Their reads/writes go through **Next.js server actions** that (1) read the httpOnly token cookie, (2) validate it against a non-revoked `participants` row, (3) use the **service-role client server-side only**, never exposed to the browser.
- **Invariant:** a participant token can read its job's board and update only phases where `assignee_participant_id` = that participant. It can touch no other job, ever. Service-role key never reaches the client.

---

## Critical-path algorithm (the core value — implement precisely)

Phases are a linear sequence ordered by `sequence_index`. Compute one **headline** for the dashboard:

```
sort phases by sequence_index
frontier = first phase whose status != 'done'

if frontier is null:
    headline = "✅ All phases complete."
else:
    next = first phase after frontier whose status != 'done' (may be null)
    switch frontier.status:
      case 'blocked':
        headline = "🔴 BLOCKED: {frontier.label} — waiting on {frontier.blocked_reason}."
                 + (next ? " Next phase ({next.label}) can't start until this clears." : "")
        chase = frontier.assignee?.name ?? frontier.blocked_reason
      case 'in_progress':
        headline = "🟡 IN PROGRESS: {frontier.label}" + (assignee ? " ({assignee.name})" : "")
                 + (next ? " — next up: {next.label}." : "")
      case 'not_started':
        headline = "⚪ READY TO START: {frontier.label}" + (assignee ? " — {assignee.name}" : "")
                 + " — nothing upstream is blocking."
```

Also surface, secondarily and smaller, any **downstream phase already flagged `blocked`** (e.g., inspection blocked while we're still at rough-in), so the GC sees a problem coming. The **frontier headline is primary**; everything else is subordinate. The GC must get "what do I chase right now" in under one second without reading a list.

---

## Build in milestones. Each milestone ends as a working, deployed, live URL on Vercel.

**M0 — Scaffold + deploy.** Next.js 15 App Router + TS + Tailwind. Connect Supabase. Deploy to Vercel so there's a live URL on day one. Add a barebones health page. *Done when:* the empty app is live at a URL.

**M1 — Schema + migrations + seed.** Create the tables/enums above as Supabase migrations. RLS baseline for owner. Seed one real Four L job with the default phases. *Done when:* migrations apply cleanly and the seed job exists.

**M2 — Owner auth + jobs.** Supabase email magic-link login. On first login, create the org. Owner can create a job (name, address, optional customer_name) which auto-creates the default editable phases. Owner sees a list of their jobs. *Done when:* I can log in and create a job with default phases.

**M3 — The board (write path).** Per-job board: each phase shows its label and a one-tap status control — **Done / In progress / Blocked**. Choosing Blocked requires a one-line "waiting on ___" (`blocked_reason`). Mobile-first, single column, large tap targets, **optimistic UI** (instant tap, reconcile after, queue if offline). *Done when:* I can change every phase's status from my phone and it persists.

**M4 — Critical-path surfacing (the core).** Implement the algorithm above. The owner dashboard leads with the **headline blocker/next-action**, then the phase list beneath. *Done when:* with a phase set to Blocked, the dashboard headline tells me exactly what to chase, prominently, above everything.

**M5 — Link-token invite.** Owner adds a participant (name, optional phone) to a job → system generates a random `invite_token` → owner gets a shareable link `https://<<DOMAIN>>/j/{job_id}?t={token}` to text. The link opens that job's board with **no signup**; server validates the token, sets the job-scoped cookie, and lets the participant update **their assigned** phase(s). Owner can revoke a token. *Done when:* a texted link opens the board on a fresh phone with no login and the invitee can update their phase.

**M6 — Live updates.** Supabase Realtime on `phases` (filtered to the job) so the owner dashboard and participant boards reflect changes without manual refresh. *Done when:* a participant's status change appears on the owner's open dashboard within ~1s, no refresh.

**M7 — PWA.** Web app manifest + service worker: installable to home screen, offline-tolerant write queue. Never *require* install. *Done when:* "Add to Home Screen" works and a tap made offline syncs on reconnect.

**M8 — Billing (last; must not block the pilot).** Stripe Checkout, one monthly plan, owner pays; participants never see billing. Gate job creation on `subscription_status in ('trialing','active')`. The Four L pilot account runs as `active`/`trialing` so self-piloting is never blocked. *Done when:* a new owner can subscribe via Checkout and the flag flips.

**M9 — Pilot gate (acceptance).** Run one **real, active Four L job** end-to-end in production: owner creates it, invites a real crew member by text, that person updates a phase to Blocked on their phone with no signup, and the owner's dashboard headlines the blocker live. *Done when:* all four §8 Definition-of-Done conditions in `CLAUDE.md` are met.

> Ship M0 live immediately and keep every subsequent milestone deployable. Optimize for "pilotable on a real job this week," not completeness.

---

## Acceptance criteria for v1 (from `CLAUDE.md` §8 — all must hold)
1. A real Four L job runs on it in production.
2. The owner sees the single current blocker / next action at the **top** of the dashboard without reading a list.
3. A crew member opened a **texted link**, with **no signup**, flipped a phase to **Blocked** with a reason, and the owner's board updated **live**.
4. **None** of the anti-scope items exist.

## Hard anti-scope (do NOT build — see `CLAUDE.md` §7)
No permissions/roles matrix · no org-chart · no Gantt/scheduling/calendar · no multi-job analytics · no file storage/invoicing/estimating/chat · no client portal · no dependency-graph editor (linear `sequence_index` only). The whole of v1 = jobs, ordered phases, per-phase status, link-invite, one dashboard. If you think something is missing, **ask before adding.**

## Working style I expect
- Confirm the stack and resolve the placeholders, then propose the M0 plan **before** writing large amounts of code.
- Work milestone by milestone; pause at each milestone's "Done when" for me to validate on a real device.
- Keep PRs/commits scoped to one milestone. No speculative abstraction.
- Mobile-first always: assume a contractor holding a phone one-handed on bad signal.

## END PROMPT

---

## After v1 ships (for Leo — not part of the Claude Code prompt)
- Return to the master brief for the **Priority 2** prompt: **Change Order Capture, Flavor A** (on-site change order + on-screen signature + timestamped immutable record). Same stack, comparable complexity.
- **In parallel, now**, run the **Flavor B Mom-Test** with your commercial-GC friend: walk him through the exact unpaid-change-order sequence — at what point he knew the money was at risk, what he wished he'd known *before* doing the work, what he'd have paid to know it. Flavor B (payment-chain visibility / lien-notice) is potentially the bigger business but touches **Texas lien law** — a legal minefield. **Do not build it from memory; deadlines/notice mechanics must be verified with competent counsel.** Validate the story before any engineering.
