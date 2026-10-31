-- Enforce the per-user UTC-day puzzle attempt ceiling at the data boundary.
-- The advisory lock prevents concurrent tabs from crossing the limit together.

begin;

create or replace function public.enforce_daily_puzzle_attempt_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_username text := public.canonical_user_username(new.username);
  attempt_day_start timestamptz := date_trunc('day', new.first_attempt_at at time zone 'UTC') at time zone 'UTC';
  attempts_on_day integer;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('daily-puzzle-attempt:' || normalized_username || ':' || attempt_day_start::text, 0)
  );

  select count(*)::integer
  into attempts_on_day
  from public.puzzle_progress progress
  where public.canonical_user_username(progress.username) = normalized_username
    and progress.first_attempt_at >= attempt_day_start
    and progress.first_attempt_at < attempt_day_start + interval '1 day'
    and (
      tg_op = 'INSERT'
      or progress.username <> old.username
      or progress.puzzle_id <> old.puzzle_id
    );

  if attempts_on_day >= 200 then
    raise exception 'daily_puzzle_attempt_limit_reached'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_daily_puzzle_attempt_limit on public.puzzle_progress;

create trigger enforce_daily_puzzle_attempt_limit
  before insert or update of first_attempt_at
  on public.puzzle_progress
  for each row
  execute function public.enforce_daily_puzzle_attempt_limit();

revoke all on function public.enforce_daily_puzzle_attempt_limit() from public, anon, authenticated;

commit;

notify pgrst, 'reload schema';
