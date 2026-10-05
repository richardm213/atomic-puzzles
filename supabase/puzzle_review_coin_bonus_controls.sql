-- Lets the puzzle reviewer choose the two quality bonuses while approving.
-- Existing rewards are unchanged; the compatibility overload uses the UI defaults.
begin;

create or replace function public.award_coins_for_created_puzzle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_author text := lower(btrim(coalesce(new.author, '')));
  explanation_word_count integer := case
    when nullif(btrim(coalesce(new.explanation, '')), '') is null then 0
    else cardinality(
      regexp_split_to_array(btrim(new.explanation), '[[:space:]]+')
    )
  end;
  explanation_bonus integer := 0;
  complexity_bonus integer := 0;
  reward integer := 10;
  review_complexity_setting text := current_setting(
    'app.puzzle_creation_complexity_bonus',
    true
  );
  review_explanation_setting text := current_setting(
    'app.puzzle_creation_explanation_bonus',
    true
  );
  has_review_override boolean := review_complexity_setting in ('true', 'false')
    and review_explanation_setting in ('true', 'false');
begin
  if has_review_override then
    complexity_bonus := case when review_complexity_setting::boolean then 3 else 0 end;
    explanation_bonus := case when review_explanation_setting::boolean then 2 else 0 end;
    reward := 5 + complexity_bonus + explanation_bonus;
  elsif normalized_author in ('wolfram_ep', 'randoomplayer', 'seaside_tiramisu') then
    complexity_bonus := 3;
    explanation_bonus := case when explanation_word_count >= 12 then 2 else 0 end;
    reward := 5 + complexity_bonus + explanation_bonus;
  end if;

  if normalized_author <> ''
    and not public.is_coin_economy_banned(normalized_author) then
    perform public.apply_coin_transaction(
      normalized_author,
      reward,
      'puzzle_created',
      'puzzle:' || new.id,
      jsonb_build_object(
        'puzzleId', new.id,
        'reward', reward,
        'baseReward', case
          when has_review_override
            or normalized_author in ('wolfram_ep', 'randoomplayer', 'seaside_tiramisu') then 5
          else 10
        end,
        'complexityBonus', complexity_bonus,
        'explanationBonus', explanation_bonus,
        'explanationWordCount', explanation_word_count
      ),
      now()
    );
  end if;

  return new;
end;
$$;

create or replace function public.approve_queued_puzzle(
  p_queue_id bigint,
  p_reviewer text,
  p_puzzle_id bigint,
  p_complexity_bonus boolean,
  p_explanation_bonus boolean
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  queued public.puzzles_queue%rowtype;
  puzzle_id_sequence text;
  highest_puzzle_id bigint;
begin
  if lower(btrim(coalesce(p_reviewer, ''))) <> 'seaside_tiramisu' then
    raise exception 'Only seaside_tiramisu can approve puzzle submissions';
  end if;

  if p_puzzle_id is null or p_puzzle_id < 1 then
    raise exception 'Puzzle ID must be a positive integer';
  end if;

  if p_complexity_bonus is null or p_explanation_bonus is null then
    raise exception 'Puzzle reward bonus selections are required';
  end if;

  select * into queued
  from public.puzzles_queue
  where id = p_queue_id
  for update;

  if not found then
    raise exception 'Pending puzzle submission % was not found', p_queue_id;
  end if;

  -- Serialize ID allocation and insertion with other approvals.
  lock table public.puzzles in share row exclusive mode;

  -- The puzzle-created trigger reads these transaction-local settings so the
  -- reviewer's selections and the puzzle insert remain one atomic operation.
  perform set_config(
    'app.puzzle_creation_complexity_bonus',
    p_complexity_bonus::text,
    true
  );
  perform set_config(
    'app.puzzle_creation_explanation_bonus',
    p_explanation_bonus::text,
    true
  );

  begin
    insert into public.puzzles (
      id, fen, solution, event, event_name, event_date, players,
      white_player, black_player, explanation, opa_style, author
    )
    values (
      p_puzzle_id,
      btrim(queued.fen),
      btrim(queued.solution),
      btrim(queued.event),
      btrim(queued.event_name),
      btrim(queued.event_date),
      queued.players,
      btrim(queued.white_player),
      btrim(queued.black_player),
      btrim(queued.explanation),
      queued.opa_style,
      queued.submitted_by
    );
  exception
    when unique_violation then
      raise exception 'Puzzle ID % already exists', p_puzzle_id;
  end;

  -- Explicit identity values do not advance PostgreSQL's backing sequence.
  -- Keep it aligned so any future default-ID insert starts after this puzzle.
  select pg_get_serial_sequence('public.puzzles', 'id')
  into puzzle_id_sequence;

  if puzzle_id_sequence is not null then
    select coalesce(max(id), 0)
    into highest_puzzle_id
    from public.puzzles;

    perform setval(
      puzzle_id_sequence::regclass,
      highest_puzzle_id,
      true
    );
  end if;

  delete from public.puzzles_queue
  where id = p_queue_id;

  return p_puzzle_id;
end;
$$;

-- Keep the prior RPC available while older deployed clients roll forward.
-- Its behavior matches the review page defaults.
create or replace function public.approve_queued_puzzle(
  p_queue_id bigint,
  p_reviewer text,
  p_puzzle_id bigint
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.approve_queued_puzzle(
    p_queue_id,
    p_reviewer,
    p_puzzle_id,
    true,
    false
  );
end;
$$;

revoke all on function public.approve_queued_puzzle(bigint, text, bigint) from public;
grant execute on function public.approve_queued_puzzle(bigint, text, bigint) to service_role;
revoke all on function public.approve_queued_puzzle(bigint, text, bigint, boolean, boolean) from public;
grant execute on function public.approve_queued_puzzle(bigint, text, bigint, boolean, boolean) to service_role;

notify pgrst, 'reload schema';

commit;
