-- Keep each rated solver's average puzzle time beside their rating summary.
-- Durations over 15 minutes are excluded rather than capped.
begin;

alter table public.puzzle_user_ratings
  add column if not exists timed_attempts integer not null default 0,
  add column if not exists total_duration_ms bigint not null default 0;

alter table public.puzzle_user_ratings
  drop constraint if exists puzzle_user_ratings_timed_attempts_check,
  add constraint puzzle_user_ratings_timed_attempts_check check (timed_attempts >= 0),
  drop constraint if exists puzzle_user_ratings_total_duration_ms_check,
  add constraint puzzle_user_ratings_total_duration_ms_check check (total_duration_ms >= 0);

alter table public.puzzle_user_ratings
  add column if not exists average_time_seconds integer generated always as (
    case
      when timed_attempts = 0 then null
      else round(total_duration_ms::numeric / timed_attempts / 1000)::integer
    end
  ) stored;

comment on column public.puzzle_user_ratings.average_time_seconds is
  'Average rated first-attempt duration in seconds, excluding durations above 15 minutes.';

create or replace function public.refresh_puzzle_user_average_time(p_username text)
returns void
language sql
security definer
set search_path = public
as $$
  with summary as (
    select
      count(*)::integer as timed_attempts,
      coalesce(sum(progress.first_attempt_duration_ms), 0)::bigint as total_duration_ms
    from public.puzzle_progress progress
    where lower(btrim(progress.username)) = lower(btrim(p_username))
      and progress.rated
      and progress.first_attempt_duration_ms between 0 and 900000
  )
  update public.puzzle_user_ratings rating
  set
    timed_attempts = summary.timed_attempts,
    total_duration_ms = summary.total_duration_ms
  from summary
  where rating.username = lower(btrim(p_username));
$$;

create or replace function public.track_puzzle_user_average_time()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_puzzle_user_average_time(old.username);
  elsif tg_op = 'INSERT' then
    perform public.refresh_puzzle_user_average_time(new.username);
  else
    if lower(btrim(new.username)) <> lower(btrim(old.username)) then
      perform public.refresh_puzzle_user_average_time(old.username);
    end if;
    perform public.refresh_puzzle_user_average_time(new.username);
  end if;
  return null;
end;
$$;

drop trigger if exists track_puzzle_user_average_time on public.puzzle_progress;
create trigger track_puzzle_user_average_time
  after insert or update of username, rated, first_attempt_duration_ms or delete
  on public.puzzle_progress
  for each row
  execute function public.track_puzzle_user_average_time();

with summaries as (
  select
    lower(btrim(progress.username)) as username,
    count(*)::integer as timed_attempts,
    coalesce(sum(progress.first_attempt_duration_ms), 0)::bigint as total_duration_ms
  from public.puzzle_progress progress
  where progress.rated
    and progress.first_attempt_duration_ms between 0 and 900000
  group by lower(btrim(progress.username))
)
update public.puzzle_user_ratings rating
set
  timed_attempts = coalesce(summary.timed_attempts, 0),
  total_duration_ms = coalesce(summary.total_duration_ms, 0)
from (
  select
    rating_row.username,
    summaries.timed_attempts,
    summaries.total_duration_ms
  from public.puzzle_user_ratings rating_row
  left join summaries on summaries.username = rating_row.username
) summary
where rating.username = summary.username;

grant select (timed_attempts, total_duration_ms, average_time_seconds)
  on table public.puzzle_user_ratings to anon, authenticated;

commit;

notify pgrst, 'reload schema';
