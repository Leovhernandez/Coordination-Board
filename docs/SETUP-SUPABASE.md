# Supabase setup (do this once, in order)

This is the canonical, do-not-skip checklist for provisioning the Coordination Board's Supabase backend. Steps 1–4 are required before M1 can be applied; steps 5–6 are needed for M2 (owner magic-link login) and are best done now while you're in the dashboard.

---

## 1. Create the project

1. Go to **https://supabase.com** → sign in (GitHub login is fine) → **New project**.
2. **Organization:** create one (e.g. "Four L") or reuse an existing one.
3. **Name:** `coordination-board`
4. **Database password:** click *Generate*, then **save it in your password manager**. You won't need it for the app (the app uses API keys), but you'll want it for direct DB access later.
5. **Region:** choose the one closest to Four L's crews (e.g. **East US (North Virginia)** or **Central US**). Lower latency = snappier live board.
6. **Plan:** Free is fine for the pilot.
7. **Security section** (on the create screen):
   - **Enable Data API** — leave **checked** (the JS client needs it).
   - **Automatically expose new tables** — **uncheck** (least privilege; our migration grants table access explicitly to `authenticated` + `service_role`, never to `anon`).
   - **Enable automatic RLS** — leave **unchecked** (our migration enables RLS per-table itself).
   - **Postgres Type** — keep **Postgres (Default)**, not OrioleDB (alpha).
   > The migration includes the explicit grants, so it applies cleanly whether or not that middle box ends up checked. Unchecked is just the cleaner, recommended state.
8. Click **Create new project** and wait ~2 minutes for it to finish provisioning.

## 2. Copy the API keys

In the project: **Settings (gear) → API**. You need three values:

| Dashboard label | Goes into `.env.local` as | Secret? |
| --- | --- | --- |
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` | no (public) |
| **Publishable** key (`sb_publishable_…`) | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | no (public) |
| **Secret** key (`sb_secret_…`) | `SUPABASE_SERVICE_ROLE_KEY` | **YES — server only, never share** |

> **Two easy mistakes to avoid:**
> 1. For the URL, copy the **base Project URL** — `https://YOUR_REF.supabase.co` — **not** the REST endpoint that ends in `/rest/v1/`. The client appends `/rest/v1/` itself; a trailing path breaks every call.
> 2. Supabase's current key names are **Publishable** (browser-safe, = the `anon` role) and **Secret** (server-only, = `service_role`). Those are the right ones. The older `eyJ…` "anon/service_role (legacy)" JWT keys also work but aren't needed.

> The `service_role` key bypasses all security rules. It only ever lives in `.env.local` (gitignored) and in Vercel's encrypted env settings — never in the browser, never committed, never in a screenshot.

## 3. Put the keys in `.env.local`

In the project folder, copy the template and fill it in:

```bash
cp .env.local.example .env.local
```

Edit `.env.local` so the four values are real:

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...           # anon / public
SUPABASE_SERVICE_ROLE_KEY=eyJ...               # service_role (secret)
NEXT_PUBLIC_SITE_URL=http://localhost:3000     # prod later: https://coordination.4lfr.com
```

Verify it worked: run `npm run dev`, open **http://localhost:3000/health** — all four rows should read **present** (green).

## 4. Apply the schema (M1)

Pick one:

**Option A — SQL editor (fastest):** Project → **SQL Editor** → **New query** → paste the entire contents of [`supabase/migrations/20260618120000_init.sql`](../supabase/migrations/20260618120000_init.sql) → **Run**. You should see "Success. No rows returned."

**Option B — Supabase CLI:**
```bash
npm install -D supabase
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Confirm: Project → **Table Editor** should now show `organizations`, `jobs`, `participants`, `phases`.

## 5. Configure email auth (needed for M2 owner login)

The owner logs in with a magic link — no passwords.

1. **Authentication → Sign In / Providers → Email:** ensure **Email** is enabled. You can turn **Confirm email** off for the pilot to reduce friction (magic links already prove email control).
2. **Authentication → URL Configuration:**
   - **Site URL:** `http://localhost:3000` for now (change to `https://coordination.4lfr.com` at go-live).
   - **Redirect URLs:** add both so links work in dev and prod:
     - `http://localhost:3000/**`
     - `https://coordination.4lfr.com/**`
3. (Pilot-grade email is fine to start. Supabase's built-in email sender has low rate limits; before real crews use it heavily we'll plug in an SMTP provider — that's a later step, not now.)

## 6. Seed the pilot job (after first login)

The seed creates a Four L job with default phases `Demo → Rough-in → Inspection → Finish`. It's keyed to your login email, so it only works **after** you've signed in once (M2). When ready: SQL Editor → paste [`supabase/seed.sql`](../supabase/seed.sql) → Run.

---

## What I (Claude) do once steps 1–4 are done

Tell me the project is provisioned and I'll: verify `/health` is green, confirm the tables exist as expected, generate typed DB types (`lib/supabase/database.types.ts`), and start M2 (owner magic-link login + job creation). I'll also add the four env vars to Vercel when we deploy.
