# Handoff Brief — Phase 0.6 (Round 3) closed out; validation + Round 4 next

> For a fresh Claude Code session. Self-contained, but the governing docs still
> win. **`AGENTS.md` is binding and wins on any conflict — stop and flag.**

## 0. Read first (in order)
1. `AGENTS.md` — the constitution (binding). Pay attention to **§5** (security/RLS:
   service-role server-only, participants never become auth users, read vs write
   are separate policies, deny-by-default), **§6** (the live-refresh invariant —
   every data-bearing surface another session may view MUST live-refresh,
   verified on a 2nd device; + the regression gate against ALL prior features),
   **§7** (anti-scope + the 3-second glance test), **§9** (post-v1 amendments —
   the shipped feature log).
2. `docs/ROADMAP-AND-PRICING.md` — tiers + build order (N2 row now marked done).
3. `INSTRUCTIONS.md` §0 (ground rules). Phase 0.6 (Round 3) is now fully shipped
   — see §1 below. There is currently **no open Round 4 batch**; the owner will
   file one when ready.
4. This file.
5. Auto-memory worth loading: `phase-0-6-progress`, `m21-shipped`,
   `cancel-retention-shipped`, `supabase-connector`, `signin-interstitial-required`,
   `live-refresh-invariant`, `regression-test-all-features`, `pricing-tiers`.

---

## 1. Where things stand (2026-07-02) — what shipped this round

`main` HEAD = `cd49ac3`. Everything below is merged to `main` and deployed to
prod via Vercel auto-deploy (GitHub → Vercel). In order:

| PR | Commit | What |
|---|---|---|
| #3 | `bf0ff63` | **Cancel-retention cron.** 30-day export window after Stripe cancel, then a daily `CRON_SECRET`-gated route purges the org: frees R2 media + **hard-deletes** the org row (owner chose full erasure, not just R2). |
| #4 | `664fa5a` | **M21 — preferred payment method.** Owner opt-in toggle (default OFF, Team page), crew set `payment_type` (Zelle/Venmo/Check/Cash/Other) + `payment_detail` per job/link, owner/salesman see it in the Crew panel. |
| #5 | `e791933` | **Bugfix.** Owner's `ctx.org` was missing `collect_payment_method` (+ `plan`/`storage_cap_bytes`/`canceled_at`) because `lib/auth.ts` had a **stale duplicate `ORG_COLUMNS`**. Fixed by extracting one shared `lib/org-columns.ts`. |
| #6 | `d2dfeb0` | **Bugfix.** Payment toggle knob rendered outside the pill (no `left` anchor). Fixed geometry: `left-0.5` + capped `translate-x-[20px]`. |
| #7 | `e6c129a` | **N1 — sign-in webview handoff + Team live-refresh.** `/auth/confirm`'s GET interstitial detects an in-app webview (isolated cookie jar → session doesn't persist) and steers to the system browser; **only** when a webview is detected — a link already in the system browser gets the unchanged flow, zero extra steps (owner requirement, proven by `scripts/test-webview.mts`, 15/15 UA cases). Team page now live-refreshes `org_members` (invited→joined pill). |
| #8 | `66ef17d` | **N3 — Spanish mobile overflow.** Root cause: the dashboard's 6-tab nav row didn't wrap; ES labels (`Facturación` etc.) pushed it past 360px → forced zoom-out. Fixed with `flex-wrap` on the nav row + job-board header, plus a root `overflow-x-clip` backstop. |
| #9 | `cd49ac3` | **N2 — Stripe tier pricing + promo→Base auto-transition.** Per-tier prices (Base $49/Pro $99/Enterprise $299) from env; `organizations.plan` synced from the subscription's actual price by the webhook; `$20×3mo` promo gated by an admin `promo_eligible` flag, auto-scheduled to flip to Base via a Stripe **Subscription Schedule** (Stripe changes the price itself); `/admin` retrofit button for pre-existing promo subs (Trinity); dated EN/ES banner on dashboard + billing. |

**Phase 0.6 (Round 3) is now 100% shipped** (N1, N2, N3 — all of INSTRUCTIONS.md's
"start here" queue). Phase 0.5 (R1–R4) and Phase 1 (M-VIS→M-EXPORT) were already
done in earlier rounds per `INSTRUCTIONS.md`.

**Owner already completed:** the 4 Stripe prices are configured (Base/Pro/
Enterprise/Promo) per the owner's message this session ("Stripe pricing
configurations done").

**Process invariants (binding, carried forward unchanged):** diagnose before
rewrite (§0); regression-test against ALL prior features, not in isolation —
realtime + RLS regress most silently; **never commit/push/deploy without
explicit owner go-ahead**; pause at each "Done when" for real-device validation;
tier-gate by capability flag, **never** a hardcoded company name.

**Tooling reality:** `gh` CLI is **NOT installed**. PRs are created+merged via
the **GitHub REST API** using the cached git credential:
`token=$(printf "protocol=https\nhost=github.com\n\n" | git credential fill | sed -n 's/^password=//p')`
then a small Node script POSTs `/repos/Leovhernandez/Coordination-Board/pulls`
and PUTs `/pulls/{n}/merge`. Flow each milestone: branch → commit → `git push
-u` → PR via API (squash merge) → `git checkout main && git pull --ff-only` →
delete branch (local + remote).

**Windows gotchas (unchanged):** `next build` throws a harmless `kill EPERM` at
worker teardown *after* a successful build — check for `✓ Compiled
successfully` + a present `.next/BUILD_ID`, not the exit code. **Do NOT run
`next build` while `next dev` is running.** `<html translate="no">` +
`notranslate` in `app/layout.tsx` is load-bearing (Chrome auto-translate
hydration fix) — **do not remove**.

**Supabase connector** (project `gfvemminanesyjhcsmua`) is connected: apply
migrations **directly** — protocol is **test-first** (`BEGIN; <migration>
<smoke> ROLLBACK;` via `execute_sql`, no raised error = pass, verify nothing
persisted) **then** `apply_migration`. **Pause for owner go-ahead before
applying to prod**, same as every prior round.

---

## 2. What's left — owner validation (not yet confirmed working on real devices)

None of these need code changes unless validation turns up a bug. Each is a
"Done when" from this round that the owner has not yet signed off on:

### 2a. N2 — promo flow, end to end (HIGH PRIORITY — new mechanism, unverified)
1. Confirm `STRIPE_PRICE_BASE`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_ENTERPRISE`,
   `STRIPE_PRICE_PROMO` are set in **Vercel → Settings → Environment Variables →
   Production** (owner says Stripe-side prices are configured; confirm the env
   vars were also added and a deploy has picked them up — `/billing` should show
   three tier cards, not the old single "Subscribe" button).
2. **New promo customer path** (no retrofit needed): sign in as a fresh test
   org → confirm it appears in `/admin` → flip **Promo: ON** → go to `/billing`
   → the Base card should show the "first 3 months are $20/month" note → **do
   NOT actually complete a live Stripe checkout with a real card** unless the
   owner wants to burn a real test subscription; if testing, use Stripe test
   mode keys, not live.
3. **Trinity retrofit** (their sub predates schedules — needs the button click):
   `/admin` → Trinity's row → flip **Promo: ON** → click **"Schedule promo →
   Base"** → confirm the dialog → verify (a) the amber dated banner appears on
   Trinity's dashboard/billing with the correct date (~3 months from their
   original Stripe subscription start, not from today), and (b) in the Stripe
   dashboard, Trinity's subscription shows an attached **Subscription Schedule**
   with phase 2 = the Base price.
4. Regression: a **non-promo** Base/Pro/Enterprise checkout still charges the
   right price with no schedule attached.

### 2b. N1 — webview sign-in handoff (real device, iOS + Android)
Tap the emailed sign-in link from **inside Gmail and Outlook** (not a regular
browser) on both platforms:
- Expect: steered to the **system browser**, session **persists** after closing
  the email app and reopening the browser.
- **Regression check:** opening the same link directly in a normal browser
  (Safari/Chrome) must show the **unchanged** one-tap "Sign in" button — no
  extra webview-steer step. This was an explicit owner requirement (verified by
  `scripts/test-webview.mts` logically; a real device confirms it in practice).
- Team page: with a second device/tab open on `/dashboard/team`, have a newly
  invited salesman sign in — the "invited" pill should flip to "joined" **live**,
  no manual refresh.

### 2c. N3 — Spanish mobile overflow
On a real phone (or DevTools device mode) at **320–414px width**, toggle
EN⇄ES on the dashboard and a job board (`/jobs/[id]`). Expect: no horizontal
overflow, no browser zoom-out; the nav tabs wrap to a second row instead of
overflowing; all buttons stay tappable.

### 2d. Cancel-retention cron (from earlier this round, PR #3 — likely already
covered, re-verify if not)
- Confirm the cron shows under **Vercel → Settings → Cron Jobs** (`0 8 * * *`,
  `/api/cron/purge-canceled`).
- Non-destructive smoke test (deletes nothing when no org is 30+ days
  canceled): `curl -s -H "Authorization: Bearer $CRON_SECRET"
  https://coordination.4lfr.com/api/cron/purge-canceled` → expect
  `{"ok":true,"candidates":0,"purged":0,...}`.

### 2e. M21 payment method (bug was fixed in PR #5 — re-verify the fix holds)
Toggle **Ask crew for preferred payment** ON (Team page) → open a job's crew
link on a second device → set a payment method + Save → confirm the owner's
Crew panel shows it **live**, no reload, and the toggle knob renders correctly
inside the pill in both states.

---

## 3. Constraints (binding — carry forward to any new work)

- **§5 security:** service-role key stays server-only (`lib/supabase/service.ts`,
  `server-only` import); participants never become auth users; crew writes are
  always token → participant → own row, never a broader query; RLS read vs
  write are always separate policies; deny-by-default.
- **§6 live-refresh + regression:** any NEW data-bearing feature visible to a
  2nd session must live-refresh (publish the table + `REPLICA IDENTITY FULL` if
  DELETEs need to propagate, or use `broadcastJobChange` for anon crew), verified
  on a 2nd device — "works on my own screen" doesn't count (server-action
  revalidation hides the gap). Re-verify realtime, RLS, sign-in, and the
  critical-path headline on **every** change — they regress silently.
- **§7 glance test:** every UI addition must still let the board be read
  one-handed in 3 seconds. Billing/tier UI lives on `/billing` and `/admin`, not
  the board — keep it that way.
- **Tier-gate by capability flag, never a hardcoded company name.** `plan` is
  the single source of truth, synced from Stripe by the webhook — never branch
  on org name or email.
- **Migration cadence (binding):** write migration → test-first `BEGIN…ROLLBACK`
  via the Supabase connector → **pause for owner go-ahead** → `apply_migration`
  → app code → regression → owner validates. The migration must land in prod
  **before** deploying code that reads the new column(s) — session/org loaders
  read them on every request.
- **No commit/push/deploy without explicit owner go-ahead.** PRs via the GitHub
  REST API (gh not installed) — see §1.
- **`ORG_COLUMNS` lives in ONE place now: `lib/org-columns.ts`.** Any new
  `organizations` column that needs to reach `ctx.org` (owner or salesman path)
  MUST be added there — this exact drift (a stale duplicate in `lib/auth.ts`)
  caused the PR #5 bug. Do not reintroduce a second copy.
- **Stripe SDK note:** this project's `stripe` package (^22.2.2) uses
  `phases[].duration: { interval, interval_count }` for Subscription Schedule
  phases, **not** the older `iterations` param — `lib/stripe.ts`
  `schedulePromoToBase` already uses the correct shape; don't "fix" it back.

## 4. Verification gates (all must pass before any commit)
```
npx tsc --noEmit
npm run lint
npx tsx scripts/test-headline.mts      # 6/6 PASS
npx tsx scripts/test-webview.mts       # 15/15 PASS (N1 webview-detection guard)
npm run build                          # ✓ Compiled successfully + .next/BUILD_ID present
                                        # (ignore the Windows "kill EPERM" teardown line)
```
Plus, for any RLS/schema change: the test-first `BEGIN…ROLLBACK` smoke via the
Supabase connector; and real-device 2nd-session live-refresh validation for any
data-bearing feature.

## 5. Key file paths

**Billing / tiers / promo (N2)**
- `lib/stripe.ts` — `PLANS`, `priceIdForPlan`, `planForPriceId`, `promoPriceId`,
  `schedulePromoToBase` (the Subscription Schedule logic), `PROMO_MONTHS`.
- `app/api/stripe/webhook/route.ts` — syncs `plan` from the subscription price
  on every create/update; attaches the promo schedule on
  `checkout.session.completed`.
- `app/billing/actions.ts` (`startCheckout(plan)`), `app/billing/page.tsx`
  (tier cards + dated promo banner).
- `app/admin/actions.ts` (`setPromoEligible`, `schedulePromoTransition` —
  the Trinity retrofit), `app/admin/page.tsx` (promo toggle + retrofit button
  + `promo_ends_at` display).
- `app/dashboard/page.tsx` — owner-only dated promo banner.
- `supabase/migrations/20260701120000_n2_promo_tiers.sql` —
  `promo_eligible` + `promo_ends_at` [applied to prod].

**Sign-in webview handoff (N1)**
- `lib/webview.ts` — pure `isInAppWebview(ua)` detector (unit-tested).
- `scripts/test-webview.mts` — the 15-case UA matrix (run before any change to
  `lib/webview.ts` or the interstitial).
- `app/auth/confirm/route.ts` — GET interstitial (webview-steer vs normal),
  POST still runs `verifyOtp` only (scanner-safe, unchanged).
- `app/dashboard/team/page.tsx` — `RealtimeRefresh` on `org_members`.

**Mobile overflow (N3)**
- `app/dashboard/page.tsx` — nav tab row (`flex-wrap`).
- `app/jobs/[id]/page.tsx` — board header (`flex-wrap`).
- `app/layout.tsx` — root `overflow-x-clip` backstop.

**Cancel-retention cron**
- `app/api/cron/purge-canceled/route.ts`, `vercel.json` (daily cron),
  `lib/invites.ts` (`sendCancellationNotice`, bilingual),
  `app/api/stripe/webhook/route.ts` (stamps `canceled_at`).

**M21 payment method**
- `lib/org-columns.ts` — the **single** `ORG_COLUMNS` (owner + salesman both
  import this now).
- `app/j/[jobId]/actions.ts` (`setCrewPaymentMethod`),
  `components/PaymentPrompt.tsx`, `app/dashboard/team/PaymentMethodToggle.tsx`,
  `app/jobs/[id]/Crew.tsx`.

**Shared patterns to mirror for future work**
- `lib/membership.ts` `getSessionContext` / `lib/auth.ts` `getOrCreateOrg` — the
  two paths that build `ctx.org`; both import `lib/org-columns.ts`.
- `components/RealtimeRefresh.tsx` (one channel per table, `postgres_changes`),
  `lib/realtime.ts` (`broadcastJobChange`, for anon crew).
- `lib/i18n/dictionaries.ts` — `es: Dict` typing means a missing ES key fails
  `tsc`; always add both languages together.

## 6. Gotchas / lessons (carry-forward)
- **`gh` not installed** → PR create+merge via GitHub REST API + cached git
  credential (§1).
- **Windows:** `next build` EPERM teardown is harmless (check `✓ Compiled` +
  BUILD_ID); don't build while `next dev` runs.
- **`.env.local`:** `KEY=value`, no spaces; gitignored. `CRON_SECRET` is set
  there + in Vercel Production.
- **`es: Dict`** in `dictionaries.ts` → a missing ES key fails `tsc`.
- **`translate="no"`** on `<html>` is load-bearing — keep it.
- **Migrations via the Supabase connector** (`gfvemminanesyjhcsmua`),
  test-first in `BEGIN…ROLLBACK`, then `apply_migration`; apply **before**
  deploying code that reads new columns (session/org loaders run on every
  request).
- **`ORG_COLUMNS` drift already bit us once** (PR #5) — there is now exactly one
  copy, in `lib/org-columns.ts`. Keep it that way.
- **Stripe Subscription Schedule phases use `duration`, not `iterations`**, on
  this SDK version — verify against current Stripe docs before changing
  `schedulePromoToBase`, don't assume older examples from memory (AGENTS §3).
- **Participants are per-job link rows** (no cross-job crew identity) — payment
  method, notes, etc. are all per participant/job by design (§7 anti-scope: a
  crew directory).
- **Local mobile testing is impractical** (magic-link points to `localhost`; R2
  CORS excludes the LAN IP) — validate real-device on **prod**, or DevTools
  device mode for layout-only checks (like N3).
