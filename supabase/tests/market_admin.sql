-- Run in Firefox against the current database after market_admin.sql.
-- All fixtures, results, payouts and notifications roll back.
begin;
create function pg_temp.market_admin_plan(market_id text, method text default 'binary', reference_id bigint default null)
returns jsonb language plpgsql as $$
declare plan jsonb; price numeric:=100; participants integer;
begin
 if method='price' then select case outcome when 'yes' then price_cents else 100-price_cents end into price from public.prediction_fills where id=reference_id; end if;
 select count(*) into participants from (
  select username from public.prediction_positions where prediction_positions.market_id=market_admin_plan.market_id and quantity>0
  union select buyer_username from public.prediction_fills where prediction_fills.market_id=market_admin_plan.market_id
  union select seller_username from public.prediction_fills where prediction_fills.market_id=market_admin_plan.market_id and seller_username is not null
  union select username from public.prediction_legacy_position_credits where prediction_legacy_position_credits.market_id=market_admin_plan.market_id
 ) u where username<>'prediction_admin';
 plan:=jsonb_build_object(
  'actor','seaside_tiramisu','operationKey','market-admin:'||md5(market_id||method)||md5(market_id||method),
  'input',jsonb_build_object('kind','binary'),'eventId',null,
  'expectedMarkets',(select jsonb_agg(to_jsonb(m)) from public.prediction_markets m where id=market_id),
  'expectedPositions',coalesce((select jsonb_agg(to_jsonb(p)) from public.prediction_positions p where p.market_id=market_admin_plan.market_id),'[]'::jsonb),
  'expectedBets','[]'::jsonb,'expectedLegacy','[]'::jsonb,'legacyResolutions','[]'::jsonb,
  'expectedPayments',coalesce((select jsonb_agg(to_jsonb(p)) from (
   select username,sum(round(quantity*(case outcome when 'yes' then price else 100-price end)/100,6)) amount
   from public.prediction_positions p where p.market_id=market_admin_plan.market_id and quantity>0 group by username
  ) p),'[]'::jsonb),
  'settlements',jsonb_build_array(jsonb_build_object('id',market_id,'method',method,'outcome',case when method='binary' then 'yes' end,
   'referenceFillId',reference_id,'price',price,'message','Alpha won 6–2.','legacyBetIds','[]'::jsonb,'refunds','[]'::jsonb)),
  'summary',jsonb_build_object('notificationCount',participants));
 return plan;
end;
$$;

do $$
<<market_admin_test>>
declare
 suffix text:=substr(gen_random_uuid()::text,1,8);
 trader text:='market-admin-trader-'||suffix;
 maker text:='market-admin-maker-'||suffix;
 quitter text:='market-admin-exit-'||suffix;
 market_id text:='market-admin-'||suffix;
 event_id text:='market-admin-event-'||suffix;
 plan jsonb; bad_plan jsonb; receipt jsonb; expected numeric; before_wallet numeric;
 rejected boolean:=false;
 reference_id bigint;
begin
 if has_function_privilege('anon','public.apply_admin_market_resolution(jsonb)','execute')
 or has_function_privilege('authenticated','public.refresh_atomic_tour_event_entries_for_event(text)','execute')
 or has_table_privilege('anon','public.market_admin_resolution_receipts','select') then raise exception 'Admin capabilities exposed'; end if;
 insert into public.users(id,username) overriding system value values
 (-floor(random()*9000000000000000)::bigint,trader),(-floor(random()*9000000000000000)::bigint,maker),(-floor(random()*9000000000000000)::bigint,quitter);
 perform public.apply_coin_transaction(trader,1000,'daily_bonus',market_id||':trader');
 perform public.apply_coin_transaction(maker,1000,'daily_bonus',market_id||':maker');
 perform public.apply_coin_transaction(quitter,1000,'daily_bonus',market_id||':exit');
 insert into public.prediction_markets(id,question,resolution_rules,resolution_source_url,closes_at,status)
 values(market_id,'Admin settlement regression','Fixture','https://atomicpuzzles.org/betting',now()+interval '1 day','open');
 perform public.place_prediction_order(maker,market_id,'no','buy',60,20);
 perform public.place_prediction_order(trader,market_id,'yes','buy',40,10);
 perform public.place_prediction_order(quitter,market_id,'yes','buy',40,10);
 perform public.place_prediction_order(trader,market_id,'yes','buy',30,10);
 perform public.place_prediction_order(quitter,market_id,'yes','sell',30,10);
 -- An outstanding reservation must also disappear at settlement.
 perform public.place_prediction_order(trader,market_id,'yes','sell',95,10);
 plan:=pg_temp.market_admin_plan(market_id);
 -- A bad verification must roll back the entire result, including notifications.
 bad_plan:=jsonb_set(plan,'{summary,notificationCount}','99');
 begin perform public.apply_admin_market_resolution(bad_plan); exception when others then rejected:=true; end;
 if not rejected or (select status from public.prediction_markets where id=market_id)<>'open'
 or exists(select 1 from public.market_admin_resolution_receipts where operation_key=market_admin_test.plan->>'operationKey')
 or exists(select 1 from public.notifications where feature_key like 'prediction-market-payout:tournament:'||market_id||':%')
 then raise exception 'A failed settlement partially committed'; end if;
 -- Snapshot mismatches must reject before any result is written.
 rejected:=false;
 begin perform public.apply_admin_market_resolution(jsonb_set(plan,'{expectedMarkets,0,question}','"Stale preview"')); exception when others then rejected:=true; end;
 if not rejected then raise exception 'A stale preview was accepted'; end if;
 select balance into before_wallet from public.coin_accounts where username=trader;
 receipt:=public.apply_admin_market_resolution(plan);
 if public.apply_admin_market_resolution(plan)<>receipt then raise exception 'Retry did not return the original receipt'; end if;
 if (select balance from public.coin_accounts where username=trader)-before_wallet<>20 then raise exception 'Wrong payout or duplicate payout'; end if;
 if (select count(*) from public.notifications where feature_key like 'prediction-market-payout:tournament:'||market_id||':%')<>3
 or not exists(select 1 from public.notifications where recipient_username=quitter and feature_key='prediction-market-payout:tournament:'||market_id||':'||quitter and feature_message like '%No payout')
 then raise exception 'Losing/exited trader notification missing'; end if;
 if exists(select 1 from public.prediction_orders where prediction_orders.market_id=market_admin_test.market_id and status in('open','partial')) then raise exception 'Open order survived'; end if;

 -- Price settlement, using the actual fair-trade reference and all held sides.
 market_id:=market_id||'-price';
 insert into public.prediction_markets(id,question,resolution_rules,resolution_source_url,closes_at,status)
 values(market_id,'Fair-price regression','Fixture','https://atomicpuzzles.org/betting',now()+interval '1 day','open');
 perform public.place_prediction_order(maker,market_id,'no','buy',70,10);
 perform public.place_prediction_order(trader,market_id,'yes','buy',30,10);
 select max(id) into reference_id from public.prediction_fills where prediction_fills.market_id=market_admin_test.market_id;
 select balance into before_wallet from public.coin_accounts where username=trader;
 plan:=pg_temp.market_admin_plan(market_id,'price',reference_id);
 perform public.apply_admin_market_resolution(plan);
 perform public.apply_admin_market_resolution(plan);
 if (select balance from public.coin_accounts where username=trader)-before_wallet<>3
 or (select settlement_price_cents from public.prediction_markets where id=market_id)<>30 then raise exception 'Price settlement incorrect'; end if;

 -- A result, both feeder destinations, awards and event entries commit together.
 insert into public.tournament_catalog
 select (jsonb_populate_record(null::public.tournament_catalog,to_jsonb(c)||jsonb_build_object('id',event_id,'title','Admin regression '||suffix,'start_date',current_date-10,'end_date',current_date+10))).*
 from public.tournament_catalog c where id='awc2026';
 insert into public.atomic_tour_events
 select (jsonb_populate_record(null::public.atomic_tour_events,to_jsonb(e)||jsonb_build_object('tournament_id',event_id,'starts_on',current_date-10,'ends_on',current_date+10))).*
 from public.atomic_tour_events e where tournament_id='awc2026';
 insert into public.tournament_matches(tournament,bracket,round,"order",id,p1,p2,s1,s2,winner_to,loser_to)
 values(event_id,'main','Semifinals',1,'semi',trader,maker,0,0,'final','lower'),
 (event_id,'main','Finals',1,'final','','',0,0,'',''),(event_id,'losers','Final',1,'lower','','',0,0,'','');
 market_id:=market_id||'-event';
 insert into public.prediction_markets(id,question,resolution_rules,resolution_source_url,closes_at,status)
 values(market_id,'Tournament regression','Fixture','https://atomicpuzzles.org/betting',now()+interval '1 day','open');
 plan:=pg_temp.market_admin_plan(market_id)||jsonb_build_object('eventId',event_id,
 'expectedFixtures',(select jsonb_agg(to_jsonb(f)) from public.tournament_matches f where tournament=event_id),
 'fixtureChanges',jsonb_build_array(jsonb_build_object('tournament',event_id,'id','semi','patch',jsonb_build_object('s1',6,'s2',2,'played_on',current_date)),
 jsonb_build_object('tournament',event_id,'id','final','patch',jsonb_build_object('p1',trader)),jsonb_build_object('tournament',event_id,'id','lower','patch',jsonb_build_object('p2',maker))),
 'expectedAwards','[]'::jsonb,'awards',jsonb_build_array(jsonb_build_object('award_key',event_id||':placement','tournament_id',event_id,'player_name',trader,
 'source_type','placement','source_key','placement','awarded_on',current_date,'expires_on',current_date+365,'points',20,'description','Regression')));
 perform public.apply_admin_market_resolution(plan);
 if (select p1 from public.tournament_matches where tournament=event_id and id='final')<>trader
 or (select p2 from public.tournament_matches where tournament=event_id and id='lower')<>maker
 or not exists(select 1 from public.atomic_tour_event_entries where tournament_id=event_id and player_name=trader and points_earned=20)
 then raise exception 'Tournament checklist did not complete'; end if;
end;
$$;
rollback;
