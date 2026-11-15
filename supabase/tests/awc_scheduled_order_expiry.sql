-- Run in Firefox against the current database; every fixture and edit rolls back.
begin;
do $$
declare
  fixture public.tournament_matches%rowtype;
  market public.prediction_markets%rowtype;
  kickoff timestamptz := now() + interval '2 days';
  moved timestamptz := now() + interval '3 days';
  item record;
begin
  select * into strict fixture from public.tournament_matches
  where tournament='awc2026' and id='wb-r2-m2';
  select * into strict market from public.prediction_markets where id='awc2026-wb-r2-m2';
  insert into public.tournament_matches select (jsonb_populate_record(
    null::public.tournament_matches, to_jsonb(fixture) || jsonb_build_object(
      'id','expiry-test','p1','expiry_alice','p2','expiry_bob','scheduled_at',null,
      'played_on',null,'match_id',null,'s1',0,'s2',0,'outcome_type',null,
      'winner_to',null,'loser_to',null))).*;
  for item in select * from (values
    ('awc2026-expiry-test','expiry-test','expiry_alice vs expiry_bob'),
    ('awc-expiry-alice','awc-2026-champion','expiry_alice'),
    ('awc-expiry-bob','awc-2026-champion','expiry_bob'),
    ('awc-expiry-other','awc-2026-champion','expiry_other')
  ) as rows(id,group_id,display_name) loop
    insert into public.prediction_markets select (jsonb_populate_record(
      null::public.prediction_markets, to_jsonb(market) || jsonb_build_object(
        'id',item.id,'group_id',item.group_id,'display_name',item.display_name))).*;
  end loop;
  for item in select * from (values
    (-90001,'awc2026-expiry-test','prediction_admin','open',null::timestamptz,10),
    (-90002,'awc-expiry-alice','prediction_admin','partial',null::timestamptz,5),
    (-90003,'awc-expiry-bob','prediction_admin','open',null::timestamptz,10),
    (-90004,'awc-expiry-other','prediction_admin','open',null::timestamptz,10),
    (-90005,'awc2026-expiry-test','expiry_user','open',null::timestamptz,10),
    (-90006,'awc2026-expiry-test','prediction_admin','open',now()-interval '1 hour',10),
    (-90007,'awc2026-expiry-test','prediction_admin','filled',null::timestamptz,0)
  ) as rows(id,market_id,username,status,expires_at,remaining_quantity) loop
    insert into public.prediction_orders
      (id,market_id,username,outcome,side,price_cents,quantity,filled_quantity,remaining_quantity,status,expires_at)
    values (item.id,item.market_id,item.username,'yes','buy',50,10,
      10-item.remaining_quantity,item.remaining_quantity,item.status,item.expires_at);
  end loop;

  -- Announcing a match changes both sides and each player's championship quotes only.
  update public.tournament_matches set scheduled_at=kickoff where tournament='awc2026' and id='expiry-test';
  if (select count(*) from public.prediction_orders where id in (-90001,-90002,-90003) and expires_at=kickoff) <> 3 then
    raise exception 'Schedule failed to synchronize related active quotes'; end if;
  if exists(select 1 from public.prediction_orders where id in (-90004,-90005,-90007) and expires_at is not null)
    or (select expires_at from public.prediction_orders where id=-90006) <> now()-interval '1 hour' then
    raise exception 'Unrelated, user, filled, or expired order changed'; end if;

  -- Reschedules may move the deadline in either direction without reviving expired quotes.
  update public.tournament_matches set scheduled_at=moved where tournament='awc2026' and id='expiry-test';
  if (select count(*) from public.prediction_orders where id in (-90001,-90002,-90003) and expires_at=moved) <> 3 then
    raise exception 'Later reschedule failed'; end if;
  update public.tournament_matches set scheduled_at=kickoff where tournament='awc2026' and id='expiry-test';
  if (select count(*) from public.prediction_orders where id in (-90001,-90002,-90003) and expires_at=kickoff) <> 3 then
    raise exception 'Earlier reschedule failed'; end if;
  if exists(select 1 from public.sync_awc_2026_admin_order_expiry('expiry-test')) then
    raise exception 'Unchanged schedule was not idempotent'; end if;

  -- New admin quotes inherit kickoff, but an explicitly earlier expiry is preserved.
  insert into public.prediction_orders
    (id,market_id,username,outcome,side,price_cents,quantity,remaining_quantity)
  values (-90008,'awc-expiry-bob','prediction_admin','yes','buy',50,10,10);
  if (select expires_at from public.prediction_orders where id=-90008) <> kickoff then
    raise exception 'New championship quote did not inherit kickoff'; end if;
  update public.prediction_orders set expires_at=now()+interval '1 day' where id=-90008;
  if (select expires_at from public.prediction_orders where id=-90008) <> now()+interval '1 day' then
    raise exception 'Explicit earlier expiration was lost'; end if;
  if has_function_privilege('anon','public.sync_awc_2026_admin_order_expiry(text)','EXECUTE')
    or has_function_privilege('authenticated','public.sync_awc_2026_admin_order_expiry(text)','EXECUTE') then
    raise exception 'Expiry synchronizer is publicly callable'; end if;
end;
$$;
rollback;
select 'AWC scheduled order expiry regression passed' as result;
