-- Binary order-book strikes for the 2026 Atomic World Championship winner.
begin;

insert into public.prediction_markets (
  id,
  question,
  resolution_rules,
  resolution_source_url,
  closes_at
) values
  ('awc-2026-champion-natso', 'Will natso be the 2026 Atomic World Champion?', 'Resolves Yes if natso wins the 2026 Atomic World Championship. Otherwise resolves No. The official AWC 2026 bracket is the sole resolution source.', 'https://atomicpuzzles.org/tournaments/awc2026', '2026-10-31T23:59:59Z'),
  ('awc-2026-champion-maxwellssilvrhammer', 'Will maxwellssilvrhammer be the 2026 Atomic World Champion?', 'Resolves Yes if maxwellssilvrhammer wins the 2026 Atomic World Championship. Otherwise resolves No. The official AWC 2026 bracket is the sole resolution source.', 'https://atomicpuzzles.org/tournaments/awc2026', '2026-10-31T23:59:59Z'),
  ('awc-2026-champion-sutcunuri', 'Will sutcunuri be the 2026 Atomic World Champion?', 'Resolves Yes if sutcunuri wins the 2026 Atomic World Championship. Otherwise resolves No. The official AWC 2026 bracket is the sole resolution source.', 'https://atomicpuzzles.org/tournaments/awc2026', '2026-10-31T23:59:59Z'),
  ('awc-2026-champion-rechesster', 'Will rechesster be the 2026 Atomic World Champion?', 'Resolves Yes if rechesster wins the 2026 Atomic World Championship. Otherwise resolves No. The official AWC 2026 bracket is the sole resolution source.', 'https://atomicpuzzles.org/tournaments/awc2026', '2026-10-31T23:59:59Z'),
  ('awc-2026-champion-jakestatefarm', 'Will jakestatefarm be the 2026 Atomic World Champion?', 'Resolves Yes if jakestatefarm wins the 2026 Atomic World Championship. Otherwise resolves No. The official AWC 2026 bracket is the sole resolution source.', 'https://atomicpuzzles.org/tournaments/awc2026', '2026-10-31T23:59:59Z'),
  ('awc-2026-champion-quasabianth', 'Will quasabianth be the 2026 Atomic World Champion?', 'Resolves Yes if quasabianth wins the 2026 Atomic World Championship. Otherwise resolves No. The official AWC 2026 bracket is the sole resolution source.', 'https://atomicpuzzles.org/tournaments/awc2026', '2026-10-31T23:59:59Z'),
  ('awc-2026-champion-maracker', 'Will maracker be the 2026 Atomic World Champion?', 'Resolves Yes if maracker wins the 2026 Atomic World Championship. Otherwise resolves No. The official AWC 2026 bracket is the sole resolution source.', 'https://atomicpuzzles.org/tournaments/awc2026', '2026-10-31T23:59:59Z'),
  ('awc-2026-champion-judebaetorrens', 'Will judebaetorrens be the 2026 Atomic World Champion?', 'Resolves Yes if judebaetorrens wins the 2026 Atomic World Championship. Otherwise resolves No. The official AWC 2026 bracket is the sole resolution source.', 'https://atomicpuzzles.org/tournaments/awc2026', '2026-10-31T23:59:59Z'),
  ('awc-2026-champion-howlind', 'Will howlind be the 2026 Atomic World Champion?', 'Resolves Yes if howlind wins the 2026 Atomic World Championship. Otherwise resolves No. The official AWC 2026 bracket is the sole resolution source.', 'https://atomicpuzzles.org/tournaments/awc2026', '2026-10-31T23:59:59Z'),
  ('awc-2026-champion-renaudmerle', 'Will renaudmerle be the 2026 Atomic World Champion?', 'Resolves Yes if renaudmerle wins the 2026 Atomic World Championship. Otherwise resolves No. The official AWC 2026 bracket is the sole resolution source.', 'https://atomicpuzzles.org/tournaments/awc2026', '2026-10-31T23:59:59Z'),
  ('awc-2026-champion-rabbier', 'Will rabbier be the 2026 Atomic World Champion?', 'Resolves Yes if rabbier wins the 2026 Atomic World Championship. Otherwise resolves No. The official AWC 2026 bracket is the sole resolution source.', 'https://atomicpuzzles.org/tournaments/awc2026', '2026-10-31T23:59:59Z'),
  ('awc-2026-champion-theatomicstorm', 'Will theatomicstorm be the 2026 Atomic World Champion?', 'Resolves Yes if theatomicstorm wins the 2026 Atomic World Championship. Otherwise resolves No. The official AWC 2026 bracket is the sole resolution source.', 'https://atomicpuzzles.org/tournaments/awc2026', '2026-10-31T23:59:59Z'),
  ('awc-2026-champion-dandan2016', 'Will dandan2016 be the 2026 Atomic World Champion?', 'Resolves Yes if dandan2016 wins the 2026 Atomic World Championship. Otherwise resolves No. The official AWC 2026 bracket is the sole resolution source.', 'https://atomicpuzzles.org/tournaments/awc2026', '2026-10-31T23:59:59Z'),
  ('awc-2026-champion-tolya-starina0995', 'Will tolya_starina0995 be the 2026 Atomic World Champion?', 'Resolves Yes if tolya_starina0995 wins the 2026 Atomic World Championship. Otherwise resolves No. The official AWC 2026 bracket is the sole resolution source.', 'https://atomicpuzzles.org/tournaments/awc2026', '2026-10-31T23:59:59Z')
on conflict (id) do update set
  question = excluded.question,
  resolution_rules = excluded.resolution_rules,
  resolution_source_url = excluded.resolution_source_url,
  closes_at = excluded.closes_at,
  updated_at = now();

insert into public.prediction_markets (
  id,
  question,
  resolution_rules,
  resolution_source_url,
  closes_at,
  status,
  outcome,
  resolved_at
) values
  ('awc-2026-champion-stinkypotato', 'Will stinkypotato be the 2026 Atomic World Champion?', 'Resolves Yes if stinkypotato wins the 2026 Atomic World Championship. Otherwise resolves No. The official AWC 2026 bracket is the sole resolution source.', 'https://atomicpuzzles.org/tournaments/awc2026', '2026-10-31T23:59:59Z', 'resolved', 'no', now()),
  ('awc-2026-champion-goroarmet', 'Will goroarmet be the 2026 Atomic World Champion?', 'Resolves Yes if goroarmet wins the 2026 Atomic World Championship. Otherwise resolves No. The official AWC 2026 bracket is the sole resolution source.', 'https://atomicpuzzles.org/tournaments/awc2026', '2026-10-31T23:59:59Z', 'resolved', 'no', now()),
  ('awc-2026-champion-arinor0109', 'Will arinor0109 be the 2026 Atomic World Champion?', 'Resolves Yes if arinor0109 wins the 2026 Atomic World Championship. Otherwise resolves No. The official AWC 2026 bracket is the sole resolution source.', 'https://atomicpuzzles.org/tournaments/awc2026', '2026-10-31T23:59:59Z', 'resolved', 'no', now()),
  ('awc-2026-champion-matvei-e2e4', 'Will matvei-e2e4 be the 2026 Atomic World Champion?', 'Resolves Yes if matvei-e2e4 wins the 2026 Atomic World Championship. Otherwise resolves No. The official AWC 2026 bracket is the sole resolution source.', 'https://atomicpuzzles.org/tournaments/awc2026', '2026-10-31T23:59:59Z', 'resolved', 'no', now())
on conflict (id) do update set
  question = excluded.question,
  resolution_rules = excluded.resolution_rules,
  resolution_source_url = excluded.resolution_source_url,
  closes_at = excluded.closes_at,
  status = 'resolved',
  outcome = 'no',
  resolved_at = coalesce(public.prediction_markets.resolved_at, now()),
  updated_at = now();

-- Seed each open contender with 1,000 contracts on both binary outcomes.
-- At 1 cent per contract, each side reserves exactly 10 coins.
do $$
declare
  seed_market_id text;
  seed_outcome text;
begin
  if exists (select 1 from public.coin_accounts where username = 'prediction_admin') then
    foreach seed_market_id in array array[
      'awc-2026-champion-natso',
      'awc-2026-champion-maxwellssilvrhammer',
      'awc-2026-champion-sutcunuri',
      'awc-2026-champion-rechesster',
      'awc-2026-champion-jakestatefarm',
      'awc-2026-champion-quasabianth',
      'awc-2026-champion-maracker',
      'awc-2026-champion-judebaetorrens',
      'awc-2026-champion-howlind',
      'awc-2026-champion-renaudmerle',
      'awc-2026-champion-rabbier',
      'awc-2026-champion-theatomicstorm',
      'awc-2026-champion-dandan2016',
      'awc-2026-champion-tolya-starina0995'
    ] loop
      foreach seed_outcome in array array['yes', 'no'] loop
        if not exists (
          select 1
          from public.prediction_orders
          where prediction_orders.market_id = seed_market_id
            and username = 'prediction_admin'
            and outcome = seed_outcome
            and side = 'buy'
            and price_cents = 1
            and quantity = 1000
            and status in ('open', 'partial')
        ) then
          perform public.place_prediction_order(
            'prediction_admin',
            seed_market_id,
            seed_outcome,
            'buy',
            1,
            1000
          );
        end if;
      end loop;
    end loop;
  end if;
end;
$$;

commit;
