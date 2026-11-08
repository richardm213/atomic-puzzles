-- November 8 schedule confirmed by the tournament director:
-- https://lichess.org/forum/team-atomic-wc/2026-awc-rounds-and-results?page=18
begin;

alter table public.tournament_matches
  add column if not exists scheduled_at timestamptz;

create extension if not exists pg_cron;

do $schedule$
declare
  fixture record;
  updated_rows integer;
  market_ids text[];
  match_market_id text;
  job_name text;
begin
  if position('apply_coin_transaction' in
    pg_get_functiondef('public.cancel_prediction_market_orders(text)'::regprocedure)) > 0 then
    raise exception 'Expected the charge-on-fill order cancellation helper';
  end if;

  for fixture in
    select * from (values
      ('wb-r1-m1', 'natso', 'crepuscular', 'crepuscular', '2026-11-08 12:00:00+00'::timestamptz),
      ('wb-r1-m2', 'maracker', 'rabbier', 'rabbier', '2026-11-08 08:00:00+00'::timestamptz),
      ('wb-r1-m4', 'sutcunuri', 'tolya_starina0995', 'tolya-starina0995', '2026-11-08 12:00:00+00'::timestamptz),
      ('wb-r1-m6', 'judebaetorrens', 'theatomicstorm', 'theatomicstorm', '2026-11-08 19:00:00+00'::timestamptz)
    ) as f(match_id, player_one, player_two, player_two_market_slug, kickoff)
  loop
    if fixture.kickoff <= clock_timestamp() then
      raise exception 'Kickoff has already passed for %', fixture.match_id;
    end if;

    update public.tournament_matches
    set scheduled_at = fixture.kickoff
    where tournament = 'awc2026' and bracket = 'main' and round = 'Round of 16'
      and id = fixture.match_id
      and (
        (lower(p1) = fixture.player_one and lower(p2) = fixture.player_two)
        or (lower(p2) = fixture.player_one and lower(p1) = fixture.player_two)
      )
      and coalesce(match_id, '') = '' and played_on is null
      and coalesce(s1, 0) = 0 and coalesce(s2, 0) = 0;
    get diagnostics updated_rows = row_count;
    if updated_rows <> 1 then
      raise exception 'Expected one unplayed AWC 2026 bracket row for %, found %',
        fixture.match_id, updated_rows;
    end if;

    match_market_id := 'awc2026-' || fixture.match_id;
    market_ids := array[
      match_market_id,
      'awc-2026-champion-' || fixture.player_one,
      'awc-2026-champion-' || fixture.player_two_market_slug
    ];

    if (select count(*) from public.prediction_markets
        where id = any(market_ids)
          and ((id = match_market_id and group_id = 'awc-2026-round-of-16')
            or (id <> match_market_id and group_id = 'awc-2026-champion'))) <> 3 then
      raise exception 'Missing or unexpected prediction market for %', fixture.match_id;
    end if;

    -- Reject new R16 trades at kickoff even if the scheduler is late. Champion markets
    -- stay open: only the outstanding orders at kickoff are cleared, not filled positions.
    update public.prediction_markets
    set closes_at = least(closes_at, fixture.kickoff), updated_at = now()
    where id = match_market_id and status = 'open';

    job_name := 'awc2026-kickoff-' || fixture.match_id;
    -- Retry at the next minute if a run fails. After success the job removes itself.
    perform cron.schedule(job_name, '* * * * *', format($job$
      do $cancel$
      declare
        target_id text;
      begin
        if clock_timestamp() < %L::timestamptz then
          return;
        end if;

        for target_id in select id from unnest(%L::text[]) as targets(id) order by id
        loop
          perform pg_advisory_xact_lock(hashtext('prediction-market:' || target_id));
          perform public.cancel_prediction_market_orders(target_id);
        end loop;

        update public.prediction_markets
        set status = 'closed', updated_at = now()
        where id = %L and status = 'open';

        if not cron.unschedule(%L) then
          raise exception 'Could not remove the completed kickoff job';
        end if;
      end;
      $cancel$;
    $job$, fixture.kickoff, market_ids, match_market_id, job_name));
  end loop;
end;
$schedule$;

commit;
