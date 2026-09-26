-- Replace partial puzzle-set dates with the verified UTC start day of the
-- underlying match. Also attach archive match IDs where that match is present
-- in the matches database.
-- Run after puzzle_sets.sql.

alter table public.puzzle_sets
  add column if not exists source_id text;

-- These four practice sets were all played at 3+2. Identify them by the time
-- control rather than by a varying or unknown number of games.
update public.puzzle_sets
set event_name = '3+2 match'
where lower(btrim(event_name)) in ('blitz match', 'blitz 6-game match', 'blitz 8-game match', 'blitz 10-game match');

update public.puzzles
set event_name = '3+2 match'
where lower(btrim(event_name)) in ('blitz match', 'blitz 6-game match', 'blitz 8-game match', 'blitz 10-game match');

with exact_dates(event_name, previous_dates, event_date, players, source_id) as (
  values
    ('ACL S2', array['2026-02'], '2026-02-21', array['lesha2002','maracker'], 'tiPlLQEE'),
    ('ACL S2', array['2026-03'], '2026-03-08', array['quasabianth','rabbier'], 'fIJoCI7j'),
    ('ACL S2', array['2026-03'], '2026-03-26', array['quasabianth','studieb'], 'cna1BteU'),
    ('Atomic960 Swiss', array['2026'], '2026-02-28', array['queeneatingdragon','rkrounit'], null),
    ('AWC 2018 Finals', array['2018','2018-11'], '2018-11-27', array['onubense','tipau'], 'Yr9V8s5R'),
    ('AWC 2021 Quarterfinals', array['2021','2021-10'], '2021-10-16', array['astavakra','wolfram_ep'], '5xtZlERw'),
    ('AWC 2023 Losers Round 3', array['2023','2023-11'], '2023-11-04', array['jakestatefarm','lesha2002'], 'OqWE65nu'),
    ('AWC 2025 Round of 64', array['2025','2025-09'], '2025-09-21', array['blackjack84','sircachetes'], 'tUvUftLZ'),
    ('AWC 2025 Round of 32', array['2025','2025-09'], '2025-09-28', array['maxwellssilvrhammer','sircachetes'], 'IJL3lXpE'),
    ('AWC 2025 Round of 16', array['2025','2025-10'], '2025-10-08', array['randoomplayer','wolfram_ep'], '75L7QLTy'),
    ('3+2 match', array['2026-03','2026-04'], '2026-03-19', array['opabinia','rechesster'], 'CYLH7bBT'),
    ('3+2 match', array['2026-04'], '2026-04-21', array['paper-skies','rechesster'], null),
    ('3+2 match', array['2026-09'], '2026-09-20', array['maxwellssilvrhammer','wolfram_ep'], 'irgn69Ce'),
    ('3+2 match', array['2026-09'], '2026-09-10', array['rechesster','wolfram_ep'], '3OG5r1jh'),
    ('Wolfarena', array['2026'], '2026-08-16', array['maracker','rabbier'], 'UhIDR1jR'),
    ('Wolfarena', array['2026'], '2026-07-23', array['quasabianth','wolfram_ep'], 'sHD4NH5z'),
    ('Wolfarena', array['2026'], '2026-08-07', array['rechesster','wolfram_ep'], 'K2GJJJnb'),
    ('Wolfrandom', array['2026-09'], '2026-09-25', array['quasabianth','rabbier'], 's1XjJvZ8')
)
update public.puzzle_sets puzzle_set
set event_date = exact_dates.event_date,
    source_id = coalesce(exact_dates.source_id, puzzle_set.source_id)
from exact_dates
where lower(btrim(puzzle_set.event_name)) = lower(exact_dates.event_name)
  and puzzle_set.event_date = any(exact_dates.previous_dates)
  and public.normalize_puzzle_set_players(puzzle_set.players) =
      public.normalize_puzzle_set_players(exact_dates.players);

-- Keep the compatibility columns synchronized while all application reads use
-- the canonical puzzle_sets relation.
update public.puzzles puzzle
set event_name = puzzle_set.event_name,
    event_date = puzzle_set.event_date,
    players = puzzle_set.players
from public.puzzle_sets puzzle_set
where puzzle.puzzle_set_id = puzzle_set.id
  and (puzzle.event_name is distinct from puzzle_set.event_name
    or puzzle.event_date is distinct from puzzle_set.event_date
    or puzzle.players is distinct from puzzle_set.players);

notify pgrst, 'reload schema';
