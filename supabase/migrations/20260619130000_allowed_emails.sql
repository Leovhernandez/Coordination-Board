-- M8 (optional access control): an email allowlist for closing open sign-ups.
-- Only enforced when the server env SIGNUP_MODE=allowlist. The list is read
-- server-side via the service-role client during login; manage it by adding
-- rows here (Supabase Table editor) — no admin UI needed.

create table allowed_emails (
  email      text primary key, -- store lowercase
  note       text,
  created_at timestamptz not null default now()
);

alter table allowed_emails enable row level security;
-- No policies: anon/authenticated get nothing. Only service_role reads it.
grant select, insert, update, delete on allowed_emails to service_role;
