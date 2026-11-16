-- Run in Firefox against the current database. All fixtures and settlement writes roll back.
begin;
do $$
declare
  market_id text := 'notification-binary-' || gen_random_uuid()::text;
begin
  insert into public.prediction_markets (
    id, question, resolution_rules, resolution_source_url, closes_at, status, display_name
  ) values (
    market_id, 'Binary notification regression', 'Test fixture', 'https://atomicpuzzles.org/betting', now() + interval '1 day',
    'open', 'Binary notification regression'
  );
  -- Binary markets have no player labels or tournament score row. Resolution must still
  -- reach the payout notification trigger successfully, including when there are no bettors.
  perform public.resolve_prediction_market(market_id, 'no');
  if not exists (
    select 1 from public.prediction_markets
    where id = market_id and status = 'resolved' and outcome = 'no'
  ) then raise exception 'Binary market resolution failed'; end if;
end;
$$;
rollback;
select 'PASS: binary markets without player labels resolve through the notification trigger' as result;
