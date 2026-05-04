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

`npm test` runs the [Vitest](https://vitest.dev/) suite under `tests/`. Today this covers:

- Fee math (`computeFee`, `decimalToNumber`, Stripe zero-decimal currency conversion)
- Production env guards (`assertProductionEnv`) and cron authentication (`isAuthorizedCronRequest`)
- Rate-limit IP extraction (`ipFromRequest`)
- HMAC unsubscribe tokens (sign / verify / expiry / tampering)
- Notification copy rendering in English + Arabic

CI (`.github/workflows/ci.yml`) runs `lint`, `tsc --noEmit`, the test suite, and `next build` on every PR. Webhook + payment-schedule integration tests against a real Postgres are tracked as a follow-up.

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
| `npm run db:generate` | Generate Prisma client |
| `npm run db:migrate` | Run Prisma migrations (dev only) |
| `npm run db:push` | Push schema to database (dev only — see Migrations) |
| `npm run db:seed` | Seed database with sample data |
| `npm run deploy:worker` | Deploy the Pinterest search Cloudflare worker |

## License

Private — All rights reserved.
