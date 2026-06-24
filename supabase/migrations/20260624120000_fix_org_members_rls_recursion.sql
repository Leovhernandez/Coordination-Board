-- ============================================================================
-- Fix: infinite RLS recursion introduced by M14 (20260622120000_multi_seat_orgs)
--
-- M14 added organizations."member reads own org", which subqueries org_members;
-- org_members."owner manages org members" subqueries organizations. That mutual
-- reference makes Postgres raise "infinite recursion detected in policy for
-- relation organizations" on EVERY organizations query. getOrCreateOrg() then
-- returned null and the dashboard bounced the owner to a clean /login — sign-in
-- appeared broken even though the session was established.
--
-- Breaking ONE edge of the cycle is enough: drop the organizations->org_members
-- policy. The remaining policies no longer form a cycle, so every query
-- terminates. Salesmen can't read the org row yet, but the M14 app layer
-- (salesman sign-in) isn't built, so nothing depends on it. It will be
-- reintroduced via a SECURITY DEFINER helper (which bypasses RLS and so cannot
-- recurse) when the M14 app layer is built and verified on a preview deploy.
-- ============================================================================

drop policy if exists "member reads own org" on organizations;
