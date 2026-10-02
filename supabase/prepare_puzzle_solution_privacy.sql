-- Phase 1: safe preparation. This does not change existing read permissions.
-- Apply after the puzzle details endpoint is deployed and verified directly.

alter table public.puzzles
  add column if not exists has_solution boolean
  generated always as (solution is not null and length(btrim(solution)) > 0) stored;

comment on column public.puzzles.has_solution is
  'Public-safe indicator used to filter playable puzzles without reading solution text.';

notify pgrst, 'reload schema';
