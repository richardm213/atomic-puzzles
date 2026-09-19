-- User-owned training sets built from puzzles the owner has already attempted.
-- The site authenticates Lichess users in its Netlify functions, so only the
-- service role may access these tables directly.
create extension if not exists pgcrypto;

create table if not exists public.custom_puzzle_sets (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  tag_filters text[] not null default '{}',
  author_filter text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists custom_puzzle_sets_username_name_unique
  on public.custom_puzzle_sets (lower(username), lower(name));
create index if not exists custom_puzzle_sets_username_updated_idx
  on public.custom_puzzle_sets (lower(username), updated_at desc);

create table if not exists public.custom_puzzle_set_items (
  set_id uuid not null references public.custom_puzzle_sets(id) on delete cascade,
  puzzle_id text not null,
  position integer not null check (position >= 0),
  completed_at timestamptz,
  last_result boolean,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  primary key (set_id, puzzle_id),
  unique (set_id, position)
);

create index if not exists custom_puzzle_set_items_progress_idx
  on public.custom_puzzle_set_items (set_id, completed_at, position);

alter table public.custom_puzzle_sets enable row level security;
alter table public.custom_puzzle_set_items enable row level security;

revoke all on table public.custom_puzzle_sets from public, anon, authenticated;
revoke all on table public.custom_puzzle_set_items from public, anon, authenticated;
grant select, insert, update, delete on table public.custom_puzzle_sets to service_role;
grant select, insert, update, delete on table public.custom_puzzle_set_items to service_role;

comment on table public.custom_puzzle_sets is
  'Named, user-owned static puzzle sets created from that user''s existing puzzle_progress rows.';
comment on table public.custom_puzzle_set_items is
  'Ordered membership and resettable per-set training progress.';

notify pgrst, 'reload schema';
