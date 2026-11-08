-- Apply after deploying API clients that accept a 0.20 reward.
-- Keep the existing eligibility, first-vote history, and transaction behavior.
do $$
declare
  reward_rpc constant regprocedure :=
    'public.cast_rewarded_puzzle_tag_vote(bigint,text,text,integer)'::regprocedure;
  rpc_definition text := pg_get_functiondef(reward_rpc);
  puzzle_lock constant text := 'perform 1 from public.puzzles';
  proposal_amount constant text := 'reward := 0.25;';
  next_amount constant text :=
    'reward := case when existing_tag_count >= 2 then 0.10 else 0.20 end;';
begin
  if strpos(rpc_definition, next_amount) > 0 then
    return;
  end if;
  if strpos(rpc_definition, 'previous_net bigint;') = 0
    or strpos(rpc_definition, puzzle_lock) = 0
    or strpos(rpc_definition, proposal_amount) = 0 then
    raise exception 'Unexpected puzzle tag reward RPC; could not update reward amounts';
  end if;

  -- Capture visible tags before casting the vote, under the existing puzzle row lock.
  rpc_definition := replace(rpc_definition, 'previous_net bigint;',
    E'previous_net bigint;\n  existing_tag_count integer;');
  rpc_definition := replace(rpc_definition, puzzle_lock,
    'select cardinality(tags) into existing_tag_count from public.puzzles');
  execute replace(rpc_definition, proposal_amount, next_amount);
end;
$$;
