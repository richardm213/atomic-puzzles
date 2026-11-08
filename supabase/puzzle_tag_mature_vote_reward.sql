-- Deploy the API support for a 0.01 award before applying this migration.
-- The RPC already measures the weighted net score before voting under its puzzle lock.
do $$
declare
  reward_rpc constant regprocedure :=
    'public.cast_rewarded_puzzle_tag_vote(bigint,text,text,integer)'::regprocedure;
  rpc_definition text := pg_get_functiondef(reward_rpc);
  old_reward constant text := 'if previous_net > 0 then[[:space:]]+reward := 0[.]10;';
  new_reward constant text :=
    E'if previous_net > 0 then\n      reward := case when previous_net >= 6 then 0.01 else 0.10 end;';
begin
  if strpos(rpc_definition, new_reward) > 0 then
    return;
  end if;
  if rpc_definition !~ old_reward then
    raise exception 'Unexpected puzzle tag reward RPC; could not update the visible-tag reward';
  end if;
  execute regexp_replace(rpc_definition, old_reward, new_reward);
end;
$$;
