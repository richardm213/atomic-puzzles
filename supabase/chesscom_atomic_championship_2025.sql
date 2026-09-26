-- 2025 Chess.com Atomic Championship double-elimination archive.
-- Results and pairings: official Chess.com event report published March 28, 2025.

begin;

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
values (
  'ccac2025',
  'ccac',
  'Chess.com Atomic Championship',
  'CCAC 2025',
  'Chess.com Atomic Championship 2025',
  2025,
  '2025-03-27',
  '2025-03-28',
  'available',
  'blitz',
  true,
  '/images/awc-trophies/chesscomatomic.png',
  true,
  null,
  40
)
on conflict (id) do update set
  series_key = excluded.series_key,
  series_name = excluded.series_name,
  title = excluded.title,
  heading_title = excluded.heading_title,
  year = excluded.year,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  status = excluded.status,
  match_mode = excluded.match_mode,
  hide_start_round_controls = excluded.hide_start_round_controls,
  trophy_asset_path = excluded.trophy_asset_path,
  show_champion = excluded.show_champion,
  home_feature_order = excluded.home_feature_order,
  display_order = excluded.display_order;

delete from public.tournament_seeds
where tournament = 'ccac2025';

insert into public.tournament_matches (
  tournament, bracket, round, "order", id, match_id, p1, p2, s1, s2, winner_to, loser_to
)
values
  ('ccac2025', 'main', 'Quarterfinals', 1, 'ccac2025-wb-qf-m1', null, 'rojitto', 'shnitez', 2.5, 1.5, 'ccac2025-wb-sf-m1', 'ccac2025-lb-r1-m1'),
  ('ccac2025', 'main', 'Quarterfinals', 2, 'ccac2025-wb-qf-m2', '79571177', 'opabinia', 'lesha2002', 3, 2, 'ccac2025-wb-sf-m1', 'ccac2025-lb-r1-m1'),
  ('ccac2025', 'main', 'Quarterfinals', 3, 'ccac2025-wb-qf-m3', '79571205', 'fast-tsunami', 'alwaysbullet', 3, 0, 'ccac2025-wb-sf-m2', 'ccac2025-lb-r1-m2'),
  ('ccac2025', 'main', 'Quarterfinals', 4, 'ccac2025-wb-qf-m4', '79571277', 'jakestatefarm', 'pawnosaurus', 3, 2, 'ccac2025-wb-sf-m2', 'ccac2025-lb-r1-m2'),
  ('ccac2025', 'main', 'Semifinals', 5, 'ccac2025-wb-sf-m1', '79574150', 'rojitto', 'opabinia', 0, 3, 'ccac2025-wb-final', 'ccac2025-lb-qf-m2'),
  ('ccac2025', 'main', 'Semifinals', 6, 'ccac2025-wb-sf-m2', '79574127', 'fast-tsunami', 'jakestatefarm', 1, 3, 'ccac2025-wb-final', 'ccac2025-lb-qf-m1'),
  ('ccac2025', 'main', 'Finals', 7, 'ccac2025-wb-final', '79576112', 'opabinia', 'jakestatefarm', 0.5, 2.5, 'ccac2025-grand-final-set-1', 'ccac2025-lb-final'),
  ('ccac2025', 'losers', 'Round 1', 8, 'ccac2025-lb-r1-m1', '79574137', 'shnitez', 'lesha2002', 0, 3, 'ccac2025-lb-qf-m1', null),
  ('ccac2025', 'losers', 'Round 1', 9, 'ccac2025-lb-r1-m2', '79574168', 'alwaysbullet', 'pawnosaurus', 0, 3, 'ccac2025-lb-qf-m2', null),
  ('ccac2025', 'losers', 'Quarterfinals', 10, 'ccac2025-lb-qf-m1', '79576091', 'fast-tsunami', 'lesha2002', 3, 2, 'ccac2025-lb-sf', null),
  ('ccac2025', 'losers', 'Quarterfinals', 11, 'ccac2025-lb-qf-m2', '79576095', 'rojitto', 'pawnosaurus', 1, 3, 'ccac2025-lb-sf', null),
  ('ccac2025', 'losers', 'Semifinal', 12, 'ccac2025-lb-sf', '79578729', 'fast-tsunami', 'pawnosaurus', 3, 1, 'ccac2025-lb-final', null),
  ('ccac2025', 'losers', 'Final', 14, 'ccac2025-lb-final', '79580391', 'opabinia', 'fast-tsunami', 0, 3, 'ccac2025-grand-final-set-1', null),
  ('ccac2025', 'grand_final', 'Set 1', 15, 'ccac2025-grand-final-set-1', '79582268', 'jakestatefarm', 'fast-tsunami', 2, 3, 'ccac2025-grand-final-reset', null),
  ('ccac2025', 'grand_final', 'Reset', 16, 'ccac2025-grand-final-reset', '79582268', 'jakestatefarm', 'fast-tsunami', 3.5, 2.5, null, null)
on conflict (tournament, id) do update set
  bracket = excluded.bracket,
  round = excluded.round,
  "order" = excluded."order",
  match_id = excluded.match_id,
  p1 = excluded.p1,
  p2 = excluded.p2,
  s1 = excluded.s1,
  s2 = excluded.s2,
  winner_to = excluded.winner_to,
  loser_to = excluded.loser_to;

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
  'ccac2025',
  'jakestatefarm',
  'chesscom-atomic-2025',
  1,
  'CC 2025',
  '2025 Chess.com Atomic Champion',
  'Champion',
  '2025-03-28',
  980,
  null
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
