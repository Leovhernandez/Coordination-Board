# Release checklist (so prod never breaks again)

This exists because the M14 migration shipped an **infinite RLS recursion** straight
to production and took sign-in down. Root cause: the migration's row-level-security
was never executed against a real database *as an authenticated user* before it was
applied — `npm run build` passing proves nothing about RLS. This checklist closes
that gap.

## When this applies

| Change type | Required steps |
|---|---|
| **Schema / RLS migration** | **ALL of Steps 1–5.** No exceptions. This is the dangerous class. |
| **Auth / session / middleware** | Steps 1, 3, 4, 5 (RLS test only if policies change). |
| **Data-access server actions / queries** | Steps 1, 3, 4. |
| Presentational / copy / styling only | Step 1 + a quick visual check. |

**Golden rule:** never push a schema/RLS migration or an auth change to `main`
(production) without (a) the RLS pre-flight passing and (b) a preview verification.
Work on a branch; `main` is auto-deployed to production by Vercel.

---

## Step 1 — Local build gate
```
NEXT_TELEMETRY_DISABLED=1 npm run build      # must compile, no type errors
npx tsx scripts/test-headline.mts            # 6/6 (the core differentiator)
```
Necessary but **not sufficient** — it does not touch the database or RLS.

## Step 2 — RLS pre-flight (the step that would have caught the login bug)

For **any** migration, before applying it for real, run it **inside a rolled-back
transaction together with the RLS smoke-test**, so recursion / access / isolation
bugs surface without persisting anything.

1. Open Supabase → **SQL Editor**.
2. Paste, in one run:
   - `BEGIN;`
   - the **new migration's SQL**
   - the contents of [`supabase/tests/rls-smoke.sql`](../supabase/tests/rls-smoke.sql)
     (fill in a real owner `user_id` first — see that file's header)
   - `ROLLBACK;`
3. **Pass criteria:**
   - No `infinite recursion detected in policy ...` error (that's the bug we hit).
   - The owner SELECTs return their own org/jobs/phases/participants.
   - A foreign `user_id` returns **zero** rows for another org's data (tenant isolation).
   - Every `RAISE NOTICE 'PASS ...'` prints; no `EXCEPTION`.
4. Because the whole thing is wrapped in `BEGIN; ... ROLLBACK;`, production data is
   untouched even though you exercised the real engine.

> Upgrade path (optional, recommended once revenue allows): a **separate staging
> Supabase project** (free tier) so migrations are applied for real there first and
> Vercel previews point at it. Until then, the rolled-back pre-flight above is the
> safeguard.

## Step 3 — Preview deploy
- Push the working **branch** to GitHub → Vercel auto-creates a **preview URL**
  (separate from production). Verify the change there.
- Preview env vars come from Vercel's Preview scope. (Today previews read the prod
  Supabase; that's fine for verifying *code*. Migrations are gated by Step 2, not
  the preview, until a staging DB exists.)

## Step 4 — Regression smoke-test (every previously-working feature)

Run on the preview URL, signed in as a real owner. Per the standing rule, verify the
whole app, not just the new change:

- [ ] **Sign in**: magic link → lands on **dashboard** (no bounce to /login)
- [ ] **Create job** (name/address/customer) → default phases appear
- [ ] **Board statuses**: set Done / In progress / Blocked(+reason) → persists
- [ ] **Critical-path headline** is correct and leads the dashboard
- [ ] **Edit phases**: add / rename / delete / reorder / assign
- [ ] **Crew**: add participant → copy/text link → revoke
- [ ] **Participant board**: texted link opens with **no signup**, shows **only
      assigned** phases, can update status; owner's board updates **live**
- [ ] **Live updates**: owner Realtime + participant Broadcast
- [ ] **Archive / unarchive**; **org name** + **job name** inline edit
- [ ] **Access gating**: trial / expired states behave
- [ ] **Admin** panel + **company oversight** read-only view (if touched)
- [ ] **PWA**: installs; offline navigation tolerated

## Step 5 — Promote to production
1. Re-run **Step 2's RLS pre-flight** once more, then **apply the migration to prod**
   (Supabase SQL Editor) — *before* the code that depends on it goes live.
2. Merge the branch to `main` → Vercel deploys production.
3. **Post-deploy prod check**: sign in, create/touch a job, open a participant link.
4. If anything is off, the symptom map below points at the cause fast.

---

## Incident heuristics (learned the hard way)

- **Login breaks right after a migration → suspect the migration first** (RLS
  recursion, missing grant, bad policy), not whatever code you last touched.
- **Clean `/login`, no error message** = the session was established but a **server
  query failed** (usually RLS) and a page redirected out. Look at `getOrCreateOrg` /
  dashboard, not the auth callback.
- **Red error on `/login`** = the **auth callback itself** failed (token/exchange).
- **Cross-table RLS policies that reference each other recurse.** Use **SECURITY
  DEFINER** helper functions for membership/ownership checks — they bypass RLS, so
  they can't recurse. Keep them `stable`, `set search_path = public`, and filtered
  strictly by `auth.uid()`.
- Don't push fixes blind. Reproduce or pre-flight first; production is not a console.
