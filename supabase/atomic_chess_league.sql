-- Atomic Chess League is a multi-season team archive rendered from the
-- compact, source-audited data in src/lib/matches/atomicChessLeague.ts.

begin;

insert into public.tournament_catalog (
  id,
  series_key,
  series_name,
  title,
  heading_title,
  year,
  status,
  match_mode,
  hide_start_round_controls,
  trophy_asset_path,
  show_champion,
  home_feature_order,
  display_order
)
values (
  'acl',
  'acl',
  'Atomic Chess League',
  'Atomic Chess League',
  null,
  2026,
  'available',
  'blitz',
  true,
  null,
  false,
  null,
  1
)
on conflict (id) do update set
  series_key = excluded.series_key,
  series_name = excluded.series_name,
  title = excluded.title,
  year = excluded.year,
  status = excluded.status,
  match_mode = excluded.match_mode,
  hide_start_round_controls = excluded.hide_start_round_controls,
  trophy_asset_path = excluded.trophy_asset_path,
  show_champion = excluded.show_champion,
  home_feature_order = excluded.home_feature_order,
  display_order = excluded.display_order;

commit;
