import Link from "next/link";
import { getDictionary } from "@/lib/i18n/server";

const PREVIEW: { label: string; dot: string }[] = [
  { label: "Demo", dot: "bg-emerald-500" },
  { label: "Rough-in", dot: "bg-amber-400" },
  { label: "Inspection", dot: "bg-red-500" },
  { label: "Finish", dot: "bg-slate-300" },
];

export default async function Home() {
  const t = await getDictionary();
  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center gap-7 p-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Coordination Board
        </h1>
        <p className="text-base text-slate-600">{t.landing.tagline}</p>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {PREVIEW.map((p) => (
          <div key={p.label} className="flex items-center gap-2.5 text-sm">
            <span className={`h-2.5 w-2.5 rounded-full ${p.dot}`} />
            <span className="text-slate-700">{p.label}</span>
          </div>
        ))}
      </div>

      <Link
        href="/login"
        className="rounded-lg bg-slate-900 px-4 py-3 text-center text-base font-semibold text-white active:bg-slate-700"
      >
        {t.auth.ownerSignIn}
      </Link>

      <Link
        href="/health"
        className="text-center text-sm font-medium text-slate-400 hover:text-slate-600"
      >
        {t.landing.healthCheck}
      </Link>
    </main>
  );
}
