-- Wolfarena 2026 uses a round-by-round arena archive in the application rather
-- than tournament_matches bracket rows. The catalog and award records keep it
-- visible in the shared tournament archive and player trophy system.

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
  show_champion,
  home_feature_order,
  display_order
)
values (
  'wr-arena2026',
  'wr-arena',
  'Wolfarena',
  'Wolfarena 2026',
  null,
  2026,
  'available',
  'wolfrandom',
  true,
  true,
  null,
  50
)
on conflict (id) do update set
  series_key = excluded.series_key,
  series_name = excluded.series_name,
  title = excluded.title,
  year = excluded.year,
  status = excluded.status,
  match_mode = excluded.match_mode,
  hide_start_round_controls = excluded.hide_start_round_controls,
  show_champion = excluded.show_champion,
  home_feature_order = excluded.home_feature_order,
  display_order = excluded.display_order;

insert into public.tournament_awards (
  tournament_id,
  player_name,
  award_key,
  placement,
  label,
  title,
  placement_label,
  awarded_on,
  prestige,
  asset_path
)
values (
  'wr-arena2026',
  'quasabianth',
  'wr-arena-2026',
  1,
  'Wolfarena 2026',
  '2026 Wolfarena Champion',
  'Champion',
  '2026-09-15',
  930,
  '/images/wolfarena-trophies/wolfarena-red-ruby-cup.png'
)
on conflict (tournament_id, award_key) do update set
  player_name = excluded.player_name,
  placement = excluded.placement,
  label = excluded.label,
  title = excluded.title,
  placement_label = excluded.placement_label,
  awarded_on = excluded.awarded_on,
  prestige = excluded.prestige,
  asset_path = excluded.asset_path;

commit;
