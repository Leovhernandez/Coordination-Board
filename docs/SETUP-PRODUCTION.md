# Production readiness (before onboarding real companies)

Goal: no rate limits, no surprises, commercial-ToS-clean. This is the upfront
infrastructure to host multiple companies' users reliably.

## 1. Email sender — Resend SMTP (removes the magic-link rate limit)

Supabase's built-in email caps at a few sends/hour — fine for testing, a
blocker for onboarding. Point Supabase Auth at Resend instead.

1. **resend.com** → sign up. Free tier: ~3,000 emails/mo, 100/day; paid scales.
2. **Add a domain** → `4lfr.com` → Resend shows DNS records (SPF, DKIM,
   optionally DMARC). Add them in **Cloudflare** (your 4lfr.com DNS), set the
   records to **DNS only** (grey cloud). Wait for Resend to show "Verified."
   (Verifying the domain is what keeps magic links out of spam.)
3. **API Keys → Create** → copy the key (`re_…`). This is also your SMTP
   password.
4. Supabase → **Authentication → SMTP Settings → Enable Custom SMTP:**
   - Host: `smtp.resend.com`
   - Port: `465` (SSL) — or `587`
   - Username: `resend`
   - Password: your `re_…` API key
   - Sender email: `noreply@4lfr.com` (must be on the verified domain)
   - Sender name: `Coordination Board`
   - Save.
5. Supabase → **Authentication → Rate Limits** → raise the email limit now that
   you control sending (custom SMTP lifts the tight built-in cap).
6. Test: request a sign-in link — it should arrive promptly, no rate-limit error.

## 2. Plan upgrades (commercial readiness)

- **Supabase Pro (~$25/mo):** removes the free-tier 7-day inactivity pause (a
  paused DB = your app goes down), raises limits (rows, monthly active users,
  connections), adds daily backups. Do this before paying customers rely on it.
- **Vercel Pro (~$20/mo):** Vercel's **Hobby plan is non-commercial only** — a
  paid SaaS must be on **Pro** per their terms. Also higher limits. Required
  before you sell.
- **Resend:** free tier is fine to start; upgrade as send volume grows.

Upfront ≈ **$45/mo** (Supabase Pro + Vercel Pro), Resend free initially. Worth
it before onboarding companies that depend on uptime.

## 3. Quick pre-onboarding checklist
- [ ] Resend SMTP configured + a test email received
- [ ] Supabase Pro
- [ ] Vercel Pro
- [ ] All 5 required env vars set in Vercel (see `.env.local.example`)
- [ ] All migrations applied (schema, grants, realtime, allowed_emails, oversight)
