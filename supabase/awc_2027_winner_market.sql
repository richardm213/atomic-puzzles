-- Add the 2027 AWC winner prediction group and seed each strike with
-- approximately 500 Atomic Coins of Yes-side liquidity.
begin;

create temp table awc_2027_winner_seed (
  market_id text primary key,
  display_name text not null,
  starting_chance integer not null check (starting_chance between 1 and 99),
  display_order integer not null
) on commit drop;

insert into awc_2027_winner_seed (market_id, display_name, starting_chance, display_order)
values
  ('awc-2027-champion-opabinia', 'opabinia', 10, 1),
  ('awc-2027-champion-wolfram-ep', 'wolfram_ep', 10, 2),
  ('awc-2027-champion-rechesster', 'rechesster', 20, 3),
  ('awc-2027-champion-natso', 'natso', 20, 4),
  ('awc-2027-champion-maxwellssilvrhammer', 'maxwellssilvrhammer', 20, 5),
  ('awc-2027-champion-quasabianth', 'quasabianth', 5, 6),
  ('awc-2027-champion-maracker', 'maracker', 4, 7),
  ('awc-2027-champion-tipau', 'tipau', 3, 8),
  ('awc-2027-champion-jakestatefarm', 'jakestatefarm', 15, 9),
  ('awc-2027-champion-rabbier', 'rabbier', 1, 10),
  ('awc-2027-champion-howlind', 'howlind', 1, 11),
  ('awc-2027-champion-grandlapin', 'grandlapin', 1, 12),
  ('awc-2027-champion-arka50', 'arka50', 3, 13),
  ('awc-2027-champion-vlad-00', 'vlad_00', 8, 14),
  ('awc-2027-champion-fast-tsunami', 'fast-tsunami', 3, 15),
  ('awc-2027-champion-atomicblunder', 'atomicblunder', 1, 16),
  ('awc-2027-champion-venusaurbeedrill', 'venusaurbeedrill', 1, 17),
  ('awc-2027-champion-rkrounit', 'rkrounit', 2, 18),
  ('awc-2027-champion-randoomplayer', 'randoomplayer', 5, 19),
  ('awc-2027-champion-thuban', 'thuban', 1, 20),
  ('awc-2027-champion-renaudmerle', 'renaudmerle', 1, 21),
  ('awc-2027-champion-ihatespammers', 'ihatespammers', 10, 22);

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
  seed.market_id,
  format('Will %s win the 2027 Atomic World Championship?', seed.display_name),
  format(
    'Resolves Yes if %s is declared the 2027 Atomic World Champion. Otherwise resolves No. Official Atomic World Championship results are the resolution source.',
    seed.display_name
  ),
  'https://lichess.org/team/atomic-wc',
  timestamptz '2028-01-01T00:00:00Z',
  'awc-2027-champion',
  '/betting/awc-2027-champion',
  'Who will win 2027 AWC',
  'Trade 2027 Atomic World Championship winner predictions with Atomic Coins.',
  99,
  seed.display_name,
  coalesce(
    (
      select existing.country_code
      from public.prediction_markets as existing
      where lower(existing.display_name) = lower(seed.display_name)
        and nullif(existing.country_code, '') is not null
      order by existing.updated_at desc
      limit 1
    ),
    (
      select country.country_code
      from public.player_countries as country
      where lower(country.player_name) = lower(seed.display_name)
      limit 1
    ),
    ''
  ),
  seed.starting_chance,
  seed.display_order
from awc_2027_winner_seed as seed
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

-- A complementary No bid at (100 - chance) makes Yes contracts available at
-- the requested chance. Quantity is the largest whole-contract amount whose
-- eventual reserve is no more than 500 coins.
do $$
declare
  seed awc_2027_winner_seed%rowtype;
  no_bid_price integer;
  contract_quantity integer;
begin
  for seed in select * from awc_2027_winner_seed order by display_order loop
    no_bid_price := 100 - seed.starting_chance;
    contract_quantity := floor(50000::numeric / no_bid_price)::integer;

    perform public.apply_coin_transaction(
      'prediction_admin',
      500,
      'prediction_liquidity_funding',
      'prediction-liquidity-funding:' || seed.market_id || ':500',
      jsonb_build_object(
        'marketId', seed.market_id,
        'purpose', 'initial liquidity',
        'liquidityCoins', 500,
        'yesAskPriceCents', seed.starting_chance
      )
    );

    if not exists (
      select 1
      from public.prediction_orders
      where market_id = seed.market_id
        and username = 'prediction_admin'
        and outcome = 'no'
        and side = 'buy'
        and price_cents = no_bid_price
    ) then
      perform public.place_prediction_order(
        'prediction_admin',
        seed.market_id,
        'no',
        'buy',
        no_bid_price,
        contract_quantity
      );
    end if;
  end loop;
end;
$$;

commit;
