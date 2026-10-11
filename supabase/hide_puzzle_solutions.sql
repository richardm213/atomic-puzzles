-- Puzzle-solution privacy setup and final cutover. Do not apply until
-- /api/puzzles/play and the client that uses it are deployed and verified.
--
-- Browser clients use the Supabase anon role even after Lichess login. Revoke
-- the table-wide grant, then restore read access to public metadata only. The
-- playable position and solution are available exclusively through the
-- signed-session /api/puzzles/play endpoint. Server-side service-role clients
-- retain full access.
-- Emergency rollback: `grant select on table public.puzzles to anon, authenticated;`

alter table public.puzzles
  add column if not exists has_solution boolean
  generated always as (solution is not null and length(btrim(solution)) > 0) stored;

comment on column public.puzzles.has_solution is
  'Public-safe indicator used to filter playable puzzles without reading solution text.';

revoke select on table public.puzzles from anon, authenticated;

grant select (
  id,
  author,
  created_at,
  black_player,
  event,
  event_date,
  event_name,
  explanation,
  game_id,
  has_solution,
  match_id,
  opa_style,
  players,
  puzzle_level,
  puzzle_rating,
  puzzle_rating_attempts,
  puzzle_rating_deviation,
  puzzle_rating_source,
  puzzle_rating_successes,
  puzzle_rating_updated_at,
  puzzle_set_id,
  source,
  source_id,
  tags,
  white_player
) on table public.puzzles to anon, authenticated;

notify pgrst, 'reload schema';
