import { sendMagicLink } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string; email?: string }>;
}) {
  const sp = await searchParams;

  return (
    <main className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center gap-6 p-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Owner sign in
        </h1>
        <p className="text-sm text-slate-500">
          Enter your email and we&apos;ll send you a one-tap sign-in link. No
          password.
        </p>
      </div>

      {sp.sent ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
          Check your email for the sign-in link. You can close this tab.
        </div>
      ) : (
        <form action={sendMagicLink} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            Email
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              defaultValue={sp.email ?? ""}
              placeholder="you@company.com"
              className="rounded-lg border border-slate-300 px-3 py-3 text-base outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
            />
          </label>
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-4 py-3 text-base font-semibold text-white active:bg-slate-700"
          >
            Send sign-in link
          </button>
          {sp.error && (
            <p className="text-sm text-red-600">
              {sp.error === "1"
                ? "Something went wrong sending the link. Try again."
                : sp.error}
            </p>
          )}
        </form>
      )}
    </main>
  );
}
