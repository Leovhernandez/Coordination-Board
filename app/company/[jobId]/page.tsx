import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getOverseenJob } from "@/lib/oversight";
import { ReadOnlyBoard } from "@/components/ReadOnlyBoard";

export const dynamic = "force-dynamic";

export default async function CompanyJobPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  const user = await requireUser();

  const result = await getOverseenJob(user.email, jobId);
  if (!result) notFound(); // not overseen by this user

  const { job, phases } = result;

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col gap-4 p-4">
      <header>
        <Link
          href="/dashboard"
          className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-medium text-slate-600 shadow-sm active:bg-slate-100"
        >
          ← Dashboard
        </Link>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-slate-900">
          {job.name}
        </h1>
        <p className="text-sm text-slate-500">
          Company view · read-only
          {job.customer_name ? ` · ${job.customer_name}` : ""}
        </p>
      </header>

      <ReadOnlyBoard phases={phases} />
    </main>
  );
}
