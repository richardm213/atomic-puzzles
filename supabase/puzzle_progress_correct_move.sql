-- Identifies the chosen line for correct attempts on puzzles with multiple solutions.
alter table public.puzzle_progress
  add column if not exists correct_move text;

comment on column public.puzzle_progress.correct_move is
  'Move played at the first point where the correct solution lines diverge, including move number.';

create or replace function public.record_first_puzzle_attempt_v2(
  p_username text,
  p_puzzle_id text,
  p_puzzle_correct boolean,
  p_incorrect_move text,
  p_correct_move text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(btrim(p_username), '') is null then
    raise exception 'Username is required';
  end if;

  if nullif(btrim(p_puzzle_id), '') is null then
    raise exception 'Puzzle ID is required';
  end if;

  insert into public.puzzle_progress (
    username,
    puzzle_id,
    first_attempt_at,
    puzzle_correct,
    incorrect_move,
    correct_move
  )
  values (
    lower(btrim(p_username)),
    btrim(p_puzzle_id),
    now(),
    p_puzzle_correct,
    case
      when p_puzzle_correct then null
      else nullif(left(btrim(coalesce(p_incorrect_move, '')), 100), '')
    end,
    case
      when p_puzzle_correct
        then nullif(left(btrim(coalesce(p_correct_move, '')), 100), '')
      else null
    end
  )
  on conflict do nothing;
end;
$$;

revoke all on function public.record_first_puzzle_attempt_v2(
  text,
  text,
  boolean,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.record_first_puzzle_attempt_v2(
  text,
  text,
  boolean,
  text,
  text
) to service_role;
