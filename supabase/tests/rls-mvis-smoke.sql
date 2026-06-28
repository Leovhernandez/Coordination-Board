-- ============================================================================
-- M-VIS RLS smoke-test — proves company-wide READ with restricted WRITE, and
-- that crew tokens stay private. SELF-CONTAINED: creates its own org + 2 salesmen
-- + jobs + phase + participant inside the transaction (reusing 3 real auth.users
-- only to satisfy the user_id FK), then exercises the REAL engine as each member.
--
-- Ids are passed between the role-switched blocks via transaction-local custom
-- GUCs (set_config/current_setting) — NOT a temp table, which a SET ROLE'd
-- `authenticated` session can't reliably see.
--
-- HOW TO RUN (Supabase → SQL Editor), per docs/RELEASE-CHECKLIST.md Step 2 — paste
-- in ONE run so nothing persists:
--   BEGIN;
--     -- paste 20260628120000_mvis_company_read.sql first, then this file
--   ROLLBACK;
--
-- PASS = every 'PASS:' notice prints and no exception is raised.
-- ============================================================================

-- ---- Setup as the table owner (bypasses RLS); stash ids in mvis.* GUCs ----
do $$
declare
  v_owner uuid; v_a uuid; v_b uuid;
  v_org uuid; v_ma uuid; v_mb uuid;
  v_job_a uuid; v_job_b uuid; v_ph_b uuid; v_part_b uuid;
begin
  -- The test org's owner must be an auth user that does NOT already own an org
  -- (organizations.owner_user_id is UNIQUE — one org per user). Salesmen qualify.
  select u.id into v_owner
    from auth.users u
    where not exists (select 1 from organizations o where o.owner_user_id = u.id)
    order by u.created_at limit 1;
  -- A and B: any two other distinct auth users (used only as org_members; the FK
  -- needs real users, and membership — not ownership — drives the checks below).
  select id into v_a from auth.users where id <> v_owner order by created_at limit 1;
  select id into v_b from auth.users where id not in (v_owner, v_a) order by created_at limit 1;
  if v_owner is null then
    raise exception 'M-VIS smoke needs a non-owner auth user (a salesman) for the test org owner';
  end if;
  if v_a is null or v_b is null then
    raise exception 'M-VIS smoke needs >= 3 distinct auth.users';
  end if;

  insert into organizations (name, owner_user_id, subscription_status)
    values ('MVIS Test Co', v_owner, 'active') returning id into v_org;
  insert into org_members (org_id, user_id, email, name, role)
    values (v_org, v_owner, 'owner@mvis.test', 'Owner', 'owner');
  insert into org_members (org_id, user_id, email, name, role)
    values (v_org, v_a, 'a@mvis.test', 'A', 'salesman') returning id into v_ma;
  insert into org_members (org_id, user_id, email, name, role)
    values (v_org, v_b, 'b@mvis.test', 'B', 'salesman') returning id into v_mb;
  insert into jobs (org_id, name, salesman_member_id)
    values (v_org, 'Job A', v_ma) returning id into v_job_a;
  insert into jobs (org_id, name, salesman_member_id)
    values (v_org, 'Job B', v_mb) returning id into v_job_b;
  insert into phases (job_id, label, sequence_index)
    values (v_job_b, 'Demo', 0) returning id into v_ph_b;
  insert into participants (job_id, name, invite_token)
    values (v_job_b, 'Crew B', 'mvis-secret-token') returning id into v_part_b;

  perform set_config('mvis.owner_uid', v_owner::text, true);
  perform set_config('mvis.a_uid',     v_a::text,     true);
  perform set_config('mvis.job_b',     v_job_b::text, true);
  perform set_config('mvis.ph_b',      v_ph_b::text,  true);
  perform set_config('mvis.part_b',    v_part_b::text, true);
end $$;

-- ---- Act as SALESMAN A (a DIFFERENT salesman than B, same org) ----
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('mvis.a_uid'), 'role','authenticated')::text, true);
set local role authenticated;

do $$
declare v_upd int;
begin
  -- 1) A can READ B's job (M-VIS company-wide read).
  if (select count(*) from jobs where id = current_setting('mvis.job_b')::uuid) <> 1 then
    raise exception 'FAIL: salesman A cannot read salesman B''s job';
  end if;
  raise notice 'PASS: salesman A reads B''s job (company-wide read)';

  -- 2) A can READ B's phases.
  if (select count(*) from phases where id = current_setting('mvis.ph_b')::uuid) <> 1 then
    raise exception 'FAIL: salesman A cannot read B''s phases';
  end if;
  raise notice 'PASS: salesman A reads B''s phases';

  -- 3) A CANNOT UPDATE B's phase (write isolation).
  update phases set label = 'HACKED' where id = current_setting('mvis.ph_b')::uuid;
  get diagnostics v_upd = row_count;
  if v_upd <> 0 then
    raise exception 'FAIL: salesman A updated B''s phase (% row) — WRITE isolation breached', v_upd;
  end if;
  raise notice 'PASS: salesman A cannot edit B''s phase';

  -- 4) A CANNOT read B's crew participant/token (secret stays private).
  if (select count(*) from participants where id = current_setting('mvis.part_b')::uuid) <> 0 then
    raise exception 'FAIL: salesman A can read B''s crew token — SECRET leaked';
  end if;
  raise notice 'PASS: salesman A cannot see B''s crew token';
end $$;

-- ---- Act as the OWNER (can do everything) ----
reset role;  -- back to a role allowed to change the claims GUC
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('mvis.owner_uid'), 'role','authenticated')::text, true);
set local role authenticated;

do $$
declare v_upd int;
begin
  if (select count(*) from jobs where id = current_setting('mvis.job_b')::uuid) <> 1 then
    raise exception 'FAIL: owner cannot read a salesman job';
  end if;
  if (select count(*) from participants where id = current_setting('mvis.part_b')::uuid) <> 1 then
    raise exception 'FAIL: owner cannot read a crew participant';
  end if;
  update phases set label = 'Demo' where id = current_setting('mvis.ph_b')::uuid;
  get diagnostics v_upd = row_count;
  if v_upd <> 1 then
    raise exception 'FAIL: owner cannot edit a salesman phase (% rows)', v_upd;
  end if;
  raise notice 'PASS: owner reads all jobs+phases+crew and edits all';
end $$;

reset role;
