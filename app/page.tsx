import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center gap-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          Coordination Board
        </h1>
        <p className="text-base text-gray-600">
          One shared status board per job. Each trade taps{" "}
          <span className="font-medium">Done</span>,{" "}
          <span className="font-medium">In&nbsp;progress</span>, or{" "}
          <span className="font-medium">Blocked</span> — and the owner sees the
          one thing blocking the next phase.
        </p>
      </div>

      <Link
        href="/login"
        className="rounded-md bg-gray-900 px-4 py-3 text-center text-base font-semibold text-white active:bg-gray-700"
      >
        Owner sign in
      </Link>

      <Link
        href="/health"
        className="text-sm font-medium text-blue-600 underline underline-offset-4"
      >
        View health check →
      </Link>
    </main>
  );
}
