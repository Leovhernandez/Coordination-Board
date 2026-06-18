# Supabase — schema & migrations (M1)

The core schema for the Coordination Board. Built exactly to `BUILD-PROMPT.md`'s data model; no extra tables (CLAUDE.md §7).

- [`migrations/20260618120000_init.sql`](./migrations/20260618120000_init.sql) — enums, the four tables (`organizations`, `jobs`, `participants`, `phases`), indexes, and owner-only RLS.
- [`seed.sql`](./seed.sql) — one Four L pilot job with default phases `Demo → Rough-in → Inspection → Finish`. Keyed to the owner's login email; a no-op until that user has logged in once (M2).

## Applying it (pick one)

**Option A — Supabase SQL editor (fastest, no CLI):**
Open your project → SQL Editor → paste the contents of `migrations/20260618120000_init.sql` → Run. Then (after first owner login) paste `seed.sql` and Run.

**Option B — Supabase CLI:**
```bash
npm install -D supabase          # or: brew install supabase/tap/supabase
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push             # applies migrations/
```

## After applying

Generate typed DB types for the app (M2 onward will use these):
```bash
npx supabase gen types typescript --project-id YOUR_PROJECT_REF > lib/supabase/database.types.ts
```

## RLS model (why participants have no policies)

Owner (Supabase auth user) policies scope every row to their own org via `(select auth.uid())`. Invited crew are **not** auth users — their writes go through Next.js server actions using the service-role client (which bypasses RLS), where the signed invite token is validated and every query is scoped to that token's single `job_id` in application code (CLAUDE.md §5 invariant). RLS is deny-by-default, so no policy for `anon` means no anon access.
