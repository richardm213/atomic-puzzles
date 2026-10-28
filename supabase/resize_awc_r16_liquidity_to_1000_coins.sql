begin;

select public.apply_coin_transaction(
  'prediction_admin',
  40000,
  'prediction_liquidity_funding',
  'prediction-liquidity-funding:awc-2026-round-of-16:1000-coins-per-side',
  jsonb_build_object(
    'groupId', 'awc-2026-round-of-16',
    'purpose', 'resize initial liquidity to 1000 coins per outcome'
  )
);

do $$
declare
  existing_order record;
  open_order_count integer;
  seed record;
  remaining_quantity integer;
  order_quantity integer;
begin
  select count(*) into open_order_count
  from public.prediction_orders
  where username = 'prediction_admin'
    and market_id like 'awc2026-wb-r1-m%'
    and status in ('open', 'partial')
    and filled_quantity = 0;

  if open_order_count <> 14 then
    raise exception 'Expected 14 untouched R16 liquidity orders, found %', open_order_count;
  end if;

  for existing_order in
    select id
    from public.prediction_orders
    where username = 'prediction_admin'
      and market_id like 'awc2026-wb-r1-m%'
      and status in ('open', 'partial')
      and filled_quantity = 0
  loop
    perform public.cancel_prediction_order('prediction_admin', existing_order.id);
  end loop;

  for seed in
    select * from (values
      ('awc2026-wb-r1-m1', 85, 17),
      ('awc2026-wb-r1-m2', 70, 31),
      ('awc2026-wb-r1-m3', 90, 14),
      ('awc2026-wb-r1-m4', 96, 7),
      ('awc2026-wb-r1-m5', 12, 93),
      ('awc2026-wb-r1-m6', 15, 88),
      ('awc2026-wb-r1-m7', 27, 74)
    ) as rows(market_id, yes_ask, no_ask)
  loop
    -- A bid on No supplies the displayed Yes ask. Size contracts so buying
    -- the full displayed Yes side costs approximately 1,000 coins.
    remaining_quantity := round(100000.0 / seed.yes_ask)::integer;
    while remaining_quantity > 0 loop
      order_quantity := least(remaining_quantity, 10000);
      perform public.place_prediction_order(
        'prediction_admin', seed.market_id, 'no', 'buy',
        100 - seed.yes_ask, order_quantity
      );
      remaining_quantity := remaining_quantity - order_quantity;
    end loop;

    -- A bid on Yes supplies the displayed No ask. Split quantities above the
    -- per-order contract cap while preserving one 1,000-coin depth target.
    remaining_quantity := round(100000.0 / seed.no_ask)::integer;
    while remaining_quantity > 0 loop
      order_quantity := least(remaining_quantity, 10000);
      perform public.place_prediction_order(
        'prediction_admin', seed.market_id, 'yes', 'buy',
        100 - seed.no_ask, order_quantity
      );
      remaining_quantity := remaining_quantity - order_quantity;
    end loop;
  end loop;
end;
$$;

commit;

select
  market_id,
  outcome,
  100 - price_cents as displayed_ask_cents,
  sum(remaining_quantity) as contracts,
  round(sum(remaining_quantity) * (100 - price_cents)::numeric / 100, 2) as displayed_coin_volume
from public.prediction_orders
where username = 'prediction_admin'
  and market_id like 'awc2026-wb-r1-m%'
  and status in ('open', 'partial')
group by market_id, outcome, price_cents
order by market_id, outcome;
