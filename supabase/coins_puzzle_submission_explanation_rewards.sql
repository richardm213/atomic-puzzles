-- Reduce the base reward for publishing a puzzle to 5 coins. Puzzles with
-- explanations of at least 20 whitespace-delimited words earn 10 coins total.

begin;

create or replace function public.award_coins_for_created_puzzle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  explanation_word_count integer := case
    when nullif(btrim(coalesce(new.explanation, '')), '') is null then 0
    else cardinality(regexp_split_to_array(btrim(new.explanation), E'\\s+'))
  end;
  reward integer;
begin
  reward := case when explanation_word_count >= 20 then 10 else 5 end;

  if nullif(btrim(coalesce(new.author, '')), '') is not null
    and not public.is_coin_economy_banned(new.author) then
    perform public.apply_coin_transaction(
      new.author,
      reward,
      'puzzle_created',
      'puzzle:' || new.id,
      jsonb_build_object(
        'puzzleId', new.id,
        'reward', reward,
        'explanationWordCount', explanation_word_count
      ),
      now()
    );
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';

commit;

select
  position('explanation_word_count >= 20' in pg_get_functiondef('public.award_coins_for_created_puzzle()'::regprocedure)) > 0
    as explanation_reward_installed,
  position('then 10 else 5' in pg_get_functiondef('public.award_coins_for_created_puzzle()'::regprocedure)) > 0
    as reward_amounts_installed;
