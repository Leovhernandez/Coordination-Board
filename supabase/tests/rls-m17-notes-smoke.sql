-- ============================================================================
-- M17 phase-notes RLS smoke-test — proves the member-side visibility matrix:
--   * any org member READS all org notes (member- AND crew-authored)
--   * NO ONE edits another person's note (not even the owner)
--   * a salesman is read-only on another salesman's job (cannot add notes there)
--   * a member CAN add their own note on a job they can edit
--
-- Crew (participant) note access is NOT exercised here: participants are not auth
-- users, so their path is the service-role server action (token -> participant ->
-- assigned phase), which bypasses RLS and is covered at the app layer.
--
-- SELF-CONTAINED: builds its own org + 2 salesmen + jobs/phases/notes inside the
-- txn (reusing 3 real auth.users only for the user_id FK), then exercises the REAL
-- engine as each member. Ids pass between role-switched blocks via txn-local GUCs.
--
-- HOW TO RUN (Supabase → SQL Editor), per docs/RELEASE-CHECKLIST.md Step 2 — paste
-- in ONE run so nothing persists:
--   BEGIN;
--     -- paste 20260629120000_m17_phase_notes.sql first, then this file
--   ROLLBACK;
--
-- PASS = every 'PASS:' notice prints and no exception is raised.
-- ============================================================================

-- ---- Setup as the table owner (bypasses RLS); stash ids in m17.* GUCs ----
do $$
declare
  v_owner uuid; v_a uuid; v_b uuid;
  v_org uuid; v_mo uuid; v_ma uuid; v_mb uuid;
  v_job_a uuid; v_job_b uuid; v_job_o uuid;
  v_ph_a uuid; v_ph_b uuid; v_ph_o uuid;
  v_part_b uuid; v_note_b_member uuid; v_note_b_crew uuid;
begin
  -- Org owner must be an auth user that does NOT already own an org
  -- (organizations.owner_user_id is UNIQUE). Two more for the salesmen.
  select u.id into v_owner
    from auth.users u
    where not exists (select 1 from organizations o where o.owner_user_id = u.id)
    order by u.created_at limit 1;
  select id into v_a from auth.users where id <> v_owner order by created_at limit 1;
  select id into v_b from auth.users where id not in (v_owner, v_a) order by created_at limit 1;
  if v_owner is null then
    raise exception 'M17 smoke needs a non-owner auth user for the test org owner';
  end if;
  if v_a is null or v_b is null then
    raise exception 'M17 smoke needs >= 3 distinct auth.users';
  end if;

  insert into organizations (name, owner_user_id, subscription_status)
    values ('M17 Test Co', v_owner, 'active') returning id into v_org;
  insert into org_members (org_id, user_id, email, name, role)
    values (v_org, v_owner, 'owner@m17.test', 'Owner', 'owner') returning id into v_mo;
  insert into org_members (org_id, user_id, email, name, role)
    values (v_org, v_a, 'a@m17.test', 'A', 'salesman') returning id into v_ma;
  insert into org_members (org_id, user_id, email, name, role)
    values (v_org, v_b, 'b@m17.test', 'B', 'salesman') returning id into v_mb;

  insert into jobs (org_id, name, salesman_member_id)
    values (v_org, 'Job A', v_ma) returning id into v_job_a;
  insert into jobs (org_id, name, salesman_member_id)
    values (v_org, 'Job B', v_mb) returning id into v_job_b;
  -- A job OWNED BY THE OWNER (R2: the owner can add notes only on jobs they own).
  insert into jobs (org_id, name, salesman_member_id)
    values (v_org, 'Owner Job', v_mo) returning id into v_job_o;
  insert into phases (job_id, label, sequence_index)
    values (v_job_a, 'Demo A', 0) returning id into v_ph_a;
  insert into phases (job_id, label, sequence_index)
    values (v_job_b, 'Demo B', 0) returning id into v_ph_b;
  insert into phases (job_id, label, sequence_index)
    values (v_job_o, 'Demo O', 0) returning id into v_ph_o;

  -- A member note authored by B, and a crew note (participant author) — both on B's job.
  insert into notes (phase_id, job_id, author_member_id, body)
    values (v_ph_b, v_job_b, v_mb, 'B member note') returning id into v_note_b_member;
  insert into participants (job_id, name, invite_token)
    values (v_job_b, 'Crew B', 'm17-secret-token') returning id into v_part_b;
  insert into notes (phase_id, job_id, author_participant_id, body)
    values (v_ph_b, v_job_b, v_part_b, 'gate code 1234') returning id into v_note_b_crew;

  perform set_config('m17.owner_uid',     v_owner::text,        true);
  perform set_config('m17.a_uid',         v_a::text,            true);
  perform set_config('m17.m_owner',       v_mo::text,           true);
  perform set_config('m17.m_a',           v_ma::text,           true);
  perform set_config('m17.job_a',         v_job_a::text,        true);
  perform set_config('m17.ph_a',          v_ph_a::text,         true);
  perform set_config('m17.job_b',         v_job_b::text,        true);
  perform set_config('m17.ph_b',          v_ph_b::text,         true);
  perform set_config('m17.job_o',         v_job_o::text,        true);
  perform set_config('m17.ph_o',          v_ph_o::text,         true);
  perform set_config('m17.note_b_member', v_note_b_member::text, true);
  perform set_config('m17.note_b_crew',   v_note_b_crew::text,   true);
end $$;

-- ---- Act as SALESMAN A (different salesman than B, same org) ----
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('m17.a_uid'), 'role','authenticated')::text, true);
set local role authenticated;

do $$
declare v_n int;
begin
  -- 1) A READS B's member note (company-wide read).
  if (select count(*) from notes where id = current_setting('m17.note_b_member')::uuid) <> 1 then
    raise exception 'FAIL: salesman A cannot read B''s member note';
  end if;
  raise notice 'PASS: salesman A reads B''s member note';

  -- 2) A READS B's crew note (members read crew notes).
  if (select count(*) from notes where id = current_setting('m17.note_b_crew')::uuid) <> 1 then
    raise exception 'FAIL: salesman A cannot read B''s crew note';
  end if;
  raise notice 'PASS: salesman A reads B''s crew note';

  -- 3) A CANNOT edit B's member note (0 rows — edit only your own).
  update notes set body = 'HACKED' where id = current_setting('m17.note_b_member')::uuid;
  get diagnostics v_n = row_count;
  if v_n <> 0 then
    raise exception 'FAIL: salesman A edited B''s member note (% row) — WRITE isolation breached', v_n;
  end if;
  raise notice 'PASS: salesman A cannot edit B''s member note';

  -- 4) A CANNOT edit B's crew note (0 rows).
  update notes set body = 'HACKED' where id = current_setting('m17.note_b_crew')::uuid;
  get diagnostics v_n = row_count;
  if v_n <> 0 then
    raise exception 'FAIL: salesman A edited B''s crew note (% row)', v_n;
  end if;
  raise notice 'PASS: salesman A cannot edit B''s crew note';

  -- 5) A CANNOT add a note on B's job (read-only on another salesman's job).
  begin
    insert into notes (phase_id, job_id, author_member_id, body)
      values (current_setting('m17.ph_b')::uuid, current_setting('m17.job_b')::uuid,
              current_setting('m17.m_a')::uuid, 'A trespassing');
    raise exception 'FAIL: salesman A added a note to B''s job — WRITE isolation breached';
  exception when insufficient_privilege then
    raise notice 'PASS: salesman A cannot add a note to B''s job';
  end;

  -- 6) A CAN add their own note on their OWN job.
  insert into notes (phase_id, job_id, author_member_id, body)
    values (current_setting('m17.ph_a')::uuid, current_setting('m17.job_a')::uuid,
            current_setting('m17.m_a')::uuid, 'A own note');
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'FAIL: salesman A cannot add a note to their own job (% rows)', v_n;
  end if;
  raise notice 'PASS: salesman A adds own note on own job';
end $$;

-- ---- Act as the OWNER (reads all; edits only own) ----
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('m17.owner_uid'), 'role','authenticated')::text, true);
set local role authenticated;

do $$
declare v_n int;
begin
  -- 7) Owner READS B's member note.
  if (select count(*) from notes where id = current_setting('m17.note_b_member')::uuid) <> 1 then
    raise exception 'FAIL: owner cannot read a salesman note';
  end if;
  raise notice 'PASS: owner reads salesman notes';

  -- 8) Owner CANNOT edit B's note (owner edits only their OWN notes).
  update notes set body = 'OWNER EDIT' where id = current_setting('m17.note_b_member')::uuid;
  get diagnostics v_n = row_count;
  if v_n <> 0 then
    raise exception 'FAIL: owner edited a salesman''s note (% row) — edit-own-only breached', v_n;
  end if;
  raise notice 'PASS: owner cannot edit a salesman''s note';

  -- 9) Owner CANNOT add a note on a salesman's job (R2: read-only on others' jobs).
  begin
    insert into notes (phase_id, job_id, author_member_id, body)
      values (current_setting('m17.ph_b')::uuid, current_setting('m17.job_b')::uuid,
              current_setting('m17.m_owner')::uuid, 'owner trespassing on B job');
    raise exception 'FAIL: owner added a note on a salesman job — R2 read-only breached';
  exception when insufficient_privilege then
    raise notice 'PASS: owner cannot add a note on a salesman job';
  end;

  -- 10) Owner CAN add a note on a job they OWN.
  insert into notes (phase_id, job_id, author_member_id, body)
    values (current_setting('m17.ph_o')::uuid, current_setting('m17.job_o')::uuid,
            current_setting('m17.m_owner')::uuid, 'owner note on own job');
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'FAIL: owner cannot add a note on their own job (% rows)', v_n;
  end if;
  raise notice 'PASS: owner adds own note on own job';
end $$;

reset role;
