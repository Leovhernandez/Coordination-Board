-- ============================================================================
-- M22 photos RLS smoke-test — proves the member-side access model:
--   * any org member READS all org photos (owner + salesman, per M-VIS)
--   * photos are SERVER-WRITTEN: a member CANNOT insert/update/delete via the data
--     API (SELECT-only grant → 42501 at the privilege layer, like activity_log)
--   * TENANT ISOLATION: a member of org 1 reads NONE of org 2's photos
--   * realtime: photos is published + REPLICA IDENTITY FULL (live-refresh + DELETE
--     propagation, AGENTS §6)
--
-- Crew (participant) photo access is NOT exercised here: participants are not auth
-- users, so their path is the service-role server action (token -> participant ->
-- assigned phase), which bypasses RLS and is covered at the app layer.
--
-- SELF-CONTAINED: builds its own org(s) + salesmen + a job/phase/photo inside the
-- txn (reusing real auth.users only for the user_id FK), then exercises the REAL
-- engine as each member. Ids pass between role-switched blocks via txn-local GUCs.
--
-- HOW TO RUN (Supabase → SQL Editor or connector), per docs/RELEASE-CHECKLIST.md
-- Step 2 — paste in ONE run so nothing persists:
--   BEGIN;
--     -- paste 20260629180000_m22_photos.sql first, then this file
--   ROLLBACK;
--
-- PASS = every 'PASS:' notice prints and no exception is raised.
-- ============================================================================

-- ---- Setup as the table owner (bypasses RLS); stash ids in m22.* GUCs ----
do $$
declare
  v_owner uuid; v_a uuid; v_b uuid; v_owner2 uuid;
  v_org uuid; v_mo uuid; v_ma uuid; v_mb uuid;
  v_job_b uuid; v_ph_b uuid; v_photo_b uuid;
  v_org2 uuid; v_job2 uuid; v_photo2 uuid;
  v_pub int; v_relrep "char";
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
    raise exception 'M22 smoke needs a non-owner auth user for the test org owner';
  end if;
  if v_a is null or v_b is null then
    raise exception 'M22 smoke needs >= 3 distinct auth.users';
  end if;

  insert into organizations (name, owner_user_id, subscription_status)
    values ('M22 Test Co', v_owner, 'active') returning id into v_org;
  insert into org_members (org_id, user_id, email, name, role)
    values (v_org, v_owner, 'owner@m22.test', 'Owner', 'owner') returning id into v_mo;
  insert into org_members (org_id, user_id, email, name, role)
    values (v_org, v_a, 'a@m22.test', 'A', 'salesman') returning id into v_ma;
  insert into org_members (org_id, user_id, email, name, role)
    values (v_org, v_b, 'b@m22.test', 'B', 'salesman') returning id into v_mb;
  insert into jobs (org_id, name, salesman_member_id)
    values (v_org, 'Job B', v_mb) returning id into v_job_b;
  insert into phases (job_id, label, sequence_index)
    values (v_job_b, 'Demo B', 0) returning id into v_ph_b;
  insert into photos (job_id, phase_id, org_id, status_context, uploaded_by_member_id,
                      r2_key, content_type, byte_size)
    values (v_job_b, v_ph_b, v_org, 'blocked', v_mb,
            'org/'||v_org||'/job/'||v_job_b||'/m22-smoke-b.jpg', 'image/jpeg', 12345)
    returning id into v_photo_b;

  -- Optional 2nd org for tenant isolation (needs a 4th eligible owner user).
  select u.id into v_owner2
    from auth.users u
    where u.id not in (v_owner, v_a, v_b)
      and not exists (select 1 from organizations o where o.owner_user_id = u.id)
    order by u.created_at limit 1;
  if v_owner2 is not null then
    insert into organizations (name, owner_user_id, subscription_status)
      values ('M22 Other Co', v_owner2, 'active') returning id into v_org2;
    insert into jobs (org_id, name) values (v_org2, 'Other Job') returning id into v_job2;
    insert into photos (job_id, org_id, status_context, r2_key, content_type, byte_size)
      values (v_job2, v_org2, 'done',
              'org/'||v_org2||'/job/'||v_job2||'/m22-smoke-other.jpg', 'image/jpeg', 999)
      returning id into v_photo2;
    perform set_config('m22.photo_2', v_photo2::text, true);
  end if;

  -- Realtime correctness: published + REPLICA IDENTITY FULL.
  select count(*) into v_pub from pg_publication_tables
   where pubname='supabase_realtime' and schemaname='public' and tablename='photos';
  if v_pub <> 1 then raise exception 'FAIL: photos not in supabase_realtime publication'; end if;
  select relreplident into v_relrep from pg_class where oid='public.photos'::regclass;
  if v_relrep <> 'f' then raise exception 'FAIL: photos REPLICA IDENTITY is % (want f/full)', v_relrep; end if;
  raise notice 'PASS: photos published + REPLICA IDENTITY FULL';

  perform set_config('m22.owner_uid', v_owner::text,  true);
  perform set_config('m22.a_uid',     v_a::text,      true);
  perform set_config('m22.m_a',       v_ma::text,     true);
  perform set_config('m22.org',       v_org::text,    true);
  perform set_config('m22.job_b',     v_job_b::text,  true);
  perform set_config('m22.ph_b',      v_ph_b::text,   true);
  perform set_config('m22.photo_b',   v_photo_b::text, true);
end $$;

-- ---- Act as SALESMAN A (a different salesman, same org) ----
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('m22.a_uid'), 'role','authenticated')::text, true);
set local role authenticated;

do $$
declare v_other text;
begin
  -- 1) A READS B's photo (org-wide read).
  if (select count(*) from photos where id = current_setting('m22.photo_b')::uuid) <> 1 then
    raise exception 'FAIL: salesman A cannot read org photo';
  end if;
  raise notice 'PASS: salesman A reads org photo';

  -- 2) A CANNOT insert a photo (SELECT-only grant — writes are server-side).
  begin
    insert into photos (job_id, phase_id, org_id, status_context, uploaded_by_member_id,
                        r2_key, content_type, byte_size)
      values (current_setting('m22.job_b')::uuid, current_setting('m22.ph_b')::uuid,
              current_setting('m22.org')::uuid, 'done', current_setting('m22.m_a')::uuid,
              'org/hack/insert.jpg', 'image/jpeg', 1);
    raise exception 'FAIL: salesman A inserted a photo — server-only write breached';
  exception when insufficient_privilege then
    raise notice 'PASS: salesman A cannot insert a photo';
  end;

  -- 3) A CANNOT update a photo (no UPDATE grant → 42501).
  begin
    update photos set content_type='image/png' where id = current_setting('m22.photo_b')::uuid;
    raise exception 'FAIL: salesman A updated a photo — server-only write breached';
  exception when insufficient_privilege then
    raise notice 'PASS: salesman A cannot update a photo';
  end;

  -- 4) A CANNOT delete a photo (no DELETE grant → 42501).
  begin
    delete from photos where id = current_setting('m22.photo_b')::uuid;
    raise exception 'FAIL: salesman A deleted a photo — server-only write breached';
  exception when insufficient_privilege then
    raise notice 'PASS: salesman A cannot delete a photo';
  end;

  -- 5) TENANT ISOLATION: A reads NONE of org 2's photos (if the 2nd org was built).
  v_other := current_setting('m22.photo_2', true);
  if v_other is not null and v_other <> '' then
    if (select count(*) from photos where id = v_other::uuid) <> 0 then
      raise exception 'FAIL: salesman A read another org''s photo — tenant isolation breached';
    end if;
    raise notice 'PASS: salesman A cannot read another org''s photo';
  else
    raise notice 'SKIP: tenant-isolation check (need a 4th eligible auth user)';
  end if;
end $$;

-- ---- Act as the OWNER (reads org photos) ----
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('m22.owner_uid'), 'role','authenticated')::text, true);
set local role authenticated;

do $$
begin
  if (select count(*) from photos where id = current_setting('m22.photo_b')::uuid) <> 1 then
    raise exception 'FAIL: owner cannot read org photo';
  end if;
  raise notice 'PASS: owner reads org photo';
end $$;

reset role;
