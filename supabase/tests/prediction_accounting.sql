-- Current database, Firefox only. Every fixture, payment and correction rolls back.
begin;
do $$
declare
 suffix text:=substr(gen_random_uuid()::text,1,8);
 trader text:='acct-trader-'||suffix;
 maker text:='acct-maker-'||suffix;
 debtor text:='acct-debt-'||suffix;
 fixture_market text:='accounting-'||suffix;
 legacy_id text;
 order_result jsonb;
 sell_id bigint;
 bet_row public.tournament_bets%rowtype;
 template public.tournament_betting_markets%rowtype;
 before_wallet numeric;
 prepaid boolean;
 rejected boolean;
begin
 if has_function_privilege('anon','public.post_prediction_reconciliation(text,numeric,text,jsonb)','execute')
 or has_function_privilege('authenticated','public.post_coin_transaction_internal(text,numeric,text,text,jsonb,timestamptz,boolean,boolean)','execute') then raise exception 'Private correction capability exposed'; end if;
 insert into public.users(id,username) overriding system value values
 (-floor(random()*9000000000000000)::bigint,trader),(-floor(random()*9000000000000000)::bigint,maker),(-floor(random()*9000000000000000)::bigint,debtor);
 perform public.apply_coin_transaction(debtor,5,'daily_bonus',fixture_market||':debt-seed');
 perform public.post_prediction_reconciliation(debtor,-10,'prediction-history-reconcile:v1:'||fixture_market||':'||debtor,
  jsonb_build_object('auditVersion','prediction-accounting-v1','marketId',fixture_market,'expectedCash',0,'previousCash',10));
 perform public.post_prediction_reconciliation(debtor,-10,'prediction-history-reconcile:v1:'||fixture_market||':'||debtor,
  jsonb_build_object('auditVersion','prediction-accounting-v1','marketId',fixture_market,'expectedCash',0,'previousCash',10));
 if (select balance from public.coin_accounts where username=debtor)<>-5 then raise exception 'Correction was not idempotent'; end if;
 perform public.apply_coin_transaction(debtor,2,'daily_bonus',fixture_market||':debt-credit');
 if public.post_coin_transaction(debtor,-5,'puzzle_attempted',fixture_market||':capped','{}',now(),true)<>0
 or (select balance from public.coin_accounts where username=debtor)<>-3 then raise exception 'Debt repayment/capped debit failed'; end if;
 rejected:=false;
 begin perform public.apply_coin_transaction(debtor,-1,'prediction_trade_fee',fixture_market||':forbidden');exception when others then rejected:=true;end;
 if not rejected then raise exception 'Ordinary spending created debt'; end if;

 insert into public.prediction_markets(id,question,resolution_rules,resolution_source_url,closes_at,status)
 values(fixture_market,'Accounting regression','Fixture','https://atomicpuzzles.org/betting',now()+interval '1 day','open');
 perform public.apply_coin_transaction(trader,5000,'daily_bonus',fixture_market||':trader-seed');
 perform public.apply_coin_transaction(maker,10000,'daily_bonus',fixture_market||':maker-seed');
 perform public.place_prediction_order(maker,fixture_market,'no','buy',80,1000);
 perform public.place_prediction_order(trader,fixture_market,'yes','buy',20,1000);
 order_result:=public.place_prediction_order(trader,fixture_market,'yes','sell',90,1000);
 sell_id:=(order_result->>'orderId')::bigint;
 perform public.place_prediction_order(maker,fixture_market,'yes','buy',40,2000);
 perform public.place_prediction_order(trader,fixture_market,'no','buy',60,2000);
 if (select coalesce(sum(quantity),0) from public.prediction_positions where market_id=fixture_market and username=trader and outcome='yes')<>0
 then raise exception 'Old side remains after switching'; end if;
 if (select quantity from public.prediction_positions p where p.market_id=fixture_market and username=trader and outcome='no')<>1000
 then raise exception 'New side is not the net holding'; end if;
 if not exists(select 1 from public.prediction_orders where id=sell_id and status='cancelled' and remaining_quantity=0)
 or (select coalesce(sum(reserved_quantity),0) from public.prediction_positions p where p.market_id=fixture_market and username=trader)<>0 then raise exception 'Closed-side sell reservation survived'; end if;
 if (select sum(quantity) from public.prediction_position_nettings n where n.market_id=fixture_market and username=trader)<>1000 then raise exception 'Complete-set redemption missing'; end if;
 if (select sum(amount) from public.coin_transactions where username=trader and metadata->>'marketId'=fixture_market and source_key like 'prediction-position-net:%')<>1000 then raise exception 'Redemption cash missing'; end if;
 select balance into before_wallet from public.coin_accounts where username=trader;
 perform public.resolve_prediction_market(fixture_market,'no');
 perform public.resolve_prediction_market(fixture_market,'no');
 if (select balance from public.coin_accounts where username=trader)-before_wallet<>1000 then raise exception 'Switched position settlement incorrect'; end if;

 select * into strict template from public.tournament_betting_markets where market_kind='match' limit 1;
 foreach prepaid in array array[false,true] loop
  legacy_id:=fixture_market||case when prepaid then '-prepaid' else '-converted' end;
  insert into public.tournament_betting_markets(id,tournament_id,bracket_match_id,round_name,round_order,player_one,player_two,player_one_price,status,market_kind,category,category_order,label,closes_at)
  values(legacy_id,template.tournament_id,legacy_id,template.round_name,template.round_order,trader,maker,50,'open','match',template.category,template.category_order,'Accounting regression',now()+interval '1 day');
  insert into public.tournament_betting_outcomes(market_id,player,price_percent,display_order) values(legacy_id,trader,50,1),(legacy_id,maker,50,2) on conflict (market_id,player) do update set price_percent=excluded.price_percent;
  order_result:=public.place_tournament_bet(trader,legacy_id,trader,10);
  select * into strict bet_row from public.tournament_bets where market_id=legacy_id and username=trader;
  select balance into before_wallet from public.coin_accounts where username=trader;
  if prepaid then perform public.resolve_tournament_betting_market(legacy_id,trader,'played'); end if;
  insert into public.prediction_markets(id,question,resolution_rules,resolution_source_url,closes_at,status,outcome_yes_label,outcome_no_label)
   values(legacy_id,'Legacy accounting regression','Fixture','https://atomicpuzzles.org/betting',now()+interval '1 day','open',trader,maker);
  insert into public.prediction_legacy_position_credits(source_bet_id,market_id,username,outcome,quantity,price_cents)
   values(bet_row.id,legacy_id,trader,'yes',bet_row.potential_payout,50);
  insert into public.prediction_positions(market_id,username,outcome,quantity) values(legacy_id,trader,'yes',bet_row.potential_payout);
  perform public.resolve_tournament_betting_market(legacy_id,trader,'played');
  perform public.resolve_prediction_market(legacy_id,'yes');
  perform public.resolve_tournament_betting_market(legacy_id,trader,'played');
  perform public.resolve_prediction_market(legacy_id,'yes');
  if (select balance from public.coin_accounts where username=trader)-before_wallet<>bet_row.potential_payout then raise exception 'Legacy/exchange settlement paid twice (prepaid=%)',prepaid; end if;
 end loop;
end;
$$;
rollback;
select 'PASS: net exposure, sell reservations, conversion settlement order, idempotence, private corrections and debt handling' as result;
