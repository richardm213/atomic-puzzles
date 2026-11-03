-- Return only the coin change created by the current puzzle attempt.
--
-- Older puzzle transactions keep the same idempotency key. When an unrated
-- historical progress row becomes eligible for a rated attempt, the insert is
-- correctly ignored, but the RPC previously returned the old transaction's
-- amount and caused a false coin toast.
begin;

create or replace function public.record_first_puzzle_attempt_v2(
  p_username text,
  p_puzzle_id text,
  p_puzzle_correct boolean,
  p_attempt_duration_ms integer,
  p_incorrect_move text,
  p_correct_move text
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_username text := public.canonical_user_username(p_username);
  normalized_puzzle_id text := btrim(p_puzzle_id);
  coin_delta numeric(18, 6) := 0;
  attempt_at timestamptz := now();
  attempt_is_rated boolean := true;
  previous_attempt_at timestamptz;
  previous_attempt_rated boolean;
  has_previous_attempt boolean := false;
begin
  if nullif(normalized_username, '') is null then
    raise exception 'Username is required';
  end if;

  if nullif(normalized_puzzle_id, '') is null then
    raise exception 'Puzzle ID is required';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(normalized_username || ':' || normalized_puzzle_id, 0)
  );

  select progress.first_attempt_at, progress.rated
  into previous_attempt_at, previous_attempt_rated
  from public.puzzle_progress progress
  where progress.username = normalized_username
    and progress.puzzle_id = normalized_puzzle_id
  for update;
  has_previous_attempt := found;

  if has_previous_attempt and previous_attempt_rated then
    return 0;
  end if;

  if has_previous_attempt then
    attempt_is_rated := attempt_at >= previous_attempt_at + interval '1 month';
  else
    select not (
      lower(btrim(puzzle.author)) = normalized_username
      and attempt_at >= puzzle.created_at
      and attempt_at < puzzle.created_at + interval '1 month'
    )
    into attempt_is_rated
    from public.puzzles puzzle
    where puzzle.id::text = normalized_puzzle_id;

    attempt_is_rated := coalesce(attempt_is_rated, true);
  end if;

  if has_previous_attempt then
    update public.puzzle_progress
    set
      first_attempt_at = attempt_at,
      first_attempt_duration_ms = case
        when p_attempt_duration_ms >= 0 and p_attempt_duration_ms < 3600000
          then p_attempt_duration_ms
        else null
      end,
      puzzle_correct = p_puzzle_correct,
      rated = attempt_is_rated,
      incorrect_move = case
        when p_puzzle_correct then null
        else nullif(left(btrim(coalesce(p_incorrect_move, '')), 100), '')
      end,
      correct_move = case
        when p_puzzle_correct
          then nullif(left(btrim(coalesce(p_correct_move, '')), 100), '')
        else null
      end
    where username = normalized_username
      and puzzle_id = normalized_puzzle_id
      and not rated;
  else
    insert into public.puzzle_progress (
      username,
      puzzle_id,
      first_attempt_at,
      first_attempt_duration_ms,
      puzzle_correct,
      rated,
      incorrect_move,
      correct_move
    )
    values (
      normalized_username,
      normalized_puzzle_id,
      attempt_at,
      case
        when p_attempt_duration_ms >= 0 and p_attempt_duration_ms < 3600000
          then p_attempt_duration_ms
        else null
      end,
      p_puzzle_correct,
      attempt_is_rated,
      case
        when p_puzzle_correct then null
        else nullif(left(btrim(coalesce(p_incorrect_move, '')), 100), '')
      end,
      case
        when p_puzzle_correct
          then nullif(left(btrim(coalesce(p_correct_move, '')), 100), '')
        else null
      end
    );
  end if;

  select coalesce((
    select transaction.amount
    from public.coin_transactions transaction
    where transaction.source_key =
      'attempt:' || normalized_username || ':' || normalized_puzzle_id
      and transaction.created_at = attempt_at
  ), 0)
  into coin_delta;

  return coin_delta;
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

commit;

notify pgrst, 'reload schema';
