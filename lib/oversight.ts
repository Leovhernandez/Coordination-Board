import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import type { Job, Phase } from "@/lib/types";

// Company owner (overseer) read-only roll-up. Access is verified here, then
// the linked GCs' data is read via the service role. No RLS changes; overseers
// have no write path anywhere.

export type OverseenOrg = {
  orgId: string;
  orgName: string;
  ownerEmail: string;
  jobs: Job[];
  phasesByJob: Map<string, Phase[]>;
};

/** Resolves the orgs a company owner oversees (by the GC emails you linked). */
async function overseenOrgIds(overseerEmail: string): Promise<
  { id: string; name: string; owner_email: string }[]
> {
  const svc = createServiceClient();
  const { data: links } = await svc
    .from("company_oversight")
    .select("gc_email")
    .eq("overseer_email", overseerEmail.toLowerCase());
  const gcEmails = (links ?? []).map((l) => l.gc_email.toLowerCase());
  if (gcEmails.length === 0) return [];

  const { data: orgs } = await svc
    .from("organizations")
    .select("id, name, owner_email")
    .in("owner_email", gcEmails);
  return (orgs ?? []) as { id: string; name: string; owner_email: string }[];
}

/** Full read-only roll-up (orgs + their active jobs + phases) for an overseer. */
export async function getOverseenCompany(
  overseerEmail: string | null | undefined,
): Promise<OverseenOrg[]> {
  if (!overseerEmail) return [];
  const orgs = await overseenOrgIds(overseerEmail);
  if (orgs.length === 0) return [];

  const svc = createServiceClient();
  const orgIds = orgs.map((o) => o.id);
  const { data: jobsData } = await svc
    .from("jobs")
    .select("*")
    .in("org_id", orgIds)
    .eq("status", "active")
    .order("created_at", { ascending: false });
  const jobs = (jobsData ?? []) as Job[];

  const jobIds = jobs.map((j) => j.id);
  const { data: phasesData } = jobIds.length
    ? await svc
        .from("phases")
        .select("*")
        .in("job_id", jobIds)
        .order("sequence_index", { ascending: true })
    : { data: [] as Phase[] };
  const phases = (phasesData ?? []) as Phase[];

  const phasesByJob = new Map<string, Phase[]>();
  for (const p of phases) {
    const list = phasesByJob.get(p.job_id) ?? [];
    list.push(p);
    phasesByJob.set(p.job_id, list);
  }

  return orgs.map((o) => {
    const orgJobs = jobs.filter((j) => j.org_id === o.id);
    const map = new Map<string, Phase[]>();
    for (const j of orgJobs) map.set(j.id, phasesByJob.get(j.id) ?? []);
    return {
      orgId: o.id,
      orgName: o.name,
      ownerEmail: o.owner_email,
      jobs: orgJobs,
      phasesByJob: map,
    };
  });
}

/** Returns a job + phases ONLY if the overseer oversees its org; else null. */
export async function getOverseenJob(
  overseerEmail: string | null | undefined,
  jobId: string,
): Promise<{ job: Job; phases: Phase[] } | null> {
  if (!overseerEmail) return null;
  const svc = createServiceClient();

  const { data: jobData } = await svc
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  const job = jobData as Job | null;
  if (!job) return null;

  const { data: org } = await svc
    .from("organizations")
    .select("owner_email")
    .eq("id", job.org_id)
    .maybeSingle();
  if (!org?.owner_email) return null;

  const { data: link } = await svc
    .from("company_oversight")
    .select("overseer_email")
    .eq("overseer_email", overseerEmail.toLowerCase())
    .eq("gc_email", org.owner_email.toLowerCase())
    .maybeSingle();
  if (!link) return null;

  const { data: phasesData } = await svc
    .from("phases")
    .select("*")
    .eq("job_id", jobId)
    .order("sequence_index", { ascending: true });
  return { job, phases: (phasesData ?? []) as Phase[] };
}
