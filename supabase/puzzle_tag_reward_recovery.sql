-- Recovery for the 2026-11-08 tag reward audit: four ledger entries, 0.85 coins.
-- Original awards and vote events remain intact. Reversals are idempotent.
-- Run in the current database through Firefox's SQL editor, after the hierarchy migration.
begin;
create temporary table tag_reward_recovery_candidates on commit drop as
with rewards as (
 select t.*, e.id as event_id, e.direction as original_direction
 from public.coin_transactions t
 left join lateral (
   select e.id,e.direction from public.puzzle_tag_vote_events e
   where e.puzzle_id=(t.metadata->>'puzzleId')::bigint
     and e.tag=t.metadata->>'tag' and e.voter=t.username
     and e.direction<>0 and e.occurred_at>=t.created_at
   order by e.id limit 1
 ) e on true
 where t.reason='puzzle_tagging' and t.amount>0
), candidates as (
 select t.*, exists (
   select 1 from public.puzzle_tag_vote_events e
   where e.puzzle_id=(t.metadata->>'puzzleId')::bigint
     and e.voter=t.username and e.tag=t.metadata->>'tag'
     and e.id>t.event_id and e.direction<>t.original_direction
 ) as withdrawn,
 exists (
   select 1 from public.puzzle_tag_vote_events e
   where e.puzzle_id=(t.metadata->>'puzzleId')::bigint
     and e.voter=t.username and e.tag<>t.metadata->>'tag'
     and e.id<t.event_id and e.direction=1
     and (e.tag=any(public.puzzle_tag_ancestors(t.metadata->>'tag'))
       or t.metadata->>'tag'=any(public.puzzle_tag_ancestors(e.tag)))
     and not exists (select 1 from public.puzzle_tag_vote_events later
       where later.puzzle_id=e.puzzle_id and later.voter=e.voter and later.tag=e.tag
         and later.id>e.id and later.id<t.event_id)
 ) as related_duplicate
 from rewards t
)
select t.id,t.username,t.amount,t.metadata,t.event_id,t.withdrawn,t.related_duplicate,a.balance
from candidates t join public.coin_accounts a on a.username=t.username
where (t.withdrawn or t.related_duplicate) and t.id in (29057,29175,29237,29265) order by t.id;

do $$
declare target record;
begin
  if (select count(*) from tag_reward_recovery_candidates) <> 4
    or (select sum(amount) from tag_reward_recovery_candidates) <> 0.85 then
    raise exception 'Historical audit no longer matches the four reviewed rewards';
  end if;
  for target in select * from tag_reward_recovery_candidates order by username,id loop
    perform public.reverse_puzzle_tag_reward(target.id,
      case when target.withdrawn then 'historical_vote_removed' else 'historical_related_tag_duplicate' end);
  end loop;
end;
$$;

select c.username, count(*) as rewards_reversed, sum(c.amount) as expected,
  sum(r.recovered) as recovered, sum(r.amount-r.recovered) as outstanding
from tag_reward_recovery_candidates c
join public.puzzle_tag_reward_reversals r on r.reward_transaction_id=c.id
 group by c.username order by c.username;
commit;
