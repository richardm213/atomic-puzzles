-- Keep solution text out of PostgREST responses made with browser credentials.
-- Puzzle play and post-attempt reveal now go through the server-side play endpoint.
revoke select on table public.puzzles from anon, authenticated;

grant select (
  id,
  fen,
  author,
  event,
  event_name,
  event_date,
  players,
  puzzle_set_id,
  white_player,
  black_player,
  explanation,
  tags,
  opa_style,
  game_id,
  match_id
) on table public.puzzles to anon, authenticated;

-- Intentionally do not grant SELECT(solution). The service-role-backed Netlify
-- functions remain able to validate moves and reveal completed puzzles.
