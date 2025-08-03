# Supabase Configuration

This directory contains Supabase configuration and database migrations for Project-Me.

## Setup

### 1. Install Supabase CLI

```bash
# macOS
brew install supabase/tap/supabase

# or via npm
npm install -g supabase
```

### 2. Login to Supabase

```bash
supabase login
```

### 3. Link to your project

```bash
supabase link --project-ref YOUR_PROJECT_REF
```

You can find your project reference in your Supabase dashboard URL:
`https://supabase.com/dashboard/project/YOUR_PROJECT_REF`

## Running Migrations

### Apply all migrations to remote database

```bash
supabase db push
```

### Create a new migration

```bash
supabase migration new migration_name
```

### Check migration status

```bash
supabase migration list
```

## Local Development

### Start local Supabase

```bash
supabase start
```

### Reset local database (applies all migrations)

```bash
supabase db reset
```

### Stop local Supabase

```bash
supabase stop
```

## Migrations

| Migration | Description |
|-----------|-------------|
| 00001_create_user_profiles.sql | Creates user_profiles table with RLS policies |

## Environment Variables

Ensure these are set in `web-app/.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```
