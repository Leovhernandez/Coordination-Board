import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Board } from "./Board";
import type { Job, Phase } from "@/lib/types";

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

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col gap-4 p-4">
      <header>
        <Link
          href="/dashboard"
          className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-700"
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

      <Board jobId={job.id} phases={phases} />
    </main>
  );
}
