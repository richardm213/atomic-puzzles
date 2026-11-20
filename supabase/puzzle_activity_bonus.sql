-- Apply in Firefox on the current database alongside the frontend deployment.
-- Keep the curve aligned with shared/domain/puzzles/puzzleLeaderboard.ts.
-- Trophies are calculated on demand, including historical monthly rankings.
begin;
CREATE OR REPLACE FUNCTION public.get_puzzle_ranking_trophies()
 RETURNS TABLE(username text, month text, rank bigint, eligible boolean, rating double precision, rating_deviation double precision, attempted bigint, correct bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with monthly as (
    select
      to_char(date_trunc('month', event.attempted_at at time zone 'UTC'), 'YYYY-MM') as event_month,
      lower(trim(event.username)) as normalized_username,
      count(*)::bigint as attempted_count,
      count(*) filter (where event.puzzle_correct)::bigint as correct_count,
      (array_agg(event.user_rating_after order by event.attempted_at desc))[1]::double precision
        as final_rating,
      (array_agg(event.user_rd_after order by event.attempted_at desc))[1]::double precision
        as final_rating_deviation
    from public.puzzle_rating_events event
    group by
      to_char(date_trunc('month', event.attempted_at at time zone 'UTC'), 'YYYY-MM'),
      lower(trim(event.username))
  ),
  eligible_rows as (
    select
      monthly.*,
      -- Match JS rounding: 4,000 attempts first reaches 99.5, displayed as +100.
      least(
        100,
        round(100 * (1 - exp(-monthly.attempted_count::double precision / (4000.0 / ln(200.0)))))
      )::bigint as activity_bonus
    from monthly
    where monthly.attempted_count >= 20
      and monthly.final_rating_deviation < 60
  ),
  ranked as (
    select
      eligible_rows.*,
      rank() over (
        partition by eligible_rows.event_month
        order by eligible_rows.final_rating + eligible_rows.activity_bonus desc
      ) as placement
    from eligible_rows
  )
  select
    ranked.normalized_username,
    ranked.event_month,
    ranked.placement,
    true,
    ranked.final_rating,
    ranked.final_rating_deviation,
    ranked.attempted_count,
    ranked.correct_count
  from ranked
  where ranked.placement <= 10
  order by ranked.event_month desc, ranked.placement, ranked.normalized_username;
$function$;

commit;
