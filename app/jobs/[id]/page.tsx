import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { participantLink } from "@/lib/participant";
import { Board } from "./Board";
import { Crew } from "./Crew";
import type { Job, Participant, Phase } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function JobBoardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireUser();

  const supabase = await createClient();
  const { data: jobData } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  const job = jobData as Job | null;
  if (!job) notFound(); // RLS returns null for jobs the owner doesn't own

  const { data: phasesData } = await supabase
    .from("phases")
    .select("*")
    .eq("job_id", id)
    .order("sequence_index", { ascending: true });
  const phases = (phasesData ?? []) as Phase[];

  const { data: participantsData } = await supabase
    .from("participants")
    .select("*")
    .eq("job_id", id)
    .eq("revoked", false)
    .order("created_at", { ascending: true });
  const participants = (participantsData ?? []) as Participant[];
  const crew = participants.map((p) => ({
    id: p.id,
    name: p.name,
    phone: p.phone,
    link: participantLink(id, p.invite_token),
  }));

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col gap-4 p-4">
      <header>
        <Link
          href="/dashboard"
          className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-medium text-slate-600 shadow-sm active:bg-slate-100"
        >
          ← Jobs
        </Link>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-slate-900">
          {job.name}
        </h1>
        {(job.customer_name || job.address) && (
          <p className="text-sm text-slate-500">
            {[job.customer_name, job.address].filter(Boolean).join(" · ")}
          </p>
        )}
      </header>

      <Board
        jobId={job.id}
        phases={phases}
        participants={participants.map((p) => ({ id: p.id, name: p.name }))}
      />

      <Crew jobId={job.id} crew={crew} />
    </main>
  );
}
