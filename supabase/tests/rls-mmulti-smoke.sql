-- ============================================================================
-- M-MULTI RLS smoke-test — proves the phase_assignees junction's boundaries:
--   * any org member READS assignments org-wide (can_read_job);
--   * only a member who can EDIT the job writes them (can_access_job) — another
--     salesman's INSERT is rejected and their DELETE strips 0 rows;
--   * the org cap trigger REJECTS the (cap+1)th assignee;
--   * anon (the crew role) can touch nothing — crew go through the token-scoped
--     service-role path only, and NEVER self-assign.
--
-- SELF-CONTAINED like rls-mvis-smoke.sql: builds its own org (cap lowered to 2
-- so the cap case is cheap) + 2 salesmen + a job + phase + 3 participants inside
-- the transaction, reusing 3 real auth.users only for the user_id FKs. Ids pass
-- between role-switched blocks via transaction-local GUCs.
--
-- HOW TO RUN (Supabase → SQL Editor), per docs/RELEASE-CHECKLIST.md Step 2 —
-- paste in ONE run so nothing persists (migration already applied in prod, so
-- the file runs alone):
--   BEGIN;  <this file>  ROLLBACK;
--
-- PASS = every 'PASS:' notice prints and no exception is raised.
-- ============================================================================

-- ---- Setup as the table owner (bypasses RLS); stash ids in mm.* GUCs ----
do $$
declare
  v_owner uuid; v_a uuid; v_b uuid;
  v_org uuid; v_ma uuid; v_mb uuid;
  v_job uuid; v_ph uuid; v_p1 uuid; v_p2 uuid; v_p3 uuid;
begin
  select u.id into v_owner
    from auth.users u
    where not exists (select 1 from organizations o where o.owner_user_id = u.id)
    order by u.created_at limit 1;
  select id into v_a from auth.users where id <> v_owner order by created_at limit 1;
  select id into v_b from auth.users where id not in (v_owner, v_a) order by created_at limit 1;
  if v_owner is null then
    raise exception 'M-MULTI smoke needs a non-owner auth user for the test org owner';
  end if;
  if v_a is null or v_b is null then
    raise exception 'M-MULTI smoke needs >= 3 distinct auth.users';
  end if;

  -- Cap lowered to 2 so the "reject the (cap+1)th" case needs only 3 crew.
  insert into organizations (name, owner_user_id, subscription_status, max_assignees_per_phase)
    values ('MMULTI Test Co', v_owner, 'active', 2) returning id into v_org;
  insert into org_members (org_id, user_id, email, name, role)
    values (v_org, v_owner, 'owner@mm.test', 'Owner', 'owner');
  insert into org_members (org_id, user_id, email, name, role)
    values (v_org, v_a, 'a@mm.test', 'A', 'salesman') returning id into v_ma;
  insert into org_members (org_id, user_id, email, name, role)
    values (v_org, v_b, 'b@mm.test', 'B', 'salesman') returning id into v_mb;
  insert into jobs (org_id, name, salesman_member_id)
    values (v_org, 'Job B', v_mb) returning id into v_job;
  insert into phases (job_id, label, sequence_index)
    values (v_job, 'Demo', 0) returning id into v_ph;
  insert into participants (job_id, name, invite_token)
    values (v_job, 'Crew 1', 'mm-token-1') returning id into v_p1;
  insert into participants (job_id, name, invite_token)
    values (v_job, 'Crew 2', 'mm-token-2') returning id into v_p2;
  insert into participants (job_id, name, invite_token)
    values (v_job, 'Crew 3', 'mm-token-3') returning id into v_p3;

  -- Seed one assignment (as the engine's owner — mirrors the service path).
  insert into phase_assignees (phase_id, participant_id, job_id)
    values (v_ph, v_p1, v_job);

  perform set_config('mm.owner_uid', v_owner::text, true);
  perform set_config('mm.a_uid',     v_a::text,     true);
  perform set_config('mm.b_uid',     v_b::text,     true);
  perform set_config('mm.job',       v_job::text,   true);
  perform set_config('mm.ph',        v_ph::text,    true);
  perform set_config('mm.p1',        v_p1::text,    true);
  perform set_config('mm.p2',        v_p2::text,    true);
  perform set_config('mm.p3',        v_p3::text,    true);
end $$;

-- ---- Act as SALESMAN A (same org, does NOT own the job) ----
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('mm.a_uid'), 'role','authenticated')::text, true);
set local role authenticated;

do $$
declare v_n int;
begin
  -- 1) A READS assignments on B's job (org-wide read).
  if (select count(*) from phase_assignees
      where phase_id = current_setting('mm.ph')::uuid) <> 1 then
    raise exception 'FAIL: salesman A cannot read org assignments';
  end if;
  raise notice 'PASS: salesman A reads assignments org-wide';

  -- 2) A CANNOT INSERT an assignment on B's job (write isolation).
  begin
    insert into phase_assignees (phase_id, participant_id, job_id)
      values (current_setting('mm.ph')::uuid,
              current_setting('mm.p2')::uuid,
              current_setting('mm.job')::uuid);
    raise exception 'FAIL: salesman A assigned crew on B''s job — WRITE isolation breached';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS: salesman A cannot assign on B''s job (%)', sqlerrm;
  end;

  -- 3) A's DELETE strips 0 rows (cannot unassign on B's job).
  delete from phase_assignees
    where phase_id = current_setting('mm.ph')::uuid
      and participant_id = current_setting('mm.p1')::uuid;
  get diagnostics v_n = row_count;
  if v_n <> 0 then
    raise exception 'FAIL: salesman A removed an assignment on B''s job (% row)', v_n;
  end if;
  raise notice 'PASS: salesman A cannot unassign on B''s job';
end $$;

-- ---- Act as SALESMAN B (owns the job → full assignment control, capped) ----
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('mm.b_uid'), 'role','authenticated')::text, true);
set local role authenticated;

do $$
declare v_n int;
begin
  -- 4) B assigns a second crew member (within the cap of 2).
  insert into phase_assignees (phase_id, participant_id, job_id)
    values (current_setting('mm.ph')::uuid,
            current_setting('mm.p2')::uuid,
            current_setting('mm.job')::uuid);
  raise notice 'PASS: owning salesman assigns a co-assignee';

  -- 5) The cap trigger rejects the (cap+1)th assignee.
  begin
    insert into phase_assignees (phase_id, participant_id, job_id)
      values (current_setting('mm.ph')::uuid,
              current_setting('mm.p3')::uuid,
              current_setting('mm.job')::uuid);
    raise exception 'FAIL: cap trigger accepted the (cap+1)th assignee';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS: cap trigger rejected the (cap+1)th assignee (%)', sqlerrm;
  end;

  -- 6) B unassigns (DELETE strips exactly 1 row).
  delete from phase_assignees
    where phase_id = current_setting('mm.ph')::uuid
      and participant_id = current_setting('mm.p2')::uuid;
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'FAIL: owning salesman could not unassign (% rows)', v_n;
  end if;
  raise notice 'PASS: owning salesman unassigns';
end $$;

-- ---- Act as the OWNER (blanket can_access_job — writes anywhere in the org) ----
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('mm.owner_uid'), 'role','authenticated')::text, true);
set local role authenticated;

do $$
declare v_n int;
begin
  insert into phase_assignees (phase_id, participant_id, job_id)
    values (current_setting('mm.ph')::uuid,
            current_setting('mm.p2')::uuid,
            current_setting('mm.job')::uuid);
  delete from phase_assignees
    where phase_id = current_setting('mm.ph')::uuid
      and participant_id = current_setting('mm.p2')::uuid;
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'FAIL: owner cannot manage assignments (% rows)', v_n;
  end if;
  raise notice 'PASS: owner assigns/unassigns on a salesman job';
end $$;

-- ---- Act as ANON (crew role) — granted NOTHING on the junction ----
reset role;
set local role anon;

do $$
begin
  begin
    perform 1 from phase_assignees limit 1;
    raise exception 'FAIL: anon can read phase_assignees';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS: anon cannot read assignments (%)', sqlerrm;
  end;
  begin
    insert into phase_assignees (phase_id, participant_id, job_id)
      values (current_setting('mm.ph')::uuid,
              current_setting('mm.p1')::uuid,
              current_setting('mm.job')::uuid);
    raise exception 'FAIL: anon inserted an assignment — crew could self-assign';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS: anon cannot self-assign (%)', sqlerrm;
  end;
end $$;

reset role;
