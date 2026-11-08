-- Run through Firefox on the current database, after the migration.
-- All votes, ledger entries, balances, and audit events created here are rolled back.
begin;
do $$
declare
  puzzle bigint;
  voter_name text;
  first_vote jsonb;
  response jsonb;
  initial_balance numeric;
  final_balance numeric;
  contribution integer;
  debt_reward_id bigint;
  spent_balance numeric;
begin
  select p.id, progress.username into puzzle, voter_name
  from public.puzzles p
  join public.puzzle_progress progress on progress.puzzle_id = p.id::text
  join public.coin_accounts account on account.username = progress.username
  where p.deleted_at is null and account.balance >= 1
    and not public.is_coin_economy_banned(progress.username)
    and not exists (select 1 from public.puzzle_tag_vote_history h
      where h.puzzle_id = p.id and h.voter = progress.username
        and h.tag in ('fork','epaulette_fork','endgame','pawn_endgame','threading_the_needle'))
  order by p.id limit 1;
  if puzzle is null then raise exception 'No isolated rollback-test fixture available'; end if;
  select balance into initial_balance from public.coin_accounts where username = voter_name;

  first_vote := public.cast_rewarded_puzzle_tag_vote(puzzle,voter_name,'epaulette_fork',1);
  if (first_vote->>'coinDelta')::numeric <= 0 then raise exception 'First child vote should earn reward'; end if;
  if not exists (select 1 from jsonb_array_elements(first_vote->'votes') t
    where t->>'tag'='fork' and (t->>'vote')::integer=1) then
    raise exception 'Child must imply parent vote';
  end if;
  response := public.cast_rewarded_puzzle_tag_vote(puzzle,voter_name,'fork',1);
  if (response->>'coinDelta')::numeric <> 0 then raise exception 'Child then parent rewarded twice'; end if;
  select sum(direction) into contribution from public.effective_puzzle_tag_votes(puzzle)
  where voter=voter_name and tag='fork';
  if contribution <> 1 then raise exception 'Same user counted twice on parent'; end if;
  response := public.cast_rewarded_puzzle_tag_vote(puzzle,voter_name,'fork',0);
  if (response->>'coinDelta')::numeric <> -(first_vote->>'coinDelta')::numeric then
    raise exception 'Parent withdrawal must reverse child reward';
  end if;
  if exists (select 1 from public.effective_puzzle_tag_votes(puzzle)
    where voter=voter_name and tag in ('fork','epaulette_fork')) then
    raise exception 'Parent withdrawal left descendant vote';
  end if;
  response := public.cast_rewarded_puzzle_tag_vote(puzzle,voter_name,'epaulette_fork',1);
  if (response->>'coinDelta')::numeric <> 0 then raise exception 'Vote/unvote/revote farming'; end if;
  perform public.cast_rewarded_puzzle_tag_vote(puzzle,voter_name,'epaulette_fork',0);
  if exists (select 1 from public.effective_puzzle_tag_votes(puzzle)
    where voter=voter_name and tag='fork') then raise exception 'Child withdrawal left implied parent'; end if;

  first_vote := public.cast_rewarded_puzzle_tag_vote(puzzle,voter_name,'endgame',1);
  response := public.cast_rewarded_puzzle_tag_vote(puzzle,voter_name,'pawn_endgame',1);
  if (response->>'coinDelta')::numeric <> 0 then raise exception 'Parent then child rewarded twice'; end if;
  response := public.cast_rewarded_puzzle_tag_vote(puzzle,voter_name,'endgame',0);
  if (response->>'coinDelta')::numeric <> -(first_vote->>'coinDelta')::numeric then
    raise exception 'Parent reward reversal failed';
  end if;
  response := public.cast_rewarded_puzzle_tag_vote(puzzle,voter_name,'endgame',0);
  if (response->>'coinDelta')::numeric <> 0 then raise exception 'Repeated undo deducted twice'; end if;
  perform public.cast_rewarded_puzzle_tag_vote(puzzle,voter_name,'pawn_endgame',1);
  perform public.cast_rewarded_puzzle_tag_vote(puzzle,voter_name,'threading_the_needle',1);
  perform public.cast_rewarded_puzzle_tag_vote(puzzle,voter_name,'pawn_endgame',0);
  if not exists (select 1 from public.effective_puzzle_tag_votes(puzzle)
    where voter=voter_name and tag='endgame' and direction=1) then
    raise exception 'Removing one child erased its sibling contribution';
  end if;
  perform public.cast_rewarded_puzzle_tag_vote(puzzle,voter_name,'endgame',0);
  perform public.cast_rewarded_puzzle_tag_vote(puzzle,voter_name,'pawn_endgame',-1);
  if exists (select 1 from public.effective_puzzle_tag_votes(puzzle)
    where voter=voter_name and tag='endgame') then raise exception 'Child downvote propagated to parent'; end if;
  select balance into final_balance from public.coin_accounts where username=voter_name;
  if final_balance <> initial_balance then raise exception 'Vote cycles changed wallet balance'; end if;

  perform public.apply_coin_transaction(voter_name,0.20::numeric,'puzzle_tagging',
    'rollback-tag-debt:' || txid_current(),jsonb_build_object('puzzleId',puzzle));
  select id into debt_reward_id from public.coin_transactions
  where source_key='rollback-tag-debt:' || txid_current();
  select balance into spent_balance from public.coin_accounts where username=voter_name;
  perform public.apply_coin_transaction(voter_name,-spent_balance,'shop_redemption',
    'rollback-test-spend:' || txid_current());
  perform public.reverse_puzzle_tag_reward(debt_reward_id,'rollback_test');
  perform public.apply_coin_transaction(voter_name,0.20::numeric,'daily_bonus',
    'rollback-test-credit:' || txid_current());
  if not exists (select 1 from public.puzzle_tag_reward_reversals
    where reward_transaction_id=debt_reward_id and recovered=amount) then
    raise exception 'Future credits did not collect spent reward';
  end if;
  if (select balance from public.coin_accounts where username=voter_name) <> 0 then
    raise exception 'Debt collection wallet mismatch';
  end if;
end;
$$;
select 'hierarchy, deduplication, both reward orders, withdrawal reversals, vote cycling, and debt collection passed' as checks;
rollback;
