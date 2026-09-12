-- ==============================================================================
-- QuestTime Supabase Postgres Schema & Row-Level Security (RLS) Policies
-- ==============================================================================

-- 1. Enable UUID Extension
create extension if not exists "uuid-ossp";

-- 2. Categories Table
create table if not exists public.categories (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#6366f1',
  icon text not null default 'Clock',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Sessions Table
create table if not exists public.sessions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id text not null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  duration_sec integer not null default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. Weekly Targets Table
create table if not exists public.weekly_targets (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id text not null,
  target_hours numeric not null default 0,
  week_start_date text not null, -- YYYY-MM-DD (Monday)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category_id, week_start_date)
);

-- 5. Gamification State Table
create table if not exists public.gamification_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  xp integer not null default 0,
  level integer not null default 0,
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  last_active_date text,
  badges jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- ==============================================================================
-- Row-Level Security (RLS)
-- ==============================================================================

alter table public.categories enable row level security;
alter table public.sessions enable row level security;
alter table public.weekly_targets enable row level security;
alter table public.gamification_state enable row level security;

-- Categories RLS
create policy "Users can read own categories"
  on public.categories for select
  using (auth.uid() = user_id);

create policy "Users can insert own categories"
  on public.categories for insert
  with check (auth.uid() = user_id);

create policy "Users can update own categories"
  on public.categories for update
  using (auth.uid() = user_id);

create policy "Users can delete own categories"
  on public.categories for delete
  using (auth.uid() = user_id);

-- Sessions RLS
create policy "Users can read own sessions"
  on public.sessions for select
  using (auth.uid() = user_id);

create policy "Users can insert own sessions"
  on public.sessions for insert
  with check (auth.uid() = user_id);

create policy "Users can update own sessions"
  on public.sessions for update
  using (auth.uid() = user_id);

create policy "Users can delete own sessions"
  on public.sessions for delete
  using (auth.uid() = user_id);

-- Weekly Targets RLS
create policy "Users can read own weekly targets"
  on public.weekly_targets for select
  using (auth.uid() = user_id);

create policy "Users can insert own weekly targets"
  on public.weekly_targets for insert
  with check (auth.uid() = user_id);

create policy "Users can update own weekly targets"
  on public.weekly_targets for update
  using (auth.uid() = user_id);

create policy "Users can delete own weekly targets"
  on public.weekly_targets for delete
  using (auth.uid() = user_id);

-- Gamification State RLS
create policy "Users can read own gamification state"
  on public.gamification_state for select
  using (auth.uid() = user_id);

create policy "Users can insert own gamification state"
  on public.gamification_state for insert
  with check (auth.uid() = user_id);

create policy "Users can update own gamification state"
  on public.gamification_state for update
  using (auth.uid() = user_id);

-- Create helpful indexes
create index if not exists idx_sessions_user_time on public.sessions(user_id, start_time desc);
create index if not exists idx_sessions_user_cat on public.sessions(user_id, category_id);
create index if not exists idx_targets_user_week on public.weekly_targets(user_id, week_start_date);
