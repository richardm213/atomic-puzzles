-- Atomic Chess League seasons are separate team archives rendered from the
-- source-audited standings and board results in src/lib/matches/atomicChessLeague.ts.

begin;

delete from public.tournament_catalog where id = 'acl';

insert into public.tournament_catalog (
  id,
  series_key,
  series_name,
  title,
  heading_title,
  year,
  start_date,
  end_date,
  status,
  match_mode,
  hide_start_round_controls,
  trophy_asset_path,
  show_champion,
  home_feature_order,
  display_order
)
values
  (
    'acl-s2',
    'acl',
    'Atomic Chess League',
    'Atomic Chess League Season 2',
    null,
    2026,
    '2026-02-01',
    '2026-03-29',
    'available',
    'blitz',
    true,
    '/images/acl-trophies/league-reactor-v2.png',
    false,
    null,
    1
  ),
  (
    'acl-s1',
    'acl',
    'Atomic Chess League',
    'Atomic Chess League Season 1',
    null,
    2025,
    '2025-07-01',
    '2025-08-30',
    'available',
    'blitz',
    true,
    '/images/acl-trophies/team-orbit.png',
    false,
    null,
    2
  )
on conflict (id) do update set
  series_key = excluded.series_key,
  series_name = excluded.series_name,
  title = excluded.title,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  year = excluded.year,
  status = excluded.status,
  match_mode = excluded.match_mode,
  hide_start_round_controls = excluded.hide_start_round_controls,
  trophy_asset_path = excluded.trophy_asset_path,
  show_champion = excluded.show_champion,
  home_feature_order = excluded.home_feature_order,
  display_order = excluded.display_order;

-- Every member of a division-winning roster receives the season trophy on
-- their profile. Placements are unique within a tournament because the
-- awards table also serves individual events; the user-facing placement label
-- records that every one of these players is a team champion.
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
values
  ('acl-s2', 'jakestatefarm', 'acl-s2-elite-jakestatefarm', 1, 'ACL S2', 'ACL Season 2 Elite League Champion', 'Elite League champion', '2026-03-29', 960, null),
  ('acl-s2', 'rkrounit', 'acl-s2-elite-rkrounit', 2, 'ACL S2', 'ACL Season 2 Elite League Champion', 'Elite League champion', '2026-03-29', 960, null),
  ('acl-s2', 'maracker', 'acl-s2-elite-maracker', 3, 'ACL S2', 'ACL Season 2 Elite League Champion', 'Elite League champion', '2026-03-29', 960, null),
  ('acl-s2', 'studieb', 'acl-s2-elite-studieb', 4, 'ACL S2', 'ACL Season 2 Elite League Champion', 'Elite League champion', '2026-03-29', 960, null),
  ('acl-s2', 'orcinus_orca', 'acl-s2-challenger-orcinus_orca', 5, 'ACL S2', 'ACL Season 2 Challenger League Champion', 'Challenger League champion', '2026-03-29', 940, null),
  ('acl-s2', 'absolutelytrash', 'acl-s2-challenger-absolutelytrash', 6, 'ACL S2', 'ACL Season 2 Challenger League Champion', 'Challenger League champion', '2026-03-29', 940, null),
  ('acl-s2', 'knightblade_123', 'acl-s2-challenger-knightblade_123', 7, 'ACL S2', 'ACL Season 2 Challenger League Champion', 'Challenger League champion', '2026-03-29', 940, null),
  ('acl-s2', 'marcothetiger', 'acl-s2-challenger-marcothetiger', 8, 'ACL S2', 'ACL Season 2 Challenger League Champion', 'Challenger League champion', '2026-03-29', 940, null),
  ('acl-s2', 'f55555', 'acl-s2-challenger-f55555', 9, 'ACL S2', 'ACL Season 2 Challenger League Champion', 'Challenger League champion', '2026-03-29', 940, null),
  ('acl-s2', 'i-win-00', 'acl-s2-challenger-i-win-00', 10, 'ACL S2', 'ACL Season 2 Challenger League Champion', 'Challenger League champion', '2026-03-29', 940, null),
  ('acl-s1', 'natso', 'acl-s1-elite-natso', 1, 'ACL S1', 'ACL Season 1 Elite League Champion', 'Elite League champion', '2025-08-30', 960, null),
  ('acl-s1', 'neverofzero', 'acl-s1-elite-neverofzero', 2, 'ACL S1', 'ACL Season 1 Elite League Champion', 'Elite League champion', '2025-08-30', 960, null),
  ('acl-s1', 'rechesster', 'acl-s1-elite-rechesster', 3, 'ACL S1', 'ACL Season 1 Elite League Champion', 'Elite League champion', '2025-08-30', 960, null),
  ('acl-s1', 'rkrounit', 'acl-s1-elite-rkrounit', 4, 'ACL S1', 'ACL Season 1 Elite League Champion', 'Elite League champion', '2025-08-30', 960, null),
  ('acl-s1', 'rabbier', 'acl-s1-challenger-rabbier', 5, 'ACL S1', 'ACL Season 1 Challenger League Champion', 'Challenger League champion', '2025-08-30', 940, null),
  ('acl-s1', 'dandan2016', 'acl-s1-challenger-dandan2016', 6, 'ACL S1', 'ACL Season 1 Challenger League Champion', 'Challenger League champion', '2025-08-30', 940, null),
  ('acl-s1', 'studieb', 'acl-s1-challenger-studieb', 7, 'ACL S1', 'ACL Season 1 Challenger League Champion', 'Challenger League champion', '2025-08-30', 940, null),
  ('acl-s1', 'bercerk_atim', 'acl-s1-challenger-bercerk_atim', 8, 'ACL S1', 'ACL Season 1 Challenger League Champion', 'Challenger League champion', '2025-08-30', 940, null),
  ('acl-s1', 'jmilie', 'acl-s1-challenger-jmilie', 9, 'ACL S1', 'ACL Season 1 Challenger League Champion', 'Challenger League champion', '2025-08-30', 940, null)
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
