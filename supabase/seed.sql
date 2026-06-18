-- ============================================================================
-- Coordination Board — seed: one Four L pilot job with default phases.
--
-- Plain SQL, idempotent (safe to re-run). Paste the whole file and run once.
--
-- DEPENDENCY: an org is owned by a Supabase auth user, and auth users are
-- created on first magic-link login (M2). This keys off the owner's email, so
-- it is a no-op (0 rows) until that user has signed in at least once.
--
-- Set the email below to the owner's login email before running.
-- ============================================================================

-- 1) Org for the owner (only if they exist and don't already have one).
insert into organizations (name, owner_user_id, subscription_status)
select 'Four L', u.id, 'active'
from auth.users u
where u.email = 'ninihernandez@hotmail.com'
  and not exists (select 1 from organizations o where o.owner_user_id = u.id);

-- 2) Pilot job (only if not already created).
insert into jobs (org_id, name, status)
select o.id, 'Pilot Job', 'active'
from organizations o
join auth.users u on u.id = o.owner_user_id
where u.email = 'ninihernandez@hotmail.com'
  and not exists (
    select 1 from jobs j where j.org_id = o.id and j.name = 'Pilot Job'
  );

-- 3) Default trade phases in sequence (only if the job has none yet).
insert into phases (job_id, label, sequence_index)
select j.id, p.label, p.idx
from jobs j
join organizations o on o.id = j.org_id
join auth.users u on u.id = o.owner_user_id
cross join (values
  ('Demo', 0), ('Rough-in', 1), ('Inspection', 2), ('Finish', 3)
) as p(label, idx)
where u.email = 'ninihernandez@hotmail.com'
  and j.name = 'Pilot Job'
  and not exists (select 1 from phases ph where ph.job_id = j.id);
