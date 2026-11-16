-- Firefox, current database only. All wallets, orders, fills and receipts roll back.
begin;
do $$
<<safety_test>>
declare
 suffix text:=substr(gen_random_uuid()::text,1,8);
 trader text:='request-trader-'||suffix;
 maker text:='request-maker-'||suffix;
 other_trader text:='request-other-'||suffix;
 market_id text:='request-market-'||suffix;
 price_market text:='request-price-'||suffix;
 refunded_market text:='request-refund-'||suffix;
 request_id uuid:=gen_random_uuid();
 failed_id uuid:=gen_random_uuid();
 first_result jsonb;
 retry_result jsonb;
 other_result jsonb;
 before_wallet numeric;
 saved_orders integer;
 saved_fills integer;
 reference_id bigint;
 rejected boolean;
begin
 if has_function_privilege('anon','public.place_prediction_order_once(text,uuid,text,text,text,integer,integer)','execute')
 or has_table_privilege('authenticated','public.prediction_order_requests','select') then raise exception 'Order request capability exposed'; end if;
 insert into public.users(id,username) overriding system value values
 (-floor(random()*9000000000000000)::bigint,trader),(-floor(random()*9000000000000000)::bigint,maker),(-floor(random()*9000000000000000)::bigint,other_trader);
 perform public.apply_coin_transaction(trader,500,'daily_bonus',market_id||':trader');
 perform public.apply_coin_transaction(maker,500,'daily_bonus',market_id||':maker');
 perform public.apply_coin_transaction(other_trader,500,'daily_bonus',market_id||':other');
 insert into public.prediction_markets(id,question,resolution_rules,resolution_source_url,closes_at,status) values
 (market_id,'Request regression','Fixture','https://atomicpuzzles.org/betting',now()+interval '1 day','open'),
 (price_market,'Price regression','Fixture','https://atomicpuzzles.org/betting',now()+interval '1 day','open'),
 (refunded_market,'Refund regression','Fixture','https://atomicpuzzles.org/betting',now()+interval '1 day','open');
 rejected:=false;
 begin perform public.place_prediction_order_once(trader,failed_id,market_id,'yes','invalid',30,10);
 exception when others then rejected:=true; end;
 if not rejected or exists(select 1 from public.prediction_order_requests where username=trader and prediction_order_requests.request_id=failed_id)
 then raise exception 'Failed order left a request receipt'; end if;
 perform public.place_prediction_order(maker,market_id,'no','buy',70,10);
 first_result:=public.place_prediction_order_once(trader,request_id,market_id,'yes','buy',30,10);
 select count(*) into saved_orders from public.prediction_orders where prediction_orders.market_id=safety_test.market_id;
 select count(*) into saved_fills from public.prediction_fills where prediction_fills.market_id=safety_test.market_id;
 -- Another wallet event must not make a retried response restore an old balance.
 perform public.apply_coin_transaction(trader,5,'daily_bonus',market_id||':later-credit');
 select balance into before_wallet from public.coin_accounts where username=trader;
 retry_result:=public.place_prediction_order_once(trader,request_id,market_id,'yes','buy',30,10);
 if first_result->>'orderId'<>retry_result->>'orderId' or (retry_result->>'balance')::numeric<>before_wallet
 or (select balance from public.coin_accounts where username=trader)<>before_wallet
 or (select count(*) from public.prediction_orders where prediction_orders.market_id=safety_test.market_id)<>saved_orders
 or (select count(*) from public.prediction_fills where prediction_fills.market_id=safety_test.market_id)<>saved_fills
 then raise exception 'Retry created another order, fill, fee, debit or stale wallet response'; end if;
 rejected:=false;
 begin perform public.place_prediction_order_once(trader,request_id,market_id,'yes','buy',31,10);
 exception when others then rejected:=sqlerrm like '%different parameters%'; end;
 if not rejected then raise exception 'Request ID accepted a different order'; end if;
 other_result:=public.place_prediction_order_once(other_trader,request_id,market_id,'yes','buy',30,10);
 if other_result->>'orderId'=first_result->>'orderId' then raise exception 'Request receipt crossed user accounts'; end if;
 perform public.resolve_prediction_market(market_id,'yes');
 select balance into before_wallet from public.coin_accounts where username=trader;
 retry_result:=public.place_prediction_order_once(trader,request_id,market_id,'yes','buy',30,10);
 perform public.resolve_prediction_market(market_id,'yes');
 if retry_result->>'orderId'<>first_result->>'orderId' or (select balance from public.coin_accounts where username=trader)<>before_wallet
 then raise exception 'Closed-market retry or repeated settlement paid again'; end if;

 -- Fair-price repeats are idempotent, and an incompatible binary result is rejected.
 perform public.place_prediction_order(maker,price_market,'no','buy',60,4);
 perform public.place_prediction_order(trader,price_market,'yes','buy',40,4);
 select max(id) into reference_id from public.prediction_fills where prediction_fills.market_id=price_market;
 perform public.resolve_prediction_market_at_price(price_market,reference_id);
 select balance into before_wallet from public.coin_accounts where username=trader;
 perform public.resolve_prediction_market_at_price(price_market,reference_id);
 rejected:=false;
 begin perform public.resolve_prediction_market(price_market,'yes'); exception when others then rejected:=sqlerrm like '%already resolved differently%'; end;
 if not rejected or (select balance from public.coin_accounts where username=trader)<>before_wallet then raise exception 'Fair-price result changed to binary or paid twice'; end if;

 -- Both low-level resolvers must respect a refunded terminal state, even when a
 -- historical/manual record still has fills and positions.
 perform public.place_prediction_order(maker,refunded_market,'no','buy',60,10);
 perform public.place_prediction_order(trader,refunded_market,'yes','buy',40,10);
 select max(id) into reference_id from public.prediction_fills where prediction_fills.market_id=refunded_market;
 perform public.cancel_prediction_market_orders(refunded_market);
 update public.prediction_markets set status='refunded' where id=refunded_market;
 perform public.apply_coin_transaction(trader,4.08,'prediction_order_refund','prediction-market-refund:'||refunded_market||':'||trader,
  jsonb_build_object('marketId',refunded_market,'kind','market-refund'));
 select balance into before_wallet from public.coin_accounts where username=trader;
 rejected:=false;
 begin perform public.resolve_prediction_market(refunded_market,'yes'); exception when others then rejected:=sqlerrm like '%status refunded%'; end;
 if not rejected then raise exception 'Refunded market accepted a binary payout'; end if;
 rejected:=false;
 begin perform public.resolve_prediction_market_at_price(refunded_market,reference_id); exception when others then rejected:=sqlerrm like '%status refunded%'; end;
 if not rejected or (select status from public.prediction_markets where id=refunded_market)<>'refunded'
 or (select balance from public.coin_accounts where username=trader)<>before_wallet then raise exception 'Refunded market accepted a price payout'; end if;
end;
$$;
rollback;
select 'PASS: request replay, account isolation, payload binding, fresh wallet responses and terminal settlement guards' as result;
