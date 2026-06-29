-- ============================================================================
-- M10 soft-delete / purge RLS smoke — proves the EXISTING jobs write policies
-- correctly govern the new delete/restore/purge surface (this migration adds no
-- policies, so the point is to confirm nothing is newly exposed):
--   * a non-owning, non-owner salesman CANNOT soft-delete (UPDATE deleted_at) or
--     purge (DELETE) another salesman's job — RLS matches 0 rows (silent deny)
--   * the OWNING salesman CAN soft-delete, restore, and purge their own job
--   * purge CASCADES (phases/notes/etc. go with the job)
--
-- The R2 boundary (owner is read-only on a salesman's job) is enforced in the APP
-- (deleteJob/restoreJob/purgeJob mirror archiveJob), NOT at the jobs RLS layer
-- (is_org_owner still grants the owner write there) — so it is intentionally NOT
-- asserted here; the app layer owns it, like archive/rename.
--
-- SELF-CONTAINED: builds its own org + owner + 2 salesmen + a job (owned by B) and
-- a phase, inside the txn (reusing 3 real auth.users for the user_id FK), then
-- exercises the REAL engine as each member. Ids pass via txn-local GUCs.
--
-- HOW TO RUN (Supabase → SQL Editor), per docs/RELEASE-CHECKLIST.md Step 2 — paste
-- in ONE run so nothing persists:
--   BEGIN;
--     -- paste 20260629160000_m10_soft_delete_jobs.sql first, then this file
--   ROLLBACK;
--
-- PASS = every 'PASS:' notice prints and no exception is raised.
-- ============================================================================

-- ---- Setup as the table owner (bypasses RLS); stash ids in m10.* GUCs ----
do $$
declare
  v_owner uuid; v_a uuid; v_b uuid;
  v_org uuid; v_ma uuid; v_mb uuid;
  v_job_b uuid; v_ph_b uuid;
begin
  select u.id into v_owner
    from auth.users u
    where not exists (select 1 from organizations o where o.owner_user_id = u.id)
    order by u.created_at limit 1;
  select id into v_a from auth.users where id <> v_owner order by created_at limit 1;
  select id into v_b from auth.users where id not in (v_owner, v_a) order by created_at limit 1;
  if v_owner is null or v_a is null or v_b is null then
    raise exception 'M10 smoke needs >= 3 distinct auth.users';
  end if;

  insert into organizations (name, owner_user_id, subscription_status)
    values ('M10 Test Co', v_owner, 'active') returning id into v_org;
  insert into org_members (org_id, user_id, email, name, role)
    values (v_org, v_owner, 'owner@m10.test', 'Owner', 'owner');
  insert into org_members (org_id, user_id, email, name, role)
    values (v_org, v_a, 'a@m10.test', 'A', 'salesman') returning id into v_ma;
  insert into org_members (org_id, user_id, email, name, role)
    values (v_org, v_b, 'b@m10.test', 'B', 'salesman') returning id into v_mb;
  -- Job owned by salesman B.
  insert into jobs (org_id, name, salesman_member_id)
    values (v_org, 'Job B', v_mb) returning id into v_job_b;
  insert into phases (job_id, label, sequence_index)
    values (v_job_b, 'Demo B', 0) returning id into v_ph_b;

  perform set_config('m10.a_uid',  v_a::text,     true);
  perform set_config('m10.b_uid',  v_b::text,     true);
  perform set_config('m10.job_b',  v_job_b::text, true);
  perform set_config('m10.ph_b',   v_ph_b::text,  true);
end $$;

-- ---- Act as SALESMAN A (different salesman, same org) ----
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('m10.a_uid'), 'role','authenticated')::text, true);
set local role authenticated;

do $$
declare n int;
begin
  -- A reads B's job (M-VIS org-wide read).
  if (select count(*) from jobs where id = current_setting('m10.job_b')::uuid) <> 1 then
    raise exception 'FAIL: salesman A cannot read B job';
  end if;
  raise notice 'PASS: salesman A reads B job (M-VIS)';

  -- A CANNOT soft-delete B's job (RLS write policies match 0 rows).
  update jobs set deleted_at = now() where id = current_setting('m10.job_b')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: salesman A soft-deleted B job (% rows)', n; end if;
  raise notice 'PASS: salesman A cannot soft-delete B job';

  -- A CANNOT purge B's job.
  delete from jobs where id = current_setting('m10.job_b')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: salesman A purged B job (% rows)', n; end if;
  raise notice 'PASS: salesman A cannot purge B job';
end $$;

-- ---- Act as SALESMAN B (owns the job) ----
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('m10.b_uid'), 'role','authenticated')::text, true);
set local role authenticated;

do $$
declare n int;
begin
  -- B soft-deletes own job.
  update jobs set deleted_at = now() where id = current_setting('m10.job_b')::uuid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: salesman B cannot soft-delete own job (% rows)', n; end if;
  raise notice 'PASS: salesman B soft-deletes own job';

  -- B restores own job.
  update jobs set deleted_at = null where id = current_setting('m10.job_b')::uuid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: salesman B cannot restore own job (% rows)', n; end if;
  raise notice 'PASS: salesman B restores own job';

  -- B purges own job (hard DELETE).
  delete from jobs where id = current_setting('m10.job_b')::uuid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: salesman B cannot purge own job (% rows)', n; end if;
  raise notice 'PASS: salesman B purges own job';
end $$;

-- ---- Verify cascade as the table owner ----
reset role;
do $$
begin
  if exists (select 1 from jobs where id = current_setting('m10.job_b')::uuid) then
    raise exception 'FAIL: purged job still present';
  end if;
  if exists (select 1 from phases where id = current_setting('m10.ph_b')::uuid) then
    raise exception 'FAIL: phase not cascade-deleted on purge';
  end if;
  raise notice 'PASS: purge cascaded (job + phase gone)';
end $$;
