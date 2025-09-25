This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

1) Copy envs

```bash
cp .env.example .env.local
```

Fill `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

2) Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

3) Run the test suite

```bash
pnpm test:run
```

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Authentication Setup

This app uses Supabase for authentication with magic link sign-in. After setting up your environment variables:

1. **Sign up**: Visit `/auth` and enter your email
2. **Check email**: Click the magic link in your email
3. **Access dashboard**: You'll be redirected to `/dashboard`

## Seeding Sample Data

To populate your app with sample data for testing and development:

1. **Get your User ID**:
   - Sign in to your app
   - Go to Supabase Dashboard → Authentication → Users
   - Copy your user ID (UUID format)

2. **Update the seed file**:
   - Open `supabase/seed_user.sql`
   - Replace `:my_uid` with your actual user ID
   - Example: `'550e8400-e29b-41d4-a716-446655440001'` → `'your-actual-uuid-here'`

3. **Run the seed file**:
   - Go to Supabase Dashboard → SQL Editor
   - Paste the updated seed file content
   - Click "Run" to execute

The seed file will create sample:
- **Goals**: 5 sample goals (writing, guitar, marathon, business, Spanish)
- **Projects**: 5 linked projects with realistic timelines
- **Tasks**: 9 tasks linked to projects with priorities and due dates
- **Habits**: 8 daily habits with streak tracking
- **Skills**: 10 skills across different categories with current/target levels
- **Monuments**: 8 achievements with impact levels
- **Schedule Items**: 8 calendar events for the schedule page

All data is properly linked and includes realistic relationships between entities.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Database Migrations

- **Link your Supabase project**

```bash
npx supabase link
# follows prompts and creates supabase/config.toml
```

- **Baseline from remote (capture current schema as a migration)**

```bash
npx supabase db pull
```

- **Local-first change flow**
  - Make schema changes locally (SQL migration or via local DB while `supabase start` is running).
  - Generate a migration from your local changes, then apply to the linked project:

```bash
npx supabase db diff -f <name>
npx supabase db push
```

- **Include auth and storage schemas when needed**

```bash
# pull all relevant schemas
npx supabase db pull --schema public,auth,storage

# or generate diffs including auth/storage
npx supabase db diff -f <name> --schema public,auth,storage
```

- **Drift recovery playbook**
  - If changes were made directly in Studio or on the remote DB, baseline them into git:

```bash
npx supabase db pull   # creates a timestamped remote_schema migration
```

  - If a migration was applied manually or got out of sync, inspect and repair the history:

```bash
npx supabase migration list
npx supabase migration repair --status applied <version>   # or --status reverted
```

  - After baselining/repair, return to the local-first flow (`db diff` → `db push`).

## Payments & Stripe Connect

SHELL's multi-tenant payments layer uses Stripe Connect (Express) with Prisma + SQLite. To run it locally:

1. **Environment variables** – copy `.env.local` (or update your existing file) with:
   ```bash
   STRIPE_SECRET_KEY=sk_test_xxx
   STRIPE_WEBHOOK_SECRET=whsec_xxx
   APP_URL=http://localhost:3000
   ```
   Replace the placeholders with keys from your Stripe account / Stripe CLI.
2. **Generate Prisma client and apply the initial schema**
   ```bash
   pnpm prisma:migrate
   pnpm prisma:generate
   ```
3. **Seed local data**
   ```bash
   pnpm db:seed
   ```
   This creates a sample business (`taco-fiesta`) with menu items for quick testing.
4. **Start the Next.js dev server**
   ```bash
   pnpm dev
   ```
5. **Onboard a test food truck** – POST to `/api/connect/onboard` with the business ID returned in the seed output. Follow the returned onboarding link to complete Express setup.
6. **Create a Checkout Session** – POST to `/api/checkout/taco-fiesta` with a payload like:
   ```json
   {
     "items": [{ "name": "Al Pastor Taco", "priceCents": 899, "quantity": 2 }],
     "tipCents": 200,
     "taxCents": 150,
     "orderMetadata": { "table": "N/A" }
   }
   ```
7. **Listen for webhooks** – in another terminal run:
   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```
8. **Test the payment flow** – open the Checkout Session URL, pay with `4242 4242 4242 4242`, and confirm the order transitions to `PAID` via the webhook.

The platform charges the business-specific application fee (bps) and transfers the remainder to the truck's connected account automatically via destination charges.
