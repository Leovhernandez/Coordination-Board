// Health page (M0): confirms the app boots and reports whether each required
// environment variable is PRESENT. It never prints secret values.
export const dynamic = "force-dynamic";

function present(value: string | undefined): boolean {
  return Boolean(value && value.length > 0);
}

export default function HealthPage() {
  const checks = [
    {
      key: "NEXT_PUBLIC_SUPABASE_URL",
      ok: present(process.env.NEXT_PUBLIC_SUPABASE_URL),
    },
    {
      key: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      ok: present(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    },
    {
      key: "SUPABASE_SERVICE_ROLE_KEY",
      ok: present(process.env.SUPABASE_SERVICE_ROLE_KEY),
    },
    {
      key: "NEXT_PUBLIC_SITE_URL",
      ok: present(process.env.NEXT_PUBLIC_SITE_URL),
    },
  ];

  const allOk = checks.every((c) => c.ok);

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Health</h1>
        <p className="text-sm text-gray-500">Coordination Board — M0 scaffold</p>
      </header>

      <div
        className={`rounded-lg border p-4 text-sm font-medium ${
          allOk
            ? "border-green-300 bg-green-50 text-green-800"
            : "border-amber-300 bg-amber-50 text-amber-800"
        }`}
      >
        {allOk
          ? "App is running and all environment variables are present."
          : "App is running, but some environment variables are missing. Copy .env.local.example to .env.local and fill them in."}
      </div>

      <ul className="flex flex-col gap-2">
        {checks.map((c) => (
          <li
            key={c.key}
            className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2"
          >
            <code className="text-xs sm:text-sm">{c.key}</code>
            <span
              className={`text-sm font-semibold ${
                c.ok ? "text-green-600" : "text-red-600"
              }`}
            >
              {c.ok ? "present" : "missing"}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
