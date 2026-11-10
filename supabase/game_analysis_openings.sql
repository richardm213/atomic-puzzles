begin;

create table if not exists public.game_analysis_openings (
  fen_key text primary key,
  data jsonb not null,
  fetched_at timestamptz not null
);

alter table public.game_analysis_openings enable row level security;
revoke all on table public.game_analysis_openings from public, anon, authenticated;
grant select, insert, update on table public.game_analysis_openings to service_role;

-- Ordinary worker writes still cannot clobber a completed search. The maintenance
-- backfill can replace it, and the worker may upgrade an older payload to 5x5.
create or replace function public.preserve_completed_game_analysis_position()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.completed and not (
    new.completed
    and new.data->>'variationPlies' is not distinct from '5'
    and (new.request_status is not distinct from 'refreshed'
         or old.data->>'variationPlies' is distinct from '5')
  ) then
    new.completed := true;
    new.data := old.data;
    new.completed_at := old.completed_at;
    new.error := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

commit;
