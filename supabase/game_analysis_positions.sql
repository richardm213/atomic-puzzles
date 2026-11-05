create table if not exists public.game_analysis_positions (
  fen_key text primary key,
  fen text not null,
  request_status text,
  task text,
  completed boolean not null default false,
  data jsonb,
  error text,
  requested_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint game_analysis_positions_completed_data_check
    check (not completed or data is not null)
);

create index if not exists game_analysis_positions_pending_idx
  on public.game_analysis_positions (updated_at)
  where not completed;

revoke all on table public.game_analysis_positions from public, anon, authenticated;
alter table public.game_analysis_positions enable row level security;

create or replace function public.preserve_completed_game_analysis_position()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.completed then
    new.completed := true;
    new.data := old.data;
    new.completed_at := old.completed_at;
    new.error := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists preserve_completed_game_analysis_position
  on public.game_analysis_positions;
create trigger preserve_completed_game_analysis_position
before update on public.game_analysis_positions
for each row execute function public.preserve_completed_game_analysis_position();
