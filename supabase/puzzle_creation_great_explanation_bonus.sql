-- Apply in Firefox after the puzzle submission rewards migration.
begin;

create or replace function public.award_coins_for_created_puzzle()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  normalized_author text := lower(btrim(coalesce(new.author, '')));
  explanation_word_count integer := case
    when nullif(btrim(coalesce(new.explanation, '')), '') is null then 0
    else cardinality(regexp_split_to_array(btrim(new.explanation), '[[:space:]]+'))
  end;
  explanation_bonus integer := 0;
  great_explanation_bonus integer := 0;
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
    if current_setting('app.puzzle_creation_great_explanation_bonus', true) = 'true' then
      if coalesce(new.explanation, '') !~ '[^[:space:]]' then
        raise exception using errcode = 'PT400',
          message = 'Add an explanation before awarding the great explanation bonus.';
      end if;
      great_explanation_bonus := 3;
    end if;
    reward := 5 + complexity_bonus + explanation_bonus + great_explanation_bonus;
  elsif normalized_author in ('wolfram_ep', 'randoomplayer', 'seaside_tiramisu') then
    complexity_bonus := 3;
    explanation_bonus := case when explanation_word_count >= 12 then 2 else 0 end;
    reward := 5 + complexity_bonus + explanation_bonus;
  end if;

  if normalized_author <> '' then
    perform public.apply_coin_transaction(
      normalized_author, reward, 'puzzle_created', 'puzzle:' || new.id,
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
        'greatExplanationBonus', great_explanation_bonus,
        'explanationWordCount', explanation_word_count
      ),
      now()
    );
  end if;
  return new;
end;
$$;

-- Keep publication, rewards, and the approval notification in the existing transaction.
create or replace function public.approve_queued_puzzle(
  p_queue_id bigint,
  p_reviewer text,
  p_puzzle_id bigint,
  p_complexity_bonus boolean,
  p_explanation_bonus boolean,
  p_great_explanation_bonus boolean
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  prior_bonus text := current_setting('app.puzzle_creation_great_explanation_bonus', true);
  approved_id bigint;
begin
  if p_great_explanation_bonus is null then
    raise exception using errcode = 'PT400', message = 'Great explanation bonus selection is required.';
  end if;
  perform set_config('app.puzzle_creation_great_explanation_bonus', p_great_explanation_bonus::text, true);
  approved_id := public.approve_queued_puzzle(
    p_queue_id, p_reviewer, p_puzzle_id, p_complexity_bonus, p_explanation_bonus
  );
  perform set_config('app.puzzle_creation_great_explanation_bonus', coalesce(prior_bonus, ''), true);
  return approved_id;
end;
$$;

revoke all on function
  public.approve_queued_puzzle(bigint, text, bigint),
  public.approve_queued_puzzle(bigint, text, bigint, boolean, boolean),
  public.approve_queued_puzzle(bigint, text, bigint, boolean, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.approve_queued_puzzle(bigint, text, bigint, boolean, boolean, boolean)
  to service_role;

commit;
notify pgrst, 'reload schema';
