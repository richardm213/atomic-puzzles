-- Terminal settlements and replay-safe order submission. Current database, Firefox only.
begin;
CREATE OR REPLACE FUNCTION public.resolve_prediction_market(p_market_id text, p_outcome text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  normalized_outcome text := lower(btrim(coalesce(p_outcome, '')));
  market_row public.prediction_markets%rowtype;
  position_row public.prediction_positions%rowtype;
begin
  if normalized_outcome not in ('yes', 'no') then raise exception 'Invalid market outcome'; end if;
  perform pg_advisory_xact_lock(hashtext('prediction-market:' || p_market_id));
  select * into market_row
  from public.prediction_markets
  where id = p_market_id
  for update;
  if market_row.id is null then raise exception 'Prediction market not found'; end if;
  if market_row.status = 'resolved' then
    if market_row.outcome is distinct from normalized_outcome then
      raise exception 'Prediction market already resolved differently';
    end if;
    return;
  end if;

  if market_row.status not in ('open', 'closed') then
    raise exception 'Prediction market cannot be settled from status %', market_row.status;
  end if;

  perform public.cancel_prediction_market_orders(p_market_id);

  for position_row in
    select *
    from public.prediction_positions
    where market_id = p_market_id and outcome = normalized_outcome and quantity > 0
    order by username
    for update
  loop
    perform public.credit_prediction_market_payout(
      p_market_id, position_row.username, normalized_outcome,
      position_row.quantity,
      'prediction-market-payout:' || p_market_id || ':' || position_row.username,
      jsonb_build_object(
        'marketId', p_market_id, 'outcome', normalized_outcome,
        'contracts', position_row.quantity
      )
    );
  end loop;

  update public.prediction_markets
  set status = 'resolved', outcome = normalized_outcome, settlement_price_cents = null,
      settlement_reference_fill_id = null, resolved_at = now(), updated_at = now()
  where id = p_market_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.resolve_prediction_market_at_price(p_market_id text, p_reference_fill_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  market_row public.prediction_markets%rowtype;
  position_row public.prediction_positions%rowtype;
  reference_fill public.prediction_fills%rowtype;
  settlement_price integer;
  payout_amount numeric(18, 6);
begin
  perform pg_advisory_xact_lock(hashtext('prediction-market:' || p_market_id));
  select * into market_row
  from public.prediction_markets
  where id = p_market_id
  for update;
  if market_row.id is null then raise exception 'Prediction market not found'; end if;

  select * into reference_fill
  from public.prediction_fills
  where id = p_reference_fill_id and market_id = p_market_id;
  if reference_fill.id is null then raise exception 'Settlement reference trade not found'; end if;

  settlement_price := case reference_fill.outcome
    when 'yes' then reference_fill.price_cents
    else 100 - reference_fill.price_cents
  end;

  if market_row.status = 'resolved' then
    if market_row.outcome is null
      and market_row.settlement_reference_fill_id = p_reference_fill_id then
      return;
    end if;
    raise exception 'Prediction market already resolved differently';
  end if;

  if market_row.status not in ('open', 'closed') then
    raise exception 'Prediction market cannot be settled from status %', market_row.status;
  end if;

  perform public.cancel_prediction_market_orders(p_market_id);

  for position_row in
    select *
    from public.prediction_positions
    where market_id = p_market_id and quantity > 0
    order by username, outcome
    for update
  loop
    payout_amount := round(
      position_row.quantity::numeric
      * case position_row.outcome
          when 'yes' then settlement_price
          else 100 - settlement_price
        end
      / 100,
      6
    );

    if payout_amount > 0 then
      perform public.credit_prediction_market_payout(
        p_market_id, position_row.username, position_row.outcome,
        payout_amount,
        'prediction-market-price-payout:' || p_market_id || ':'
          || position_row.username || ':' || position_row.outcome,
        jsonb_build_object(
          'marketId', p_market_id,
          'outcome', position_row.outcome,
          'contracts', position_row.quantity,
          'settlementPriceCents', settlement_price,
          'settlementReferenceFillId', p_reference_fill_id
        )
      );
    end if;
  end loop;

  update public.prediction_markets
  set status = 'resolved',
      outcome = null,
      settlement_price_cents = settlement_price,
      settlement_reference_fill_id = p_reference_fill_id,
      resolved_at = now(),
      updated_at = now()
  where id = p_market_id;
end;
$function$
;
-- Only the server can claim a request. The receipt and all order/fill/coin changes
-- commit together; concurrent retries serialize on the authenticated user and ID.
create table if not exists public.prediction_order_requests (
 username text not null,
 request_id uuid not null,
 payload jsonb not null,
 result jsonb not null,
 created_at timestamptz not null default now(),
 primary key(username,request_id)
);
alter table public.prediction_order_requests enable row level security;
revoke all on public.prediction_order_requests from public,anon,authenticated,service_role;
grant select on public.prediction_order_requests to service_role;

create or replace function public.place_prediction_order_once(
 p_username text,p_request_id uuid,p_market_id text,p_outcome text,p_side text,p_price_cents integer,p_quantity integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 owner text:=lower(btrim(coalesce(p_username,'')));
 request_payload jsonb:=jsonb_build_object('marketId',p_market_id,'outcome',p_outcome,'side',p_side,'priceCents',p_price_cents,'quantity',p_quantity);
 receipt public.prediction_order_requests%rowtype;
 response jsonb;
begin
 if owner !~ '^[a-z0-9_-]{1,100}$' or p_request_id is null then raise exception 'Invalid order request ID'; end if;
 perform pg_advisory_xact_lock(hashtext('prediction-order-request:'||owner||':'||p_request_id));
 select * into receipt from public.prediction_order_requests where username=owner and request_id=p_request_id;
 if found then
  if receipt.payload is distinct from request_payload then raise exception 'Order request ID was already used for different parameters'; end if;
  return receipt.result||jsonb_build_object('balance',(select balance from public.coin_accounts where username=owner));
 end if;
 response:=public.place_prediction_order(owner,p_market_id,p_outcome,p_side,p_price_cents,p_quantity);
 insert into public.prediction_order_requests(username,request_id,payload,result) values(owner,p_request_id,request_payload,response);
 return response;
end;
$$;
revoke all on function public.place_prediction_order_once(text,uuid,text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.place_prediction_order_once(text,uuid,text,text,text,integer,integer) to service_role;

notify pgrst,'reload schema';
commit;
