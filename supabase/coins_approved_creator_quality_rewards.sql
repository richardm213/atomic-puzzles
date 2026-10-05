-- Approved direct publishers receive the puzzle quality bonuses automatically.
-- This changes future puzzle-created transactions only; existing rewards are unchanged.
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

commit;
