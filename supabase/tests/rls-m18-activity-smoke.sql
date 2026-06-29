-- ============================================================================
-- M18 activity_log RLS smoke-test — proves the log is org-readable but
-- APPEND-ONLY / server-written:
--   * any org member READS their org's activity
--   * a member CANNOT insert/update/delete log rows via the data API
--     (deny-by-default — only the service-role server actions append)
--
-- SELF-CONTAINED: builds its own org + 2 salesmen + a job/phase + one log row
-- inside the txn (reusing 3 real auth.users only for the user_id FK), then
-- exercises the REAL engine as each member. Ids pass via txn-local GUCs.
--
-- HOW TO RUN (Supabase → SQL Editor), per docs/RELEASE-CHECKLIST.md Step 2 — paste
-- in ONE run so nothing persists:
--   BEGIN;
--     -- paste 20260629140000_m18_activity_log.sql first, then this file
--   ROLLBACK;
--
-- PASS = every 'PASS:' notice prints and no exception is raised.
-- ============================================================================

-- ---- Setup as the table owner (bypasses RLS); stash ids in m18.* GUCs ----
do $$
declare
  v_owner uuid; v_a uuid; v_b uuid;
  v_org uuid; v_mo uuid; v_ma uuid; v_mb uuid;
  v_job_b uuid; v_ph_b uuid; v_log_b uuid;
begin
  select u.id into v_owner
    from auth.users u
    where not exists (select 1 from organizations o where o.owner_user_id = u.id)
    order by u.created_at limit 1;
  select id into v_a from auth.users where id <> v_owner order by created_at limit 1;
  select id into v_b from auth.users where id not in (v_owner, v_a) order by created_at limit 1;
  if v_owner is null then
    raise exception 'M18 smoke needs a non-owner auth user for the test org owner';
  end if;
  if v_a is null or v_b is null then
    raise exception 'M18 smoke needs >= 3 distinct auth.users';
  end if;

  insert into organizations (name, owner_user_id, subscription_status)
    values ('M18 Test Co', v_owner, 'active') returning id into v_org;
  insert into org_members (org_id, user_id, email, name, role)
    values (v_org, v_owner, 'owner@m18.test', 'Owner', 'owner') returning id into v_mo;
  insert into org_members (org_id, user_id, email, name, role)
    values (v_org, v_a, 'a@m18.test', 'A', 'salesman') returning id into v_ma;
  insert into org_members (org_id, user_id, email, name, role)
    values (v_org, v_b, 'b@m18.test', 'B', 'salesman') returning id into v_mb;
  insert into jobs (org_id, name, salesman_member_id)
    values (v_org, 'Job B', v_mb) returning id into v_job_b;
  insert into phases (job_id, label, sequence_index)
    values (v_job_b, 'Demo B', 0) returning id into v_ph_b;
  insert into activity_log (job_id, phase_id, event_type, actor_member_id, detail)
    values (v_job_b, v_ph_b, 'status_change', v_mb,
            '{"from":"not_started","to":"in_progress"}'::jsonb)
    returning id into v_log_b;

  perform set_config('m18.owner_uid', v_owner::text, true);
  perform set_config('m18.a_uid',     v_a::text,     true);
  perform set_config('m18.m_a',       v_ma::text,    true);
  perform set_config('m18.job_b',     v_job_b::text, true);
  perform set_config('m18.ph_b',      v_ph_b::text,  true);
  perform set_config('m18.log_b',     v_log_b::text, true);
end $$;

-- ---- Act as SALESMAN A (a different salesman, same org) ----
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('m18.a_uid'), 'role','authenticated')::text, true);
set local role authenticated;

do $$
begin
  -- 1) A READS B's activity (org-wide read).
  if (select count(*) from activity_log where id = current_setting('m18.log_b')::uuid) <> 1 then
    raise exception 'FAIL: salesman A cannot read org activity';
  end if;
  raise notice 'PASS: salesman A reads org activity';

  -- 2) A CANNOT insert a log row (append-only — members have no write grant).
  begin
    insert into activity_log (job_id, phase_id, event_type, actor_member_id, detail)
      values (current_setting('m18.job_b')::uuid, current_setting('m18.ph_b')::uuid,
              'status_change', current_setting('m18.m_a')::uuid, '{}'::jsonb);
    raise exception 'FAIL: salesman A inserted a log row — append-only breached';
  exception when insufficient_privilege then
    raise notice 'PASS: salesman A cannot insert a log row';
  end;

  -- 3) A CANNOT update a log row (no UPDATE grant → 42501 permission denied,
  --    raised at the privilege layer before RLS — a stronger guarantee than RLS
  --    silently returning 0 rows).
  begin
    update activity_log set detail = '{"tampered":true}'::jsonb
      where id = current_setting('m18.log_b')::uuid;
    raise exception 'FAIL: salesman A updated a log row — append-only breached';
  exception when insufficient_privilege then
    raise notice 'PASS: salesman A cannot update a log row';
  end;

  -- 4) A CANNOT delete a log row (no DELETE grant → 42501 permission denied).
  begin
    delete from activity_log where id = current_setting('m18.log_b')::uuid;
    raise exception 'FAIL: salesman A deleted a log row — append-only breached';
  exception when insufficient_privilege then
    raise notice 'PASS: salesman A cannot delete a log row';
  end;
end $$;

-- ---- Act as the OWNER (reads org activity) ----
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('m18.owner_uid'), 'role','authenticated')::text, true);
set local role authenticated;

do $$
begin
  if (select count(*) from activity_log where id = current_setting('m18.log_b')::uuid) <> 1 then
    raise exception 'FAIL: owner cannot read org activity';
  end if;
  raise notice 'PASS: owner reads org activity';
end $$;

reset role;
