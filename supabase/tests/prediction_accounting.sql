-- Current database, Firefox only. Every fixture, payment and correction rolls back.
begin;
do $$
declare
 suffix text:=substr(gen_random_uuid()::text,1,8);
 trader text:='acct-trader-'||suffix;
 maker text:='acct-maker-'||suffix;
 debtor text:='acct-debt-'||suffix;
 fixture_market text:='accounting-'||suffix;
 secondary_market text;
 order_result jsonb;
 sell_id bigint;
 before_wallet numeric;
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
 order_result:=public.place_prediction_order(trader,fixture_market,'no','buy',60,2000);
 if (order_result->>'balance')::numeric<>(select balance from public.coin_accounts where username=trader) then raise exception 'Order balance omitted returned collateral'; end if;
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

 -- Fees belong to the original buy/sell receipt, and closing a position uses net proceeds.
 secondary_market:=fixture_market||'-cash';
 insert into public.prediction_markets(id,question,resolution_rules,resolution_source_url,closes_at,status)
 values(secondary_market,'All-in cash regression','Fixture','https://atomicpuzzles.org/betting',now()+interval '1 day','open');
 select balance into before_wallet from public.coin_accounts where username=trader;
 perform public.place_prediction_order(maker,secondary_market,'no','buy',60,10);
 perform public.place_prediction_order(trader,secondary_market,'yes','buy',40,10);
 perform public.place_prediction_order(maker,secondary_market,'yes','buy',60,10);
 order_result:=public.place_prediction_order(trader,secondary_market,'yes','sell',60,10);
 if (select balance from public.coin_accounts where username=trader)-before_wallet<>1.8
 or (order_result->>'balance')::numeric<>before_wallet+1.8 then raise exception 'All-in buy/sell cash incorrect'; end if;
 if (select count(*) from public.coin_transactions where username=trader and metadata->>'marketId'=secondary_market)<>2
 or not exists(select 1 from public.coin_transactions where username=trader and metadata->>'marketId'=secondary_market and amount=-4.08 and (metadata->>'fee')::numeric=0.08)
 or not exists(select 1 from public.coin_transactions where username=trader and metadata->>'marketId'=secondary_market and amount=5.88 and (metadata->>'fee')::numeric=0.12)
 then raise exception 'Trade fees were not included exactly once in the original receipts'; end if;
 if exists(select 1 from public.prediction_positions where market_id=secondary_market and username=trader and quantity<>0)
 then raise exception 'A fully sold position remains'; end if;

 -- Holding contracts is sufficient to sell. Both maker and taker proceeds can
 -- repay a negative wallet in installments, with the taker fee deducted from proceeds.
 secondary_market:=fixture_market||'-debt-sale';
 insert into public.prediction_markets(id,question,resolution_rules,resolution_source_url,closes_at,status)
 values(secondary_market,'Sell with a negative wallet','Fixture','https://atomicpuzzles.org/betting',now()+interval '1 day','open');
 insert into public.prediction_positions(market_id,username,outcome,quantity)
 values(secondary_market,debtor,'yes',4);
 order_result:=public.place_prediction_order_once(debtor,gen_random_uuid(),secondary_market,'yes','sell',50,2);
 sell_id:=(order_result->>'orderId')::bigint;
 if (order_result->>'balance')::numeric<>-3
 or not exists(select 1 from public.prediction_orders where id=sell_id and status='open' and remaining_quantity=2)
 then raise exception 'Resting sell required a funded wallet'; end if;
 perform public.place_prediction_order(maker,secondary_market,'yes','buy',50,2);
 if (select balance from public.coin_accounts where username=debtor)<>-2
 or not exists(select 1 from public.prediction_orders where id=sell_id and status='filled')
 then raise exception 'Maker sale did not credit the negative wallet'; end if;
 perform public.place_prediction_order(maker,secondary_market,'yes','buy',50,2);
 order_result:=public.place_prediction_order_once(debtor,gen_random_uuid(),secondary_market,'yes','sell',50,2);
 if (order_result->>'balance')::numeric<>-1.02 or (order_result->>'cancelledForInsufficientBalance')::boolean
 or not exists(select 1 from public.prediction_orders where id=(order_result->>'orderId')::bigint and status='filled')
 or not exists(select 1 from public.prediction_positions where market_id=secondary_market and username=debtor and outcome='yes' and quantity=0 and reserved_quantity=0)
 or (select sum(amount) from public.coin_transactions where username=debtor and metadata->>'marketId'=secondary_market)<>1.98
 then raise exception 'Taker sale did not credit net proceeds and clear the sold shares'; end if;

 -- Imported positions settle through the same prediction resolver exactly once.
 secondary_market:=fixture_market||'-imported';
 insert into public.prediction_markets(id,question,resolution_rules,resolution_source_url,closes_at,status)
 values(secondary_market,'Imported position regression','Fixture','https://atomicpuzzles.org/betting',now()+interval '1 day','open');
 insert into public.prediction_position_credits(source_key,market_id,username,outcome,quantity,price_cents,cost_coins,fee_coins,credited_at)
 values(secondary_market,secondary_market,trader,'yes',20,50,10.2,0.2,now());
 insert into public.prediction_positions(market_id,username,outcome,quantity) values(secondary_market,trader,'yes',20);
 select balance into before_wallet from public.coin_accounts where username=trader;
 perform public.resolve_prediction_market(secondary_market,'yes');
 perform public.resolve_prediction_market(secondary_market,'yes');
 if (select balance from public.coin_accounts where username=trader)-before_wallet<>20 then raise exception 'Imported position paid incorrectly'; end if;
 if to_regprocedure('public.place_tournament_bet(text,text,text,numeric)') is not null then raise exception 'Retired sportsbook RPC still exposed'; end if;
end;
$$;
rollback;
select 'PASS: net exposure, trade receipts, sales with negative wallets, import settlement, idempotence and private debt handling' as result;
