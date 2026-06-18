import { sendMagicLink } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const sp = await searchParams;

  return (
    <main className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Owner sign in</h1>
        <p className="text-sm text-gray-600">
          Enter your email and we&apos;ll send you a one-tap sign-in link. No
          password.
        </p>
      </div>

      {sp.sent ? (
        <div className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-800">
          Check your email for the sign-in link. You can close this tab.
        </div>
      ) : (
        <form action={sendMagicLink} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Email
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              placeholder="you@company.com"
              className="rounded-md border border-gray-300 px-3 py-3 text-base outline-none focus:border-gray-900"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-4 py-3 text-base font-semibold text-white active:bg-gray-700"
          >
            Send sign-in link
          </button>
          {sp.error && (
            <p className="text-sm text-red-600">
              Something went wrong sending the link. Try again.
            </p>
          )}
        </form>
      )}
    </main>
  );
}
