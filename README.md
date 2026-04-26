# Marathon Control

Marathon Control is a single-page React + Vite tracker for a 21-day marathon taper plan. It is offline-first with localStorage persistence and optional Supabase sync.

## Local Setup

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## Supabase Sync

The app works fully without Supabase. To enable sync, create a local `.env` file from `.env.example`:

```bash
cp .env.example .env
```

Set:

```bash
VITE_SUPABASE_URL=https://lzavizpusbytyufmpbdq.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_ejSfQOqhatSOyusZ7_yaHA_O7A824v1
```

Do not commit `.env`. Only the publishable anon key belongs in client-side Vite configuration. Never use or commit a database password.

Create the Supabase table:

```sql
create table if not exists training_progress (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
```

The app uses the fixed record id `andre-marathon-2026`. On load it reads localStorage first, then fetches Supabase if configured, compares `lastUpdated`, and keeps the newer state.

## Backup

Use **Export backup** to download progress as JSON. Use **Import backup** to restore from a JSON backup; the app asks for confirmation before overwriting current progress.

## Static Deployment

The app builds to `dist/` and can be deployed on GitHub Pages or any static host. For GitHub Pages, publish the generated `dist` directory with your preferred Pages workflow. Supabase environment variables must be configured in the deployment environment if remote sync is desired.
