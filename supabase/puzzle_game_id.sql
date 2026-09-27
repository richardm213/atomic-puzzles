-- Exact source game for puzzles that were created from archived matches.

alter table public.puzzles
  add column if not exists game_id text;

create index if not exists puzzles_game_id_idx
  on public.puzzles (game_id)
  where game_id is not null;

comment on column public.puzzles.game_id is
  'Exact Lichess or Chess.com game ID containing the puzzle position. Match-level source IDs remain on puzzle_sets.source_id.';

notify pgrst, 'reload schema';
