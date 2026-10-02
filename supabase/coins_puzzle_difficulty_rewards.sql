-- Award puzzle-solve coins by V level. Incorrect first attempts earn no coins.
begin;

create or replace function public.award_coins_for_puzzle_attempt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  reward integer;
  puzzle_author text;
  puzzle_created_at timestamptz;
begin
  if not new.puzzle_correct then
    return new;
  end if;

  select lower(btrim(puzzle.author)), puzzle.created_at
  into puzzle_author, puzzle_created_at
  from public.puzzles puzzle
  where puzzle.id::text = new.puzzle_id;

  if puzzle_author = lower(btrim(new.username))
    and new.first_attempt_at >= puzzle_created_at
    and new.first_attempt_at < puzzle_created_at + interval '3 days' then
    return new;
  end if;

  select case coalesce(rating.human_level, rating.computed_level, 3)
    when 1 then 2
    when 2 then 2
    when 4 then 5
    when 5 then 10
    else 3
  end
  into reward
  from (select 1) fallback
  left join public.puzzle_ratings rating on rating.puzzle_id = new.puzzle_id::bigint;

  perform public.apply_coin_transaction(
    new.username,
    reward,
    'puzzle_correct',
    'attempt:' || lower(btrim(new.username)) || ':' || new.puzzle_id,
    jsonb_build_object('puzzleId', new.puzzle_id, 'correct', true, 'reward', reward),
    new.first_attempt_at
  );

  return new;
end;
$$;

create or replace function public.record_first_puzzle_attempt_v2(
  p_username text,
  p_puzzle_id text,
  p_puzzle_correct boolean,
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

notify pgrst, 'reload schema';
commit;
