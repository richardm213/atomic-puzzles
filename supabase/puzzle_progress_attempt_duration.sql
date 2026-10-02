-- Record how long the solver spent before their first correct or incorrect attempt.
alter table public.puzzle_progress
  add column if not exists first_attempt_duration_ms integer;

comment on column public.puzzle_progress.first_attempt_duration_ms is
  'Elapsed milliseconds from puzzle readiness to the user''s first resolved attempt.';

alter table public.puzzle_progress
  drop constraint if exists puzzle_progress_first_attempt_duration_ms_check;

alter table public.puzzle_progress
  add constraint puzzle_progress_first_attempt_duration_ms_check
  check (first_attempt_duration_ms is null or first_attempt_duration_ms >= 0);

create or replace function public.record_first_puzzle_attempt_v2(
  p_username text,
  p_puzzle_id text,
  p_puzzle_correct boolean,
  p_attempt_duration_ms integer,
  p_incorrect_move text,
  p_correct_move text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
  reward integer := 0;
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
    first_attempt_duration_ms,
    puzzle_correct,
    incorrect_move,
    correct_move
  )
  values (
    lower(btrim(p_username)),
    btrim(p_puzzle_id),
    now(),
    greatest(0, p_attempt_duration_ms),
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

  get diagnostics inserted_count = row_count;
  if inserted_count = 1 and p_puzzle_correct then
    select transaction.amount
    into reward
    from public.coin_transactions transaction
    where transaction.source_key =
      'attempt:' || lower(btrim(p_username)) || ':' || btrim(p_puzzle_id);
  end if;

  return reward;
end;
$$;

revoke all on function public.record_first_puzzle_attempt_v2(
  text,
  text,
  boolean,
  integer,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.record_first_puzzle_attempt_v2(
  text,
  text,
  boolean,
  integer,
  text,
  text
) to service_role;

notify pgrst, 'reload schema';
