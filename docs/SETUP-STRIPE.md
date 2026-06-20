# Stripe setup (M8 — billing)

Billing is **optional to run**: with no Stripe env vars, the app works trial-only
(new orgs are `trialing`, which can create jobs) — so the Four L pilot is never
blocked. Configure Stripe when you're ready to charge other GCs.

## 1. Create the product + price
1. **stripe.com** → sign up (start in **Test mode** — toggle top-right).
2. **Product catalog → Add product**: name it (e.g. "Coordination Board"), add a
   **recurring** price (e.g. $49 / month). Save.
3. Copy the **Price ID** (`price_…`) → env `STRIPE_PRICE_ID`.

## 2. Get the API key
**Developers → API keys** → copy the **Secret key** (`sk_test_…`) → env
`STRIPE_SECRET_KEY`. (No publishable key needed — Checkout is hosted by Stripe.)

## 3. Set env vars
In `.env.local` (and Vercel → Project → Settings → Environment Variables):
```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PRICE_ID=price_...
NEXT_PUBLIC_PLAN_LABEL=$49/month
STRIPE_WEBHOOK_SECRET=whsec_...   # from step 4
```

## 4. Configure the webhook (the source of truth for subscription status)
1. **Developers → Webhooks → Add endpoint.**
2. **Endpoint URL:** `https://coordination.4lfr.com/api/stripe/webhook`
3. **Events to send:** `checkout.session.completed`,
   `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.payment_failed`.
4. Save → copy the **Signing secret** (`whsec_…`) → env `STRIPE_WEBHOOK_SECRET`.
5. Redeploy so Vercel has all four Stripe env vars.

> Local testing: `stripe listen --forward-to localhost:3000/api/stripe/webhook`
> prints a `whsec_…` to use in `.env.local`.

## 5. How it behaves
- Owner → **Billing** → **Subscribe** → Stripe Checkout → on success the webhook
  flips the org to `active`. **Manage billing** opens Stripe's customer portal
  (update card / cancel). Subcontractors never see any of this.
- **Gate:** job creation requires `subscription_status in ('trialing','active')`.
  `past_due` / `canceled` blocks new jobs and shows a banner.

## Optional: invite-only sign-ups
Set env `SIGNUP_MODE=allowlist` and add approved emails (lowercase) to the
`allowed_emails` table (Supabase Table editor). Then only those emails can
request a sign-in link — no extra friction for them, you just add the email
once. Leave unset/`open` for public trial sign-ups. Run the migration
`supabase/migrations/20260619130000_allowed_emails.sql` first.
