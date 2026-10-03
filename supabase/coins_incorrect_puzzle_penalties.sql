-- Deduct coins for incorrect first attempts on easier puzzles.
-- Penalties are capped at the player's current balance so a puzzle submission
-- can never fail solely because the player has too few coins.
begin;

create or replace function public.award_coins_for_puzzle_attempt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  coin_delta integer;
  puzzle_author text;
  puzzle_created_at timestamptz;
  puzzle_level smallint;
  current_balance integer;
  transaction_id bigint;
begin
  -- Economy-banned players can still submit puzzles without any coin mutation.
  if public.is_coin_economy_banned(new.username) then
    return new;
  end if;

  select
    lower(btrim(puzzle.author)),
    puzzle.created_at,
    coalesce(rating.human_level, rating.computed_level, 3)
  into puzzle_author, puzzle_created_at, puzzle_level
  from public.puzzles puzzle
  left join public.puzzle_ratings rating on rating.puzzle_id = puzzle.id
  where puzzle.id::text = new.puzzle_id;

  if new.puzzle_correct then
    -- Do not reward creators for solving a newly published puzzle of their own.
    if puzzle_author = lower(btrim(new.username))
      and new.first_attempt_at >= puzzle_created_at
      and new.first_attempt_at < puzzle_created_at + interval '3 days' then
      return new;
    end if;

    coin_delta := case puzzle_level
      when 1 then 2
      when 2 then 2
      when 4 then 5
      when 5 then 10
      else 3
    end;

    perform public.apply_coin_transaction(
      new.username,
      coin_delta,
      'puzzle_correct',
      'attempt:' || lower(btrim(new.username)) || ':' || new.puzzle_id,
      jsonb_build_object(
        'puzzleId', new.puzzle_id,
        'correct', true,
        'level', puzzle_level,
        'reward', coin_delta
      ),
      new.first_attempt_at
    );
    return new;
  end if;

  coin_delta := case puzzle_level
    when 1 then -2
    when 2 then -2
    when 3 then -1
    else 0
  end;

  if coin_delta = 0 then
    return new;
  end if;

  insert into public.coin_accounts (username)
  values (lower(btrim(new.username)))
  on conflict (username) do nothing;

  select account.balance
  into current_balance
  from public.coin_accounts account
  where account.username = lower(btrim(new.username))
  for update;

  -- Keep balances nonnegative and do not write zero-value transactions.
  coin_delta := -least(abs(coin_delta), current_balance);
  if coin_delta = 0 then
    return new;
  end if;

  insert into public.coin_transactions (
    username,
    amount,
    reason,
    source_key,
    metadata,
    created_at
  ) values (
    lower(btrim(new.username)),
    coin_delta,
    'puzzle_attempted',
    'attempt:' || lower(btrim(new.username)) || ':' || new.puzzle_id,
    jsonb_build_object(
      'puzzleId', new.puzzle_id,
      'correct', false,
      'level', puzzle_level,
      'penalty', abs(coin_delta)
    ),
    new.first_attempt_at
  )
  on conflict (source_key) do nothing
  returning id into transaction_id;

  if transaction_id is not null then
    update public.coin_accounts
    set balance = balance + coin_delta, updated_at = now()
    where username = lower(btrim(new.username));
  end if;

  return new;
end;
$$;

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
  coin_delta integer := 0;
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
    case
      when p_attempt_duration_ms >= 0 and p_attempt_duration_ms < 3600000
        then p_attempt_duration_ms
      else null
    end,
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
  if inserted_count = 1 then
    select coalesce((
      select transaction.amount
      from public.coin_transactions transaction
      where transaction.source_key =
        'attempt:' || lower(btrim(p_username)) || ':' || btrim(p_puzzle_id)
    ), 0)
    into coin_delta;
  end if;

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

notify pgrst, 'reload schema';
commit;

select jsonb_build_object(
  'v1_incorrect_penalty', 2,
  'v2_incorrect_penalty', 2,
  'v3_incorrect_penalty', 1,
  'v4_incorrect_penalty', 0,
  'balance_floor', 0,
  'penalty_installed', position(
    'when 1 then -2'
    in pg_get_functiondef('public.award_coins_for_puzzle_attempt()'::regprocedure)
  ) > 0
) as migration_result;
