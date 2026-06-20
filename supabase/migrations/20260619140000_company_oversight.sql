-- M8.5: company oversight (read-only roll-up) + trial end dates.
-- Additive only — no existing tables/policies changed.

-- Owner email on the org so we can link by email without touching auth.users.
alter table organizations add column if not exists owner_email   text;
alter table organizations add column if not exists trial_ends_at timestamptz;
create index if not exists organizations_owner_email_idx
  on organizations (lower(owner_email));

-- Backfill owner_email for existing orgs (migration runs with auth.users access).
update organizations o
  set owner_email = u.email
  from auth.users u
  where u.id = o.owner_user_id and o.owner_email is null;

-- A company owner (overseer_email) may read the jobs of each listed GC
-- (gc_email). Admin-managed; read happens server-side via the service role.
create table if not exists company_oversight (
  overseer_email text not null,
  gc_email       text not null,
  created_at     timestamptz not null default now(),
  primary key (overseer_email, gc_email)
);

alter table company_oversight enable row level security;
-- Only the service role touches this (no anon/authenticated policies).
grant select, insert, update, delete on company_oversight to service_role;
