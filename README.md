# Zaffa (زفّة) — Event Planning Platform

Full-stack event planning platform targeting the Egyptian market. Connects clients with wedding planners and vendors, with AI-powered style recommendations.

## Tech Stack

- **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui, Framer Motion
- **API**: tRPC (end-to-end type-safe)
- **Database**: Supabase (PostgreSQL + pgvector + Realtime + Auth)
- **ORM**: Prisma
- **Payments**: Stripe Connect
- **Media**: Cloudinary
- **Search**: Meilisearch
- **AI**: OpenAI GPT-4o + DALL-E 3 + embeddings
- **Email**: Resend
- **Cache**: Upstash Redis

## Getting Started

### Prerequisites

- Node.js 18+
- A Supabase project
- Stripe account
- OpenAI API key

### Setup

1. Clone and install dependencies:

```bash
git clone <repo-url>
cd zaffa
npm install
```

2. Copy environment variables and fill in your keys:

```bash
cp .env.local.example .env.local
```

Required environment variables:

| Variable | Service |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase |
| `DATABASE_URL` | Supabase (pooler URL) |
| `STRIPE_SECRET_KEY` | Stripe |
| `STRIPE_WEBHOOK_SECRET` | Stripe |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary |
| `CLOUDINARY_API_KEY` | Cloudinary |
| `CLOUDINARY_API_SECRET` | Cloudinary |
| `OPENAI_API_KEY` | OpenAI |
| `MEILISEARCH_HOST` | Meilisearch |
| `MEILISEARCH_API_KEY` | Meilisearch |
| `RESEND_API_KEY` | Resend |
| `UPSTASH_REDIS_REST_URL` | Upstash |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash |

3. Set up the database:

```bash
npm run db:generate
npm run db:push
npm run db:seed
```

4. Apply the Supabase migration for RLS policies and triggers:

```bash
supabase db push
```

Or manually run `supabase/migrations/00001_initial_schema.sql` in your Supabase SQL editor.

5. Start the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
src/
├── app/                     # Next.js App Router pages
│   ├── (marketing)/         # Landing page
│   ├── (auth)/              # Sign in, sign up, OAuth callback
│   ├── explore/             # Visual arrangement browser
│   ├── planners/            # Planner marketplace
│   ├── vendors/             # Vendor directory
│   ├── dashboard/           # Role-based dashboards
│   ├── ai/                  # AI features (style quiz, mood board)
│   └── api/                 # tRPC handler + webhooks
├── server/
│   ├── routers/             # tRPC routers
│   ├── trpc.ts              # tRPC init + context
│   └── ai/                  # OpenAI integration
├── lib/                     # Client libraries (Supabase, Stripe, etc.)
├── components/
│   ├── ui/                  # shadcn/ui components
│   ├── layout/              # Navbar, footer, sidebar
│   └── features/            # Feature-specific components
├── hooks/                   # Custom React hooks (realtime, presence)
└── types/                   # Shared TypeScript types
```

## Key Features

- **Visual Arrangement Explorer** — Masonry grid of event arrangements with filtering
- **Planner Marketplace** — Search, filter, and browse planner profiles and portfolios
- **Vendor Directory** — Browse vendors by category with reviews
- **AI Style Quiz** — Multi-step quiz for personalized style recommendations
- **AI Mood Board** — Generate visual mood boards with DALL-E 3
- **Real-time Messaging** — Chat between clients, planners, and vendors
- **Stripe Connect Payments** — Secure payments with platform commission
- **Role-based Dashboards** — Separate views for clients, planners, and vendors

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:migrate` | Run Prisma migrations |
| `npm run db:push` | Push schema to database |
| `npm run db:seed` | Seed database with sample data |

## License

Private — All rights reserved.
