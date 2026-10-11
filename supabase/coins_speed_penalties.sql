-- Add smoothly decaying time adjustments to rated first attempts made in under
-- 30 seconds: a small V1-V3 solve bonus and an incorrect-attempt surcharge.
-- Run fractional_coins.sql before this migration.
begin;

create or replace function public.award_coins_for_puzzle_attempt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  coin_delta numeric(18, 6);
  puzzle_author text;
  puzzle_created_at timestamptz;
  puzzle_level smallint;
  base_reward numeric(18, 6) := 0;
  speed_bonus numeric(18, 6) := 0;
  base_penalty numeric(18, 6) := 0;
  speed_penalty numeric(18, 6) := 0;
  requested_penalty numeric(18, 6) := 0;
  current_balance numeric(18, 6);
begin
  -- Economy-banned players and unrated attempts never mutate coin balances.
  if not new.rated or public.is_coin_economy_banned(new.username) then
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
      and new.first_attempt_at < puzzle_created_at + interval '1 month' then
      return new;
    end if;

    base_reward := case puzzle_level
      when 1 then 2
      when 2 then 2
      when 4 then 5
      when 5 then 10
      else 3
    end;

    if puzzle_level between 1 and 3
      and new.first_attempt_duration_ms is not null
      and new.first_attempt_duration_ms >= 0
      and new.first_attempt_duration_ms < 30000 then
      -- Stays at 1 coin through 5 seconds, then approaches 0.2 before 30 seconds.
      speed_bonus := case
        when new.first_attempt_duration_ms <= 5000 then 1
        else round((
          power(
            5::numeric,
            -(
              (new.first_attempt_duration_ms::numeric - 5000::numeric)
              / 25000::numeric
            )
          )
        )::numeric, 6)
      end;
    end if;

    coin_delta := round(base_reward + speed_bonus, 6);

    perform public.apply_coin_transaction(
      new.username,
      coin_delta,
      'puzzle_correct',
      'attempt:' || lower(btrim(new.username)) || ':' || new.puzzle_id,
      jsonb_build_object(
        'puzzleId', new.puzzle_id,
        'correct', true,
        'level', puzzle_level,
        'reward', coin_delta,
        'baseReward', base_reward,
        'speedBonus', speed_bonus,
        'attemptDurationMs', new.first_attempt_duration_ms,
        'speedBonusVersion', 'v1-v3-full-through-5s-exponential-to-0.2-30s'
      ),
      new.first_attempt_at
    );
    return new;
  end if;

  base_penalty := case puzzle_level
    when 1 then 2
    when 2 then 2
    when 3 then 1
    else 0
  end;

  if new.first_attempt_duration_ms is not null
    and new.first_attempt_duration_ms >= 0
    and new.first_attempt_duration_ms < 30000 then
    -- Stays at 3 coins through 3 seconds, then approaches 0.5 before 30 seconds.
    speed_penalty := case
      when new.first_attempt_duration_ms <= 3000 then 3
      else round((
        3::numeric * power(
          6::numeric,
          -(
            (new.first_attempt_duration_ms::numeric - 3000::numeric)
            / 27000::numeric
          )
        )
      )::numeric, 6)
    end;
  end if;

  requested_penalty := round(base_penalty + speed_penalty, 6);
  if requested_penalty = 0 then
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

  -- Keep balances nonnegative while retaining the exact fractional deduction.
  coin_delta := -least(requested_penalty, current_balance);
  if coin_delta = 0 then
    return new;
  end if;

  perform public.apply_coin_transaction(
    new.username,
    coin_delta,
    'puzzle_attempted',
    'attempt:' || lower(btrim(new.username)) || ':' || new.puzzle_id,
    jsonb_build_object(
      'puzzleId', new.puzzle_id,
      'correct', false,
      'level', puzzle_level,
      'penalty', abs(coin_delta),
      'basePenalty', base_penalty,
      'speedPenalty', speed_penalty,
      'attemptDurationMs', new.first_attempt_duration_ms,
      'speedPenaltyVersion', 'full-through-3s-exponential-3-to-0.5-30s',
      'balanceCapped', abs(coin_delta) < requested_penalty
    ),
    new.first_attempt_at
  );

  return new;
end;
$$;

-- PostgreSQL requires the existing integer-returning function to be dropped
-- before its return type can change to numeric.
drop function if exists public.record_first_puzzle_attempt_v2(
  text,
  text,
  boolean,
  integer,
  text,
  text
);

create function public.record_first_puzzle_attempt_v2(
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
