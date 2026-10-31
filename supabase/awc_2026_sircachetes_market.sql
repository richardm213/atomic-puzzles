-- Restore sircachetes to the 2026 AWC champion market with a 1-cent Yes ask
-- and 1,000 coins of visible order-book depth (100,000 contracts).
begin;

insert into public.prediction_markets (
  id,
  question,
  resolution_rules,
  resolution_source_url,
  closes_at,
  group_id,
  group_path,
  group_title,
  group_description,
  group_order,
  display_name,
  country_code,
  starting_chance,
  display_order
)
select
  'awc-2026-champion-sircachetes',
  'Will sircachetes win the 2026 Atomic World Championship?',
  'Resolves Yes if sircachetes is declared the 2026 Atomic World Champion. Otherwise resolves No. Official Atomic World Championship results are the resolution source.',
  'https://lichess.org/team/atomic-wc',
  template.closes_at,
  template.group_id,
  template.group_path,
  template.group_title,
  template.group_description,
  template.group_order,
  'sircachetes',
  coalesce(
    (
      select country.country_code
      from public.player_countries as country
      where lower(country.player_name) = 'sircachetes'
      limit 1
    ),
    'US'
  ),
  1,
  20
from public.prediction_markets as template
where template.group_id = 'awc-2026-champion'
order by template.display_order
limit 1
on conflict (id) do update set
  question = excluded.question,
  resolution_rules = excluded.resolution_rules,
  resolution_source_url = excluded.resolution_source_url,
  closes_at = excluded.closes_at,
  group_id = excluded.group_id,
  group_path = excluded.group_path,
  group_title = excluded.group_title,
  group_description = excluded.group_description,
  group_order = excluded.group_order,
  display_name = excluded.display_name,
  country_code = excluded.country_code,
  starting_chance = excluded.starting_chance,
  display_order = excluded.display_order,
  updated_at = now();

select public.apply_coin_transaction(
  'prediction_admin',
  1000,
  'prediction_liquidity_funding',
  'prediction-liquidity-funding:awc-2026-champion-sircachetes:1000',
  jsonb_build_object(
    'marketId', 'awc-2026-champion-sircachetes',
    'purpose', 'initial liquidity',
    'liquidityCoins', 1000,
    'yesAskPriceCents', 1
  )
);

select public.apply_coin_transaction(
  'prediction_admin',
  98000,
  'prediction_liquidity_funding',
  'prediction-liquidity-funding:awc-2026-champion-sircachetes:depth-top-up',
  jsonb_build_object(
    'marketId', 'awc-2026-champion-sircachetes',
    'purpose', 'order-book depth top-up',
    'liquidityCoins', 98000,
    'bookDepthCoins', 1000,
    'yesAskPriceCents', 1
  )
);

do $$
declare
  ordered_quantity integer;
  quantity_to_place integer;
begin
  select coalesce(sum(quantity), 0)::integer
  into ordered_quantity
  from public.prediction_orders
  where market_id = 'awc-2026-champion-sircachetes'
    and username = 'prediction_admin'
    and outcome = 'no'
    and side = 'buy'
    and price_cents = 99;

  while ordered_quantity < 100000 loop
    quantity_to_place := least(10000, 100000 - ordered_quantity);
    perform public.place_prediction_order(
      'prediction_admin',
      'awc-2026-champion-sircachetes',
      'no',
      'buy',
      99,
      quantity_to_place
    );
    ordered_quantity := ordered_quantity + quantity_to_place;
  end loop;
end;
$$;

commit;
