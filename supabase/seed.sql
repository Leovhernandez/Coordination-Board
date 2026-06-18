-- ============================================================================
-- Coordination Board — seed: one real Four L job with default phases.
--
-- DEPENDENCY: an organization is owned by a Supabase auth user, and auth users
-- are created on first magic-link login (M2). So this seed keys off the owner's
-- email and is a no-op until that user has signed in at least once.
--
-- Set the email below to the Four L owner's login email, then run this against
-- the database (Supabase SQL editor, or `supabase db reset` which runs seeds).
-- Idempotent: re-running will not duplicate the org, job, or phases.
-- ============================================================================

do $$
declare
  v_owner_email text := 'ninihernandez@hotmail.com'; -- <-- Four L owner login email
  v_user_id uuid;
  v_org_id  uuid;
  v_job_id  uuid;
  -- Default trade phases, in order (editable by the owner later).
  v_phases  text[] := array['Demo', 'Rough-in', 'Inspection', 'Finish'];
  v_label   text;
  v_idx     int := 0;
begin
  select id into v_user_id from auth.users where email = v_owner_email;
  if v_user_id is null then
    raise notice 'No auth user for %, skipping seed. Log in once (M2) then re-run.', v_owner_email;
    return;
  end if;

  -- Org (one per owner).
  select id into v_org_id from organizations where owner_user_id = v_user_id;
  if v_org_id is null then
    insert into organizations (name, owner_user_id, subscription_status)
    values ('Four L', v_user_id, 'active')
    returning id into v_org_id;
  end if;

  -- Job (idempotent by name within the org).
  select id into v_job_id from jobs where org_id = v_org_id and name = 'Pilot Job';
  if v_job_id is null then
    insert into jobs (org_id, name, address, customer_name, status)
    values (v_org_id, 'Pilot Job', null, null, 'active')
    returning id into v_job_id;

    foreach v_label in array v_phases loop
      insert into phases (job_id, label, sequence_index, status)
      values (v_job_id, v_label, v_idx, 'not_started');
      v_idx := v_idx + 1;
    end loop;
  end if;

  raise notice 'Seed complete: org %, job %.', v_org_id, v_job_id;
end $$;
