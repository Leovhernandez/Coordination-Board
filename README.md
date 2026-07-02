# Coordination Board

A single shared, per-job status board where each trade taps **Done / In progress / Blocked (waiting on ___)**, and the GC/owner sees at a glance the one thing blocking the next phase.

> The product, scope, stack, and auth model are governed by [`CLAUDE.md`](./CLAUDE.md) (the constitution) and built in milestones per [`BUILD-PROMPT.md`](./BUILD-PROMPT.md). When in doubt, those files win.

- **Domain:** `coordination.4lfr.com` — one app for everyone. The owner logs in; crew open a texted, token-scoped link (`/j/{job_id}?t={token}`) with no signup.
- **Stack:** Next.js 15 (App Router) + TypeScript · Tailwind · Supabase (Postgres + Auth + Realtime) · Stripe (last) · Vercel · PWA, mobile-first.

## Local setup

```bash
npm install
cp .env.local.example .env.local   # then fill in your Supabase keys
npm run dev                         # http://localhost:3000
```

Visit [`/health`](http://localhost:3000/health) to confirm the app boots and required env vars are present.

## Environment

See [`.env.local.example`](./.env.local.example). The `SUPABASE_SERVICE_ROLE_KEY` is **server-side only** and must never reach the browser — it is used exclusively through `lib/supabase/service.ts`, which is guarded by a `server-only` import.

## Milestones

Tracked in [`BUILD-PROMPT.md`](./BUILD-PROMPT.md): M0 scaffold/deploy → M1 schema → M2 owner auth + jobs → M3 board → M4 critical-path headline → M5 link invite → M6 realtime → M7 PWA → M8 billing → M9 pilot.

Post-v1 (Trinity-driven, see [`docs/ROADMAP-AND-PRICING.md`](./docs/ROADMAP-AND-PRICING.md)): M14 multi-seat orgs → M-VIS company-wide read-only visibility → M-DASH symmetric dashboard → M13 Spanish/English UI (display-only) → M17 phase notes → M18 activity log + blocker duration → M10 soft-delete/restore/purge → M22 photo uploads (Cloudflare R2; Base+Pro storage cap) → M21 preferred payment method (owner opt-in, per-participant) → N2 tiered Stripe pricing + promo→Base auto-transition.
