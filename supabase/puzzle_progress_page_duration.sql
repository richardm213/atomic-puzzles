-- Expose recorded first-attempt durations to the puzzle dashboard calendar and attempt table.
begin;

create or replace function public.get_puzzle_progress_page_v3(
  p_username text,
  p_page integer default 1,
  p_page_size integer default 20
)
returns table (
  puzzle_id text,
  first_attempt_at timestamptz,
  first_attempt_duration_ms integer,
  puzzle_correct boolean,
  rated boolean,
  total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    progress.puzzle_id,
    progress.first_attempt_at,
    progress.first_attempt_duration_ms,
    progress.puzzle_correct,
    progress.rated,
    count(*) over () as total_count
  from public.puzzle_progress progress
  where progress.username = lower(btrim(p_username))
  order by progress.first_attempt_at desc, progress.puzzle_id
  limit least(1000, greatest(1, coalesce(p_page_size, 20)))
  offset (greatest(1, coalesce(p_page, 1)) - 1)
    * least(1000, greatest(1, coalesce(p_page_size, 20)));
$$;

revoke all on function public.get_puzzle_progress_page_v3(text, integer, integer)
  from public;
grant execute on function public.get_puzzle_progress_page_v3(text, integer, integer)
  to anon, authenticated, service_role;

commit;

notify pgrst, 'reload schema';
