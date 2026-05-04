# Zaffa (زفّة) — Event Planning Platform

Full-stack event planning platform for the Egyptian market. Connects clients with wedding planners and vendors, with an AI-powered venue designer at the heart of the experience.

## Tech Stack

- **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui, Framer Motion
- **API**: tRPC (end-to-end type-safe)
- **Database**: Supabase (PostgreSQL + pgvector + Realtime + Auth)
- **ORM**: Prisma (read/write) — RLS policies live in `supabase/migrations/`
- **Payments**: Stripe Checkout (merchant-of-record), off-Stripe payouts to planners/vendors
- **Media**: Cloudinary
- **AI**: OpenAI / OpenRouter (Claude or GPT-4o), DALL-E for renders
- **Email**: Resend
- **Cache + rate-limit**: Upstash Redis
- **i18n**: `next-intl` with English + Arabic (RTL)

## Getting Started

### Prerequisites

- Node.js 18+
- A Supabase project
- Stripe account
- OpenAI / OpenRouter API key

### Setup

1. Clone and install dependencies:

```bash
git clone <repo-url>
cd zaffa
npm install
```

2. Copy environment variables and fill in your keys:

```bash
cp .env.example .env.local
```

See [.env.example](./.env.example) for the full list of variables and what each one does. Production deploys also require `CRON_SECRET` and `NOTIFICATION_UNSUBSCRIBE_SECRET` — the app refuses to boot in production without them.

3. Set up the database:

```bash
npm run db:generate
npm run db:push          # for fresh dev databases
npm run db:seed
```

For production, prefer SQL migrations under `supabase/migrations/` (apply with `supabase db push` or via the Supabase dashboard SQL editor). See [Migrations](#migrations) below for the policy.

4. Apply the Supabase migrations for RLS policies, triggers, and the launch-hardening tables:

```bash
supabase db push
```

Or manually run the files under `supabase/migrations/` in the Supabase SQL editor in numeric order.

5. Start the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
src/
├── app/
│   ├── page.tsx             # Marketing home (Navbar + scrolly demo + footer)
│   ├── about, contact, privacy, terms  # Static legal/info pages
│   ├── (auth)/auth/         # Sign in/up, forgot/reset password, OAuth callback
│   ├── venue-designer/      # AI-driven venue designer (primary product surface)
│   ├── planners/[id]/       # Public planner profile
│   ├── dashboard/
│   │   ├── client/          # Couple's dashboard (events, payments, messages)
│   │   ├── planner/         # Planner dashboard (marketplace, proposals, earnings)
│   │   ├── vendor/          # Vendor dashboard (catalog, inbox, engagements)
│   │   ├── admin/           # Admin tools (prospects, payouts, refunds, disputes)
│   │   └── notifications/   # Shared notifications inbox + preferences
│   ├── api/
│   │   ├── trpc/            # tRPC handler
│   │   ├── webhooks/stripe/ # Stripe webhook (idempotent)
│   │   ├── cron/            # Vercel-cron-triggered jobs
│   │   └── unsubscribe/     # One-click email unsubscribe (HMAC token)
│   └── unsubscribed/        # Confirmation page for the unsubscribe redirect
├── server/
│   ├── routers/             # tRPC routers (one per domain)
│   ├── services/            # Notifications, prospect discovery, …
│   ├── ai/                  # OpenAI / OpenRouter helpers (renders, video, copy)
│   └── trpc.ts              # tRPC init + context
├── lib/                     # Cross-cutting utilities (Supabase, Stripe, Prisma, rate-limit, env-checks)
├── components/
│   ├── ui/                  # shadcn/ui primitives
│   ├── layout/              # Navbar, footer, sidebar
│   ├── home/                # Marketing-page sections
│   ├── features/            # Feature-specific components
│   ├── payments/            # Schedule panel, fee summaries
│   └── notifications/       # Bell + preferences
├── hooks/                   # Realtime, presence, notifications
├── i18n/                    # next-intl request + locale config
└── messages/                # en.json + ar.json
```

## Migrations

The project uses **Supabase SQL migrations** as the source of truth for schema (under `supabase/migrations/`). The Prisma schema (`prisma/schema.prisma`) must mirror the SQL — keep them in lock-step in the same PR.

For dev databases, `npm run db:push` is the fastest loop. **Do not** run it against production. For production, write a new numbered SQL file in `supabase/migrations/` and apply via `supabase db push` (or paste in the Supabase SQL editor) before merging the matching `schema.prisma` change.

## Operations

- **Cost ceilings**: AI rendering, video generation, prospect discovery, and outreach drafting are protected by per-hour burst limits *and* per-day cost ceilings (see `src/lib/rate-limit.ts`). Bump the daily caps when scaling.
- **Feature flags**: `src/lib/flags.ts` exposes a synchronous `isFlagEnabled(key)` that resolves env override (`FLAG_<KEY>`) → static default. It's safe to import from any environment (server, client, edge). For per-user rollouts use `isFlagEnabledFor(key, distinctId)` from `src/lib/flags-server.ts`, which additionally consults PostHog. The split exists because the PostHog Node SDK pulls in `node:async_hooks` and can't be bundled for the browser.
- **Analytics**: PostHog is wired client-side via `src/components/analytics/posthog-provider.tsx` (manual `$pageview` tracking, autocapture on, session replay off, identify on Supabase auth state change) and server-side via `src/lib/posthog.ts` for cron / webhook captures and flag evaluation. EU project — host defaults to `https://eu.i.posthog.com`. Only the public `phc_…` project key belongs in the env; never commit a `phx_…` personal key.
- **Backups + restore runbook**: see [docs/runbooks/backups.md](./docs/runbooks/backups.md). Enable Supabase PITR before launch.

## Tests

The test strategy is **layered** so that fast checks gate every commit, slower ones gate every push, and the heavy E2E run against Stripe lives in CI without slowing local iteration.

| Layer | When | Command | What runs |
|---|---|---|---|
| Pre-commit | Every `git commit` (Husky + lint-staged) | `npx lint-staged` | ESLint `--fix`, project `tsc --noEmit`, `vitest related --run` for staged `*.ts/tsx` |
| Pre-push | Every `git push` (Husky) | `npm run test:ci && npm run build` | Full Vitest suite with coverage + `next build` smoke |
| On-demand + CI | Manual or PR (GitHub Actions) | `npm run test:e2e` | Playwright money-path against `next dev` + seeded local Postgres + Stripe test mode |

### Vitest (unit + integration)

`npm test` runs the [Vitest](https://vitest.dev/) suite under `tests/` in two projects:

- `node` — server-side helpers, tRPC routers (mocked Prisma + Stripe via `vitest-mock-extended`), the Stripe webhook (real `Stripe.webhooks.generateTestHeaderString`), notification dispatchers, the `payment-reminders` cron, and the Next middleware.
- `jsdom` — React component tests (`@testing-library/react`) for `SchedulePanel` and `AmendmentDialog`.

Coverage is enforced on the critical paths (`src/lib/payments.ts`, `src/lib/env-checks.ts`); see `vitest.config.ts`.

### Playwright (E2E)

The single E2E spec is `tests/e2e/money-path.spec.ts` — it walks one couple end-to-end:

```
client signs up -> creates event -> planner sends proposal + 3 installments
        -> client accepts + pays deposit via Stripe test card 4242 4242 4242 4242
        -> webhook lands -> installment paid -> admin releases planner payout
```

To run locally:

1. `cp .env.test.example .env.test` and fill in Stripe **test-mode** keys + a local Postgres connection.
2. Spin up Postgres + apply schema + seed accounts (roughly):
   ```bash
   docker run --name zaffa-test-pg -e POSTGRES_PASSWORD=zaffa -p 54329:5432 -d pgvector/pgvector:pg16
   npx prisma db push && npm run db:seed
   ```
3. In a second terminal: `stripe listen --forward-to localhost:3100/api/webhooks/stripe` (paste the printed `whsec_…` into `STRIPE_WEBHOOK_SECRET` in `.env.test`).
4. `npm run test:e2e`.

The dev server is started by Playwright's `webServer` automatically on port `E2E_PORT` (default `3100`).

To skip E2E entirely (for example, on slow networks): `SKIP_E2E=1 npm run test:e2e` is a no-op.

To run a single spec / a single test:

```bash
npx playwright test tests/e2e/money-path.spec.ts
npx playwright test -g "creates an event"
npx playwright test --headed --debug   # step through interactively
```

### CI

`.github/workflows/ci.yml` runs four jobs on every PR:

- `lint-typecheck` — ESLint + `tsc --noEmit`
- `test` — full Vitest suite
- `build` — `next build` against stub env vars
- `e2e` — Playwright money-path against a Postgres service container + Stripe test mode (gated on `lint-typecheck` + `test` going green so we don't burn minutes on a known-bad change)

The E2E job needs the following GitHub Action **secrets** to be set on the repo: `E2E_SUPABASE_URL`, `E2E_SUPABASE_ANON_KEY`, `E2E_SUPABASE_SERVICE_ROLE_KEY`, `E2E_STRIPE_SECRET_KEY`, `E2E_STRIPE_PUBLISHABLE_KEY`, `E2E_STRIPE_WEBHOOK_SECRET`, `E2E_TEST_PASSWORD`.

## Receipts and VAT

For v1, each successful Stripe Checkout payment triggers a **Stripe-hosted email receipt** to the client (the platform sets `customer_email` and `receipt_email` from the client's auth profile). This is sufficient for an EGP marketplace with Stripe acting as the merchant of record.

VAT-compliant invoice PDFs and Egyptian e-invoice integration are explicitly **out of scope for launch**. When that workstream begins, the Resend integration in `src/lib/resend.ts` is the place to plug in PDF rendering (e.g. via `react-pdf`) and a downloadable receipt URL on each `Payment` row.

## Key Features

- **Venue Designer** — AI-driven mood board + still + video rendering for a couple's event aesthetic
- **Planner Marketplace** — Search and browse planner profiles + portfolios
- **Proposals & Payment Schedules** — Planner sends proposal + installment plan; client pays via Stripe; amendments supported
- **Vendor Engagements** — Planner engages vendors per event; vendors accept/decline; planner releases funds; admin records off-Stripe payouts
- **Notifications** — In-app bell + transactional emails (Resend), with one-click unsubscribe and Arabic/English copy
- **Admin** — Prospect discovery, outreach drafts, payouts, refunds, dispute monitoring
- **Internationalization** — Full English + Arabic translations, RTL layout, locale-aware formatters

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run dev:cron` | Locally tick the cron handler (uses `dotenvx`) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | `tsc --noEmit` (project-wide) |
| `npm test` | Vitest in watch mode |
| `npm run test:ci` | Vitest one-shot with coverage (used by `pre-push` and CI) |
| `npm run test:e2e` | Playwright money-path (`SKIP_E2E=1` to skip) |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:migrate` | Run Prisma migrations (dev only) |
| `npm run db:push` | Push schema to database (dev only — see Migrations) |
| `npm run db:seed` | Seed database with sample data |
| `npm run deploy:worker` | Deploy the Pinterest search Cloudflare worker |

## License

Private — All rights reserved.
