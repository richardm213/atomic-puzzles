-- Batch the profile page's leaderboard denominator lookups into one request.
-- Run this in Supabase before deploying the client that calls get_lb_player_counts.

create index if not exists lb_month_tc_idx
  on public.lb (month, tc);

create or replace function public.get_lb_player_counts(p_pairs jsonb)
returns table (
  month_value text,
  mode text,
  player_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with requested_pairs as (
    select distinct
      pair.month::date as month_value,
      lower(trim(pair.mode)) as mode
    from jsonb_to_recordset(coalesce(p_pairs, '[]'::jsonb)) as pair(month text, mode text)
    where pair.month ~ '^\d{4}-\d{2}-\d{2}$'
      and trim(pair.mode) <> ''
  )
  select
    requested.month_value::text,
    requested.mode,
    count(leaderboard.username)::bigint
  from requested_pairs as requested
  left join public.lb as leaderboard
    on leaderboard.month = requested.month_value
   and leaderboard.tc = requested.mode
  group by requested.month_value, requested.mode
  order by requested.month_value, requested.mode;
$$;

grant execute on function public.get_lb_player_counts(jsonb) to anon, authenticated;
