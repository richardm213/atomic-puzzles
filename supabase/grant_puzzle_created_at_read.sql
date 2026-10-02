-- Hotfix for databases where puzzle_creation_dates_and_self_solve_rewards.sql
-- was applied after the puzzle-solution privacy cutover.

grant select (created_at) on table public.puzzles to anon, authenticated;

notify pgrst, 'reload schema';
