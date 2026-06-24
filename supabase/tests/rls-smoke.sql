-- ============================================================================
-- RLS smoke-test — catches the bug class that broke login (policy recursion),
-- plus access + tenant-isolation regressions. Exercises the REAL engine as an
-- authenticated user, which `npm run build` cannot do.
--
-- HOW TO RUN (Supabase → SQL Editor), per docs/RELEASE-CHECKLIST.md Step 2:
--
--   BEGIN;
--     -- (when testing a new migration, paste its SQL here first)
--     -- then paste THIS FILE
--   ROLLBACK;            -- nothing persists; you exercised prod's engine safely
--
-- FIRST: replace the two placeholders below. Find a real owner id with:
--   select owner_user_id, owner_email from organizations limit 5;
--   * OWNER_UID_HERE   = that owner's user_id (uuid)
--   * FOREIGN_UID_HERE = any other user's id, or a random uuid like
--                        '00000000-0000-0000-0000-000000000000'
--
-- PASS = every "PASS:" notice prints and no error is raised. A
-- "infinite recursion detected in policy ..." error here is exactly the failure
-- that took production down — fix the policy (SECURITY DEFINER helpers) and re-run.
-- ============================================================================

-- ---- Act as the OWNER ----
set local request.jwt.claims = '{"sub":"OWNER_UID_HERE","role":"authenticated"}';
set local role authenticated;

do $$
declare
  v_uid uuid := (select auth.uid());
  v_n   int;
begin
  -- 1) The exact query that recursed before. Throws here if RLS recurses.
  select count(*) into v_n from organizations;
  raise notice 'PASS: organizations query ran (no recursion), auth.uid=%', v_uid;

  -- 2) Owner can see their own org.
  if not exists (select 1 from organizations where owner_user_id = v_uid) then
    raise exception 'FAIL: owner % sees none of their own org rows', v_uid;
  end if;
  raise notice 'PASS: owner sees their own org';

  -- 3) Owner can read jobs / phases / participants (access + no recursion).
  perform 1 from jobs limit 1;
  perform 1 from phases limit 1;
  perform 1 from participants limit 1;
  raise notice 'PASS: jobs/phases/participants readable by owner';
end $$;

-- ---- Act as a FOREIGN user (tenant isolation) ----
reset role;  -- back to a role allowed to change the claims GUC
set local request.jwt.claims = '{"sub":"FOREIGN_UID_HERE","role":"authenticated"}';
set local role authenticated;

do $$
declare
  v_leak int;
begin
  select count(*) into v_leak
  from organizations
  where owner_user_id = 'OWNER_UID_HERE';
  if v_leak <> 0 then
    raise exception 'FAIL: tenant isolation breached — foreign user sees % owner-org row(s)', v_leak;
  end if;
  raise notice 'PASS: tenant isolation holds (foreign user sees 0 of the owner''s org rows)';
end $$;

reset role;
