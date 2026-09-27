-- Exact archive source for puzzles whose originating game can be identified.

alter table public.puzzles
  add column if not exists game_id text,
  add column if not exists match_id text;

create index if not exists puzzles_game_id_idx
  on public.puzzles (game_id)
  where game_id is not null;

create index if not exists puzzles_match_id_idx
  on public.puzzles (match_id)
  where match_id is not null;

comment on column public.puzzles.game_id is
  'Exact Lichess or Chess.com game ID containing the puzzle position.';

comment on column public.puzzles.match_id is
  'Archived match ID containing the source game for this puzzle.';

comment on column public.puzzles.event_date is
  'Exact UTC date of the source match when known; otherwise the submitted event date.';

notify pgrst, 'reload schema';
