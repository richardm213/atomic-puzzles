-- Increase correct-first-attempt rewards to 2 coins for V1/V2 and 3 coins for V3.
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

commit;
