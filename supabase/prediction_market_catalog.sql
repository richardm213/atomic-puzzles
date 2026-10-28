-- Store prediction-market catalog metadata in Supabase so the UI has no hardcoded strikes.
begin;

alter table public.prediction_markets
  add column if not exists group_id text,
  add column if not exists group_path text,
  add column if not exists group_title text,
  add column if not exists group_description text,
  add column if not exists group_order integer,
  add column if not exists display_name text,
  add column if not exists country_code text,
  add column if not exists starting_chance integer check (starting_chance between 0 and 100),
  add column if not exists display_order integer,
  add column if not exists sportsbook_volume_coins numeric(18, 6) not null default 0
    check (sportsbook_volume_coins >= 0),
  add column if not exists exchange_volume_coins numeric(18, 6) not null default 0
    check (exchange_volume_coins >= 0);

update public.prediction_markets set
  group_id = 'ban-2026', group_path = '/betting/ban-2026',
  group_title = 'Who will get banned on Lichess by Dec 31',
  group_description = 'Trade Lichess ban prediction markets with Atomic Coins.',
  group_order = 1
where id in ('natso-ban-2026','new-life14-ban-2026','goroarmet-ban-2026');

update public.prediction_markets set
  group_id = 'november-atomic-shield-2026', group_path = '/betting/november-atomic-shield-2026',
  group_title = 'Who will win the November Atomic Shield?',
  group_description = 'Trade November Atomic Shield winner predictions with Atomic Coins.',
  group_order = 2
where id like 'november-atomic-shield-2026-%';

update public.prediction_markets set
  group_id = 'awc-2026-champion', group_path = '/betting/awc-2026-champion',
  group_title = 'Who will win 2026 AWC',
  group_description = 'Trade 2026 Atomic World Championship winner predictions with Atomic Coins.',
  group_order = 3
where id like 'awc-2026-champion-%'
  and id not in ('awc-2026-champion-wolfram-ep', 'awc-2026-champion-opabinia');

update public.prediction_markets as market set
  display_name = metadata.display_name, country_code = metadata.country_code,
  starting_chance = metadata.starting_chance, display_order = metadata.display_order
from (values
  ('natso-ban-2026', 'natso', 'NL', null, 1),
  ('new-life14-ban-2026', 'new_life14', 'KZ', 50, 2),
  ('goroarmet-ban-2026', 'goroarmet', 'ES', null, 3),
  ('november-atomic-shield-2026-rechesster', 'rechesster', 'AT', 50, 1),
  ('november-atomic-shield-2026-vannto', 'vannto', 'VE', 50, 2),
  ('november-atomic-shield-2026-wolfram-ep', 'wolfram_ep', 'RU', null, 3),
  ('november-atomic-shield-2026-opabinia', 'opabinia', 'US', null, 4),
  ('november-atomic-shield-2026-maxwellssilvrhammer', 'maxwellssilvrhammer', 'US', null, 5),
  ('november-atomic-shield-2026-new-life14', 'new_life14', 'KZ', null, 6),
  ('november-atomic-shield-2026-chrisrapid', 'chrisrapid', 'BR', null, 7),
  ('november-atomic-shield-2026-randoomplayer', 'randoomplayer', 'SG', null, 8),
  ('november-atomic-shield-2026-natso', 'natso', 'NL', null, 9),
  ('november-atomic-shield-2026-ihatespammers', 'ihatespammers', 'US', null, 10),
  ('november-atomic-shield-2026-quasabianth', 'quasabianth', 'RU', null, 11),
  ('november-atomic-shield-2026-maracker', 'maracker', 'RU', null, 12),
  ('november-atomic-shield-2026-rabbier', 'rabbier', 'NZ', null, 13),
  ('awc-2026-champion-natso', 'natso', 'NL', 30, 1),
  ('awc-2026-champion-maxwellssilvrhammer', 'maxwellssilvrhammer', 'US', 23, 2),
  ('awc-2026-champion-sutcunuri', 'sutcunuri', 'TR', 20, 3),
  ('awc-2026-champion-rechesster', 'rechesster', 'AT', 20, 4),
  ('awc-2026-champion-jakestatefarm', 'jakestatefarm', 'US', 15, 5),
  ('awc-2026-champion-quasabianth', 'quasabianth', 'RU', 5, 6),
  ('awc-2026-champion-maracker', 'maracker', 'RU', 4, 7),
  ('awc-2026-champion-judebaetorrens', 'judebaetorrens', 'US', 2, 8),
  ('awc-2026-champion-howlind', 'howlind', 'FR', 1, 9),
  ('awc-2026-champion-renaudmerle', 'renaudmerle', 'FR', 1, 10),
  ('awc-2026-champion-rabbier', 'rabbier', 'NZ', 1, 11),
  ('awc-2026-champion-theatomicstorm', 'theatomicstorm', 'US', 1, 12),
  ('awc-2026-champion-dandan2016', 'dandan2016', 'US', 1, 13),
  ('awc-2026-champion-tolya-starina0995', 'tolya_starina0995', 'RU', 1, 14),
  ('awc-2026-champion-crepuscular', 'crepuscular', 'US', 1, 15),
  ('awc-2026-champion-stinkypotato', 'stinkypotato', 'US', 0, 16),
  ('awc-2026-champion-goroarmet', 'goroarmet', 'ES', 0, 17),
  ('awc-2026-champion-arinor0109', 'arinor0109', 'SE', 0, 18),
  ('awc-2026-champion-matvei-e2e4', 'matvei-e2e4', 'RU', 0, 19)
) as metadata(id, display_name, country_code, starting_chance, display_order)
where market.id = metadata.id;

create index if not exists prediction_markets_catalog_idx
  on public.prediction_markets (group_order, display_order)
  where group_id is not null;

commit;
