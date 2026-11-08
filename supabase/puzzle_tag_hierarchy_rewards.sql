-- Hierarchical tag votes and reversible, once-per-related-tag rewards.
-- Apply through Firefox against the current database. Existing vote rows remain explicit votes.
begin;

create table if not exists public.puzzle_tag_hierarchy (
  tag text primary key,
  parent_tag text references public.puzzle_tag_hierarchy(tag)
);
alter table public.puzzle_tag_hierarchy enable row level security;
revoke all on public.puzzle_tag_hierarchy from public, anon, authenticated;
insert into public.puzzle_tag_hierarchy (tag, parent_tag) values
  ('advanced_pawn', null),
  ('queen_angles', null),
  ('coercion', null),
  ('diagonal_clearance', null),
  ('file_clearance', null),
  ('square_clearance', null),
  ('fork', null),
  ('epaulette_fork', 'fork'),
  ('zwischenzug', null),
  ('knight_invasion', null),
  ('bishop_invasion', null),
  ('rook_invasion', null),
  ('castling_rook_invasion', 'rook_invasion'),
  ('trident', null),
  ('sacrifice', null),
  ('defensive', null),
  ('prophylaxis', 'defensive'),
  ('prevent_invasion', 'defensive'),
  ('prevent_knight_invasion', 'prevent_invasion'),
  ('prevent_rook_invasion', 'prevent_invasion'),
  ('prevent_queen_invasion', 'prevent_invasion'),
  ('prevent_bishop_invasion', 'prevent_invasion'),
  ('material', null),
  ('draw', null),
  ('blocking', 'defensive'),
  ('king_walk', 'defensive'),
  ('avoiding_perpetual', 'defensive'),
  ('pin', null),
  ('unpinning', null),
  ('tempo', null),
  ('discovered_mate', null),
  ('rook_mate', null),
  ('bishop_knight_mate', null),
  ('king_blockade', null),
  ('square', null),
  ('explosion_mate_threat', null),
  ('exposed_king', null),
  ('explosion_defense', 'defensive'),
  ('development', null),
  ('stuck_pawn', null),
  ('stuck_piece', null),
  ('endgame', null),
  ('threading_the_needle', 'endgame'),
  ('pawn_endgame', 'endgame')
on conflict (tag) do update set parent_tag = excluded.parent_tag;

create or replace function public.puzzle_tag_ancestors(p_tag text)
returns text[] language sql stable security definer set search_path = '' as $$
  with recursive ancestors as (
    select tag, parent_tag from public.puzzle_tag_hierarchy where tag = p_tag
    union all
    select h.tag, h.parent_tag from public.puzzle_tag_hierarchy h
    join ancestors a on h.tag = a.parent_tag
  ) select coalesce(array_agg(tag), '{}'::text[]) from ancestors;
$$;

-- An explicit parent and multiple children still contribute only one vote per user.
-- Downvotes stay specific: rejecting a subcategory does not reject its broader category.
create or replace function public.effective_puzzle_tag_votes(p_puzzle_id bigint)
returns table(tag text, voter text, direction integer)
language sql stable security definer set search_path = '' as $$
  select expanded.tag, v.voter, max(v.direction)::integer
  from public.puzzle_tag_votes v
  cross join lateral unnest(case when v.direction = 1
    then public.puzzle_tag_ancestors(v.tag) else array[v.tag] end) expanded(tag)
  where v.puzzle_id = p_puzzle_id
  group by expanded.tag, v.voter;
$$;

create or replace function public.get_puzzle_tag_votes(p_puzzle_id bigint, p_voter text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select (
    select coalesce(jsonb_agg(to_jsonb(tally) order by tally.tag), '[]'::jsonb)
    from (
      select tag,
        coalesce(sum(public.puzzle_tag_vote_weight(voter)) filter (where direction = 1), 0) as up,
        coalesce(sum(public.puzzle_tag_vote_weight(voter)) filter (where direction = -1), 0) as down,
        coalesce(max(direction) filter (where voter = p_voter), 0) as vote
      from public.effective_puzzle_tag_votes(p_puzzle_id) group by tag
    ) tally
  ) from public.puzzles where id = p_puzzle_id and deleted_at is null;
$$;

create or replace function public.visible_puzzle_tag_votes(p_puzzle_id bigint, p_preferred text[])
returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(tag order by array_position(p_preferred, tag) nulls last, tag), '{}'::text[])
  from (
    select tag from public.effective_puzzle_tag_votes(p_puzzle_id)
    group by tag having sum(direction * public.puzzle_tag_vote_weight(voter)) > 0
  ) visible;
$$;

create table if not exists public.puzzle_tag_reward_reversals (
  reward_transaction_id bigint primary key references public.coin_transactions(id),
  cause text not null,
  amount numeric(18,6) not null check (amount > 0),
  recovered numeric(18,6) not null default 0 check (recovered >= 0 and recovered <= amount),
  created_at timestamptz not null default now()
);
alter table public.puzzle_tag_reward_reversals enable row level security;
revoke all on public.puzzle_tag_reward_reversals from public, anon, authenticated;

-- Append compensating entries rather than rewriting the original coin ledger.
-- A spent balance cannot go negative; the unrecovered amount stays recorded for later collection.
create or replace function public.reverse_puzzle_tag_reward(p_transaction_id bigint, p_cause text)
returns numeric language plpgsql security definer set search_path = '' as $$
declare
  reward public.coin_transactions%rowtype;
  reversal public.puzzle_tag_reward_reversals%rowtype;
  wallet numeric;
  deduction numeric;
begin
  select * into reward from public.coin_transactions
  where id = p_transaction_id and reason = 'puzzle_tagging' and amount > 0;
  if not found then raise exception 'Tag reward not found'; end if;
  select balance into wallet from public.coin_accounts where username = reward.username for update;
  insert into public.puzzle_tag_reward_reversals (reward_transaction_id, cause, amount)
  values (reward.id, p_cause, reward.amount) on conflict do nothing;
  select * into reversal from public.puzzle_tag_reward_reversals
  where reward_transaction_id = reward.id for update;
  deduction := least(coalesce(wallet, 0), reversal.amount - reversal.recovered);
  if deduction > 0 then
    insert into public.coin_transactions (username, amount, reason, source_key, metadata)
    values (reward.username, -deduction, 'puzzle_tagging',
      format('puzzle-tag-reversal:%s:%s', reward.id, reversal.recovered),
      jsonb_build_object('puzzleId', reward.metadata->'puzzleId', 'action', 'reward_reversed',
        'rewardTransactionId', reward.id, 'cause', reversal.cause));
    update public.coin_accounts set balance = balance - deduction, updated_at = now()
    where username = reward.username;
    update public.puzzle_tag_reward_reversals set recovered = recovered + deduction
    where reward_transaction_id = reward.id;
  end if;
  return deduction;
end;
$$;

-- Collect any spent reward from future credits without allowing a negative wallet.
create or replace function public.settle_puzzle_tag_reward_debt()
returns trigger language plpgsql security definer set search_path = '' as $$
declare pending record;
begin
  for pending in
    select r.reward_transaction_id, r.cause
    from public.puzzle_tag_reward_reversals r
    join public.coin_transactions t on t.id = r.reward_transaction_id
    where t.username = new.username and r.recovered < r.amount
    order by t.id
  loop
    perform public.reverse_puzzle_tag_reward(pending.reward_transaction_id, pending.cause);
  end loop;
  return null;
end;
$$;
drop trigger if exists settle_puzzle_tag_reward_debt on public.coin_accounts;
create trigger settle_puzzle_tag_reward_debt
  after update of balance on public.coin_accounts
  for each row when (new.balance > old.balance)
  execute function public.settle_puzzle_tag_reward_debt();

-- Row-level writes (including the protected editor) revoke rewards for removed or changed votes.
create or replace function public.reverse_removed_puzzle_tag_reward()
returns trigger language plpgsql security definer set search_path = '' as $$
declare reward_id bigint;
begin
  if tg_op = 'UPDATE' and new.direction = old.direction then return null; end if;
  select id into reward_id from public.coin_transactions
  where reason = 'puzzle_tagging' and amount > 0
    and username = old.voter
    and source_key = format('puzzle-tagging:%s:%s:%s', old.puzzle_id, old.tag, old.voter);
  if reward_id is not null then
    perform public.reverse_puzzle_tag_reward(reward_id, 'vote_removed');
  end if;
  return null;
end;
$$;
drop trigger if exists reverse_removed_puzzle_tag_reward on public.puzzle_tag_votes;
create trigger reverse_removed_puzzle_tag_reward
  after delete or update of direction on public.puzzle_tag_votes
  for each row execute function public.reverse_removed_puzzle_tag_reward();

create or replace function public.cast_puzzle_tag_vote(
  p_puzzle_id bigint, p_voter text, p_tag text, p_vote integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_tags text[]; next_tags text[];
begin
  if coalesce(p_voter, '') = '' or p_voter <> lower(btrim(p_voter))
    or p_vote is null or p_vote not in (-1,0,1)
    or not exists (select 1 from public.puzzle_tag_hierarchy where tag = p_tag)
  then raise exception 'Invalid puzzle tag vote'; end if;
  select tags into current_tags from public.puzzles
  where id = p_puzzle_id and deleted_at is null for update;
  if not found then return null; end if;

  if p_vote in (0,-1) then
    delete from public.puzzle_tag_votes
    where puzzle_id = p_puzzle_id and voter = p_voter
      and p_tag = any(public.puzzle_tag_ancestors(tag))
      and (p_vote = 0 or tag <> p_tag);
  end if;
  if p_vote = 1 then
    delete from public.puzzle_tag_votes
    where puzzle_id = p_puzzle_id and voter = p_voter and direction = -1
      and tag = any(public.puzzle_tag_ancestors(p_tag));
  end if;
  if p_vote <> 0 then
    insert into public.puzzle_tag_votes (puzzle_id, tag, voter, direction)
    values (p_puzzle_id, p_tag, p_voter, p_vote)
    on conflict (puzzle_id, tag, voter) do update set direction = excluded.direction;
  end if;
  next_tags := public.visible_puzzle_tag_votes(p_puzzle_id, current_tags);
  if next_tags is distinct from current_tags then
    update public.puzzles set tags = next_tags where id = p_puzzle_id;
  end if;
  return public.get_puzzle_tag_votes(p_puzzle_id, p_voter);
end;
$$;

create or replace function public.cast_rewarded_puzzle_tag_vote(
  p_puzzle_id bigint, p_voter text, p_tag text, p_vote integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  previous_net bigint;
  existing_tag_count integer;
  reward numeric := 0;
  reward_action text;
  votes jsonb;
  wallet_before numeric;
  wallet_after numeric;
  pending record;
begin
  select cardinality(tags) into existing_tag_count from public.puzzles
  where id = p_puzzle_id and deleted_at is null for update;
  if not found then return null; end if;
  -- Serialize this user's rewards on different puzzles as well as their wallet deductions.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('puzzle-tag-wallet:' || p_voter, 0));
  select balance into wallet_before from public.coin_accounts where username = p_voter for update;

  if p_vote in (-1,1) and not exists (
    select 1 from public.puzzle_tag_vote_history h
    where h.puzzle_id = p_puzzle_id and h.voter = p_voter
      and (h.tag = any(public.puzzle_tag_ancestors(p_tag))
        or p_tag = any(public.puzzle_tag_ancestors(h.tag)))
  ) and not public.is_coin_economy_banned(p_voter) then
    select coalesce(sum(direction * public.puzzle_tag_vote_weight(voter)),0) into previous_net
    from public.effective_puzzle_tag_votes(p_puzzle_id) where tag = p_tag;
    if previous_net > 0 then
      reward := 0.10;
      reward_action := case when p_vote = 1 then 'upvoted' else 'downvoted' end;
    elsif p_vote = 1 and previous_net + public.puzzle_tag_vote_weight(p_voter) > 0
      and not exists (select 1 from public.puzzle_tag_vote_history
        where puzzle_id = p_puzzle_id and tag = p_tag and has_upvoted) then
      reward := case when existing_tag_count >= 2 then 0.10 else 0.20 end;
      reward_action := 'proposed';
    end if;
    if reward > 0 and not exists (select 1 from public.puzzle_progress
      where username = p_voter and puzzle_id = p_puzzle_id::text) then
      raise exception using errcode = 'PT409', message = 'Tag reward requires a saved puzzle attempt';
    end if;
  end if;

  votes := public.cast_puzzle_tag_vote(p_puzzle_id, p_voter, p_tag, p_vote);
  if reward > 0 then
    perform public.apply_coin_transaction(p_voter, reward, 'puzzle_tagging',
      format('puzzle-tagging:%s:%s:%s', p_puzzle_id, p_tag, p_voter),
      jsonb_build_object('puzzleId', p_puzzle_id, 'tag', p_tag, 'action', reward_action));
  end if;
  for pending in
    select r.reward_transaction_id, r.cause from public.puzzle_tag_reward_reversals r
    join public.coin_transactions t on t.id = r.reward_transaction_id
    where t.username = p_voter and r.recovered < r.amount order by t.id
  loop
    perform public.reverse_puzzle_tag_reward(pending.reward_transaction_id, pending.cause);
  end loop;
  select balance into wallet_after from public.coin_accounts where username = p_voter;
  return jsonb_build_object('votes', votes,
    'coinAward', greatest(0, coalesce(wallet_after,0) - coalesce(wallet_before,0)),
    'coinDelta', coalesce(wallet_after,0) - coalesce(wallet_before,0));
end;
$$;

revoke all on function public.puzzle_tag_ancestors(text),
  public.effective_puzzle_tag_votes(bigint), public.reverse_puzzle_tag_reward(bigint,text),
  public.settle_puzzle_tag_reward_debt(),
  public.reverse_removed_puzzle_tag_reward(), public.cast_puzzle_tag_vote(bigint,text,text,integer),
  public.cast_rewarded_puzzle_tag_vote(bigint,text,text,integer), public.get_puzzle_tag_votes(bigint,text),
  public.visible_puzzle_tag_votes(bigint,text[]) from public, anon, authenticated;
grant execute on function public.cast_rewarded_puzzle_tag_vote(bigint,text,text,integer),
  public.get_puzzle_tag_votes(bigint,text) to service_role;

-- Materialize ancestor tags for catalog filtering. The sync trigger recognizes these as derived.
update public.puzzles p set tags = public.visible_puzzle_tag_votes(p.id, p.tags)
where p.deleted_at is null and coalesce(p.tags, '{}'::text[]) is distinct from public.visible_puzzle_tag_votes(p.id, p.tags);
notify pgrst, 'reload schema';
commit;
