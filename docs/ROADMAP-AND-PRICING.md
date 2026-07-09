# Roadmap & Pricing (post-v1)

Status as of 2026-06-22: v1 shipped, M9 pilot passed. First paying customer
**Trinity Floor Co.** signed at $20/mo promo. This doc is the durable plan for
what we build next, which tier each feature sits in, and why. Scope changes here
are reflected in the constitution at `AGENTS.md` §9.

---

## 1. Pricing tiers

| Tier | Price | Seats | Includes |
|---|---|---|---|
| **Base** | **$49/mo** (promo **$20 × 3 mo**, Trinity + one more only) | up to ~15 salesman/owner seats; unlimited crew links | Core board (v1) + phase **notes** + **activity log** + **blocker duration** + **auto-assign sole sub** + **owner roll-up grid** + **insurance attestation** + **preferred payment method** + **photo uploads** (R2, **10 GB** cap) |
| **Pro** | **$99/mo** | up to ~40 seats | Base + **100 GB photo storage** (10× the Base cap) + **incentive scoreboard** |
| **Enterprise** | **custom, from ~$299/mo** | custom | Pro + **video**, large storage, **master/document files**, SSO, priority support, white-glove onboarding |

- **Billing unit = salesman/GC seats.** Crew (subcontractors) are cookie-token
  participants, not auth users, and cost ~nothing — always unlimited.
- **Promo:** $20/mo for the first **3 months**, limited to **Trinity** and **one
  more company (Tio Jose / Mario)**. Everyone after pays the standard tier price.
- **Trinity is on Base** (no grandfather needed): photos are now a **Base** feature
  at the Base **10 GB** cap, so Trinity gets image uploads on Base and pays **$49**
  when the promo ends. R2 keeps it nearly free for us; they remain the referral
  engine into the flooring industry.

### Cost model (why this is profitable)
- Fixed infra: Supabase Pro ($25) + Vercel Pro ($20) = **~$45/mo**. Resend free to
  start. Break-even ≈ 3 full-price subscribers.
- **Media goes on Cloudflare R2, not Supabase Storage.** R2 = ~$0.015/GB/mo
  storage and **$0 egress**. With client-side compression (resize ~1600px, JPEG
  ~70%) + thumbnails, a photo is ~0.3–0.5 MB. Trinity-scale photo load ≈ a few
  dollars/month. **Never self-host storage.**
- Enterprise provider tiers (Vercel ~$1.7–3k/mo, Supabase Team $599 / Enterprise
  ~$2k+/mo, Resend Scale $90) are **far-future** — Pro economics carry us to dozens
  of customers. Budget Pro, not Enterprise.

---

## 2. Build order (sequenced for Trinity)

| # | Milestone | Tier | Notes |
|---|---|---|---|
| 0 | **Email deliverability** | — | Config, **urgent, manual** (DNS). Unblocks onboarding. See §5. |
| — | Magic-link cross-browser | — | ✅ **Done** (token_hash, commit `b1ddb32`) |
| **M14** | **Multi-seat orgs** (owner + salesmen, shared crew, one subscription) | Base | **Foundational spine.** Schema change. See §3. |
| **M15** | **Owner roll-up grid** (per-salesman job shelves) | Base | Depends on M14. Design locked in §4. |
| **M16** | **Admin: companies + emails + seat/usage counts** | internal | Extends `/admin`. Needs M14. |
| **M17** | **Phase notes** (gate/lockbox codes) | Base | ✅ **Done** (two-sided author, RLS matrix, live-refresh). |
| **M10** | **Soft-delete + restore + purge** (jobs) | Base | ✅ **Done** (soft-delete + restore + owner hard-purge; M22 purge frees R2). |
| **M18** | **Activity log + blocker duration** | Base | ✅ **Done** (append-only activity_log, two-sided actor, per-phase History + "Blocked Nd" pill, live-refresh). |
| **M19** | **Auto-assign sole subcontractor** | Base | Small, pure logic. |
| **M20** | **Insurance attestation checkbox** | Base | Stores exact text + identity + timestamp. Reuses App 2 signature tech. |
| **M21** | **Preferred payment method** (crew field) | Base | ✅ **Done** (owner opt-in toggle default OFF; per-participant `payment_type` select + `payment_detail`; owner/owning-salesman see it in the Crew panel; participants published for live-refresh). |
| **M22** | **Photo uploads** (Blocked/Done/In-progress) | **Base + Pro** | ✅ **Done** (R2 direct-serve via CDN domain, client compression + thumbs, storage cap 10/100 GB, two-sided uploader, live-refresh). |
| **M23** | **Incentive scoreboard** | **Pro** | Validate with Trinity first. |
| **M24** | **M-MULTI: multiple crew per phase** (customer ask, Round 4) | Base | ✅ **Done 2026-07-08** (`phase_assignees` junction replaces the single-FK assignment; up to `max_assignees_per_phase` per org — default 10, config not code — enforced in the action + a DB trigger; status stays one-per-phase shared last-writer-wins, M18 log attributes the actor; co-assignees read each other's crew notes AND photos, edit own only; REPLICA IDENTITY FULL + published so unassign deletes live-refresh; legacy `assignee_participant_id` column + bridge trigger dropped 2026-07-09 after owner validation). |
| **M25** | **M-CLAIM: crew-link device binding** (owner-mandated transparency fix) | all tiers | ✅ **Done 2026-07-08** (first device to open a crew link claims it — device secret in an httpOnly cookie, sha-256 hash on `participants`; other devices fully blocked "link already in use"; member **Reset link** re-issues; claims/resets logged to the scrub-proof activity log; `ADMIN_EMAIL` test bypass with an `adminTest` History marker; Crew panel claim pill). |
| **N2** | **Stripe tier pricing + promo→Base auto-transition** | — | ✅ **Done** (per-tier prices via env `STRIPE_PRICE_BASE/PRO/ENTERPRISE/PROMO`; `plan` synced from the subscription price by the webhook; promo = $20×3mo as phase 1 of a Subscription Schedule that flips to Base $49 automatically; `promo_eligible` admin flag + `/admin` retrofit button for pre-existing promo subs; dated EN/ES promo banner on dashboard + billing). Supersedes the single-price M8 checkout. |

**Also still relevant from earlier backlog:** M11 phase deadlines, M12 owner email
alerts (Resend). **M10 soft-delete + restore + purge** is now **scheduled** (see
table; promoted from M17 R3). **M13 Spanish/English UI** — ✅ **Done** (full-app
EN/ES toggle + auto-detect, display-only; emails included).

### Deferred / cut
- **Master files / invoices per house** → Enterprise only, unvalidated; it's a
  different product (document management + invoicing, both §7). Not scheduled.
- **Video uploads** → Enterprise only; deferred for upload-UX/complexity reasons.
- **Deep phase sub-steps** → trim to nothing until Trinity asks again (creep toward
  task-management clutter).
- **Self-hosted storage** → cut; R2 is cheaper and far less risk.

---

## 3. M14 — Multi-seat orgs (plan)

**Problem.** Today `organizations.owner_user_id` is 1:1 with an auth user (unique
index), and all RLS is keyed to `owner_user_id = auth.uid()`. Trinity is one
company = one owner (Jon Roy) + ~10 salesmen + ~20–30 shared subs + **one**
subscription. The current model can't represent that.

**Design.**
- New table `org_members (id, org_id, user_id nullable, email, name, role, created_at)`,
  `role ∈ ('owner','salesman')`, unique on `(org_id, lower(email))`.
  - `user_id` is null until that email first signs in (pending invite), then linked.
- `jobs` gains `salesman_member_id uuid references org_members(id)` — which salesman
  owns the job (defaults to creator).
- **Invite flow:** owner opens a **Team** section → adds salesman by email →
  creates a pending `org_members` row → that email magic-links in → on first sign-in
  we attach `auth.uid()` to the membership instead of creating a new org.
- **RLS rewrite (the careful part):** replace `owner_user_id = auth.uid()` with
  "caller is a member of the org." **Default visibility:** a salesman sees **their
  own** jobs; the **owner** sees **all** org jobs. (Flipping to "all salesmen see
  all jobs" is a one-line RLS change if Trinity prefers it.)
- **Backward compat:** migrate every existing org's `owner_user_id` into an
  `org_members` row with `role='owner'`; existing single-owner accounts keep working
  unchanged.
- **Billing:** unchanged at the org level; seat count = members. Base cap ~15
  (soft-tracked first, enforced later).

**Open decision for the owner:** salesman visibility — *own jobs only* (recommended)
vs *all org jobs*. Default build = own-only; trivially switchable.

**Cadence:** write the migration → **owner applies it in Supabase (manual)** →
then app-layer code (membership, Team UI, RLS-backed queries) → regression →
owner validates. Migration apply is a natural pause point.

---

## 4. M15 — Owner roll-up grid (design locked)

**Goal (Jon Roy, Monday scheduling):** see every salesman's jobs at a glance
without endless vertical scrolling.

**Layout — "shelf per salesman":**
- Vertical list bounded by **number of salesmen** (~10 rows), *not* by number of
  jobs. This kills the long-scroll problem (10 salesmen × 10 jobs = 100-card scroll).
- Each row = salesman's **display name** (whatever they set on their account) +
  job count `(7)` as a header, with a **horizontal carousel/shelf** of compact job
  cards beneath it.
- Each job card shows the **critical-path headline** (the one blocker / next
  action) as a colored pill — so the owner reads problems across the row in one pass.

**Navigation:**
- **Touch (mobile):** native horizontal swipe with momentum + snap; a peeking
  edge of the next card signals there's more.
- **Desktop:** left/right **arrow buttons** appear at the shelf ends.

**Filtering (what shows):** only **active** jobs that are **not fully done**. A job
**drops off** when archived, deleted, or all phases marked done; it **reappears**
when unarchived/restored or a phase reverts from Done.

**Live refresh:** the owner is an auth user, so subscribe to **org-wide**
`postgres_changes` on `jobs` + `phases`; on any change call `router.refresh()`,
which re-runs the filtered server query — so add/remove happens automatically with
no bespoke logic. (Depends on M14 RLS letting the owner read all org jobs.)

**Empty state:** a salesman with no active jobs still shows, with "No active jobs"
— so the owner can see who has capacity on scheduling day.

---

## 5. Email deliverability — fix (manual, do first)

Magic-link emails landing in junk = lost sign-ins on day one. This is DNS/domain
config in Cloudflare for `4lfr.com`, not code:

1. **Resend → Domains → `4lfr.com`** must show **Verified**. If not, add the
   **SPF** and **DKIM** records Resend shows, in Cloudflare, set **DNS only** (grey
   cloud).
2. **Add a DMARC record** in Cloudflare (this is usually what's missing):
   - Type `TXT`, Name `_dmarc`, Value: `v=DMARC1; p=none; rua=mailto:postmaster@4lfr.com`
   - `p=none` monitors without blocking; tighten later once mail flows clean.
3. Send **only** from the verified sender `noreply@4lfr.com` (Supabase → Auth →
   SMTP sender). Don't send from a non-verified address.
4. Test: request a sign-in link to a Gmail/Outlook address → it should land in the
   inbox. Mark a few "not spam" early to build reputation.
