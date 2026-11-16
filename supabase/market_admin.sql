-- One guarded, auditable transaction for a market result and its tournament updates.
begin;

create table if not exists public.market_admin_resolution_receipts (
  operation_key text primary key,
  actor_username text not null,
  plan jsonb not null,
  result jsonb not null,
  completed_at timestamptz not null default now()
);
alter table public.market_admin_resolution_receipts enable row level security;
revoke all on public.market_admin_resolution_receipts from public,anon,authenticated;
grant select on public.market_admin_resolution_receipts to service_role;

create or replace function public.refresh_atomic_tour_event_entries_for_event(p_event text)
returns void language plpgsql security definer set search_path='' as $$
begin
 delete from public.atomic_tour_event_entries where tournament_id=p_event;
 insert into public.atomic_tour_event_entries(tournament_id,player_name,start_rank,start_points,points_earned)
 with participants as (
  select distinct lower(btrim(player)) player_name
  from public.tournament_matches f cross join lateral (values(f.p1),(f.p2)) players(player)
  where f.tournament=p_event and nullif(btrim(player),'') is not null and lower(btrim(player))<>'bye'
  union select player_name from public.atomic_tour_point_awards where tournament_id=p_event
 ), prior as (
  select a.player_name,sum(a.points)::integer points
  from public.atomic_tour_point_awards a join public.tournament_catalog e on e.id=p_event
  where a.awarded_on<e.start_date and a.expires_on>=e.start_date
   and not exists(select 1 from public.atomic_tour_excluded_players x where x.player_name=a.player_name)
  group by a.player_name having sum(a.points)>0
 ), ranked as (select player_name,points,rank() over(order by points desc)::integer start_rank from prior),
 earned as (select player_name,sum(points)::integer points from public.atomic_tour_point_awards where tournament_id=p_event group by player_name)
 select p_event,p.player_name,r.start_rank,coalesce(r.points,0),coalesce(e.points,0)
 from participants p left join ranked r using(player_name) left join earned e using(player_name)
 where not exists(select 1 from public.atomic_tour_excluded_players x where x.player_name=p.player_name);
end;
$$;
revoke all on function public.refresh_atomic_tour_event_entries_for_event(text) from public,anon,authenticated;
grant execute on function public.refresh_atomic_tour_event_entries_for_event(text) to service_role;

create or replace function public.apply_admin_market_resolution(p_plan jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 operation text:=p_plan->>'operationKey';
 event_id text:=p_plan->>'eventId';
 result jsonb;
 expected jsonb;
 actual jsonb;
 item jsonb;
 change jsonb;
 patch jsonb;
 m public.prediction_markets%rowtype;
 participant record;
 payment record;
 payout numeric(18,6);
 key text;
 message text;
 notification_count integer:=0;
 changed_on date;
 snapshot_day date;
 affected integer;
begin
 if p_plan->>'actor' is distinct from 'seaside_tiramisu' or operation !~ '^market-admin:[a-f0-9]{64}$'
  or jsonb_array_length(p_plan->'expectedMarkets')=0 then raise exception 'Invalid market administration plan'; end if;
 perform pg_advisory_xact_lock(hashtext(operation));
 select r.result into result from public.market_admin_resolution_receipts r where r.operation_key=operation;
 if found then return result; end if;
 if event_id is not null then perform pg_advisory_xact_lock(hashtext('tournament-result:'||event_id)); end if;
 perform pg_advisory_xact_lock(hashtext('prediction-market:'||(x->>'id')))
 from jsonb_array_elements(p_plan->'expectedMarkets') x order by x->>'id';
 if p_plan->'input'->>'kind'='match' and p_plan->'input'->>'outcomeType'<>'withdrawal'
  and nullif(p_plan->'summary'->>'matchId','') is null and not coalesce((p_plan->'input'->>'allowUnlinked')::boolean,false)
 then raise exception 'Select an archived match or explicitly publish without a link'; end if;

 -- These rows are the exact state used for the preview. Trading locks prevent a
 -- fill from changing the payout after this check and before settlement.
 for expected in select value from jsonb_array_elements(p_plan->'expectedMarkets') loop
  select * into m from public.prediction_markets where id=expected->>'id' for update;
  if to_jsonb(m) is distinct from expected or m.status not in('open','closed') then raise exception 'Market changed; refresh the preview'; end if;
 end loop;
 select coalesce(jsonb_agg(to_jsonb(p) order by p.market_id,p.username,p.outcome),'[]'::jsonb) into actual
 from public.prediction_positions p where p.market_id in(select x->>'id' from jsonb_array_elements(p_plan->'expectedMarkets') x);
 select coalesce(jsonb_agg(x order by x->>'market_id',x->>'username',x->>'outcome'),'[]'::jsonb) into expected from jsonb_array_elements(p_plan->'expectedPositions') x;
 if actual is distinct from expected then raise exception 'Positions changed; refresh the preview'; end if;

 create temp table if not exists market_admin_wallets(username text primary key,balance numeric) on commit drop;
 truncate pg_temp.market_admin_wallets;
 insert into pg_temp.market_admin_wallets select a.username,a.balance from public.coin_accounts a
 where a.username in(select x->>'username' from jsonb_array_elements(p_plan->'expectedPayments') x)
 order by a.username for update;
 if (select count(*) from pg_temp.market_admin_wallets)<>jsonb_array_length(p_plan->'expectedPayments') then raise exception 'Settlement wallet missing'; end if;

 if event_id is not null then
  perform 1 from public.tournament_matches where tournament=event_id order by id for update;
  select coalesce(jsonb_agg(to_jsonb(f) order by f.id),'[]'::jsonb) into actual from public.tournament_matches f where tournament=event_id;
  select coalesce(jsonb_agg(x order by x->>'id'),'[]'::jsonb) into expected from jsonb_array_elements(p_plan->'expectedFixtures') x;
  if actual is distinct from expected then raise exception 'Bracket changed; refresh the preview'; end if;
  lock table public.atomic_tour_point_awards in share row exclusive mode;
  perform pg_advisory_xact_lock(hashtext('atomic-tour-ranking-refresh'));
  select coalesce(jsonb_agg(to_jsonb(a) order by a.award_key),'[]'::jsonb) into actual from (
   select award_key,tournament_id,player_name,source_type,source_key,awarded_on,expires_on,points,description
   from public.atomic_tour_point_awards where tournament_id=event_id
  ) a;
  select coalesce(jsonb_agg(x order by x->>'award_key'),'[]'::jsonb) into expected from jsonb_array_elements(p_plan->'expectedAwards') x;
  if actual is distinct from expected then raise exception 'Atomic Tour awards changed; refresh the preview'; end if;
  for change in select value from jsonb_array_elements(p_plan->'fixtureChanges') loop
   if change->>'tournament'<>event_id then raise exception 'Invalid bracket change'; end if;
   patch:=change->'patch';
   update public.tournament_matches set
    p1=case when patch?'p1' then patch->>'p1' else p1 end,
    p2=case when patch?'p2' then patch->>'p2' else p2 end,
    s1=case when patch?'s1' then (patch->>'s1')::numeric else s1 end,
    s2=case when patch?'s2' then (patch->>'s2')::numeric else s2 end,
    match_id=case when patch?'match_id' then patch->>'match_id' else match_id end,
    played_on=case when patch?'played_on' then nullif(patch->>'played_on','')::date else played_on end,
    outcome_type=case when patch?'outcome_type' then nullif(patch->>'outcome_type','') else outcome_type end
   where tournament=event_id and id=change->>'id';
   get diagnostics affected=row_count;
   if affected<>1 then raise exception 'Bracket destination missing'; end if;
  end loop;
  select min(changed_day) into changed_on from (
   select (a->>'awarded_on')::date as changed_day from jsonb_array_elements(p_plan->'expectedAwards') a
   where not exists(select 1 from jsonb_array_elements(p_plan->'awards') b where a=b)
   union all
   select (a->>'awarded_on')::date from jsonb_array_elements(p_plan->'awards') a
   where not exists(select 1 from jsonb_array_elements(p_plan->'expectedAwards') b where a=b)
  ) d;
  delete from public.atomic_tour_point_awards where tournament_id=event_id;
  insert into public.atomic_tour_point_awards(award_key,tournament_id,player_name,source_type,source_key,awarded_on,expires_on,points,description)
   select award_key,tournament_id,player_name,source_type,source_key,awarded_on,expires_on,points,description
   from jsonb_populate_recordset(null::public.atomic_tour_point_awards,p_plan->'awards');
  if exists(select 1 from jsonb_array_elements(p_plan->'awards') a where a->>'tournament_id'<>event_id) then raise exception 'Cross-event award change'; end if;
  for snapshot_day in select distinct snapshot_day_value from (
   select current_date as snapshot_day_value union all
   select snapshot_date from public.atomic_tour_ranking_snapshots where snapshot_date>=changed_on and snapshot_date<=current_date
  ) d order by snapshot_day_value loop perform public.refresh_atomic_tour_ranking(snapshot_day); end loop;
  perform public.refresh_atomic_tour_event_entries_for_event(event_id);
  select coalesce(jsonb_agg(to_jsonb(a) order by a.award_key),'[]'::jsonb) into actual from (
   select award_key,tournament_id,player_name,source_type,source_key,awarded_on,expires_on,points,description
   from public.atomic_tour_point_awards where tournament_id=event_id
  ) a;
  select coalesce(jsonb_agg(x order by x->>'award_key'),'[]'::jsonb) into expected from jsonb_array_elements(p_plan->'awards') x;
  if actual is distinct from expected then raise exception 'Atomic Tour award verification failed'; end if;
  if exists(select 1 from public.atomic_tour_event_entries e where e.tournament_id=event_id and
   e.points_earned<>(select coalesce(sum(a.points),0) from public.atomic_tour_point_awards a where a.tournament_id=event_id and a.player_name=e.player_name))
  then raise exception 'Atomic Tour event totals verification failed'; end if;
 end if;

 for item in select value from jsonb_array_elements(p_plan->'settlements') loop
  if item->>'method'='binary' then perform public.resolve_prediction_market(item->>'id',item->>'outcome');
  elsif item->>'method'='price' then perform public.resolve_prediction_market_at_price(item->>'id',(item->>'referenceFillId')::bigint);
  elsif item->>'method'='refund' then
   if exists(select 1 from public.prediction_fills where market_id=item->>'id') then raise exception 'Traded market requires fair-price settlement'; end if;
   perform public.cancel_prediction_market_orders(item->>'id');
   for payment in select * from jsonb_to_recordset(item->'refunds') as r(username text,amount numeric) loop
    if payment.amount<0 then raise exception 'Invalid refund'; end if;
    if payment.amount>0 then perform public.apply_coin_transaction(payment.username,payment.amount,'prediction_order_refund',
     'prediction-market-refund:'||(item->>'id')||':'||payment.username,
     jsonb_build_object('marketId',item->>'id','kind','market-refund')); end if;
   end loop;
   update public.prediction_markets set status='refunded',outcome=null,settlement_price_cents=null,settlement_reference_fill_id=null,
    resolved_at=now(),updated_at=now() where id=item->>'id';
  else raise exception 'Unsupported settlement method'; end if;
 end loop;

 for payment in select * from jsonb_to_recordset(p_plan->'expectedPayments') as p(username text,amount numeric) loop
  if payment.amount<0 or abs((select a.balance-b.balance from public.coin_accounts a join pg_temp.market_admin_wallets b using(username)
    where a.username=payment.username)-payment.amount)>0.000001 then raise exception 'Settlement payout verification failed for %',payment.username; end if;
 end loop;

 for item in select value from jsonb_array_elements(p_plan->'settlements') loop
  select * into m from public.prediction_markets where id=item->>'id';
  if (item->>'method'='refund' and m.status<>'refunded') or (item->>'method'<>'refund' and m.status<>'resolved') then raise exception 'Market resolution failed'; end if;
  if item->>'method'='binary' and m.outcome is distinct from item->>'outcome' then raise exception 'Incorrect market outcome'; end if;
  if exists(select 1 from public.prediction_orders where market_id=m.id and status in('open','partial') and remaining_quantity>0)
   then raise exception 'Open orders survived settlement'; end if;
  for participant in select distinct username from (
    select username from public.prediction_positions where market_id=m.id and quantity>0
    union select buyer_username from public.prediction_fills where market_id=m.id
    union select seller_username from public.prediction_fills where market_id=m.id and seller_username is not null
    union select username from public.prediction_position_credits where market_id=m.id
   ) users where username<>'prediction_admin' order by username loop
   select coalesce(sum(t.amount),0) into payout from public.coin_transactions t where t.username=participant.username and (
    (t.reason='prediction_market_payout' and t.metadata->>'marketId'=m.id)
    or (t.reason='prediction_order_refund' and t.source_key='prediction-market-refund:'||m.id||':'||participant.username)
   );
   message:=upper(left(item->>'message',1))||substr(item->>'message',2)||case when payout>0
    then ' +'||case when round(payout,2)=trunc(round(payout,2)) then to_char(round(payout,2),'FM999,999,999,990')
     else to_char(round(payout,2),'FM999,999,999,990.00') end||' coins' else ' No payout' end;
   key:='prediction-market-payout:tournament:'||m.id||':'||participant.username;
   update public.notifications set feature_message=message,feature_path=coalesce(nullif(m.group_path,''),'/betting')
    where recipient_username=participant.username and notification_type='feature' and feature_key=key;
   if not found then insert into public.notifications(recipient_username,notification_type,feature_key,feature_message,feature_path)
    values(participant.username,'feature',key,message,coalesce(nullif(m.group_path,''),'/betting')); end if;
   if (select count(*) from public.notifications where recipient_username=participant.username and notification_type='feature' and feature_key=key and feature_message=message)<>1
    then raise exception 'Resolution notification verification failed'; end if;
   notification_count:=notification_count+1;
  end loop;
 end loop;
 if notification_count<>(p_plan->'summary'->>'notificationCount')::integer then raise exception 'Resolution notification recipients changed'; end if;
 result:=jsonb_build_object('operationKey',operation,'summary',p_plan->'summary','completedAt',now());
 insert into public.market_admin_resolution_receipts(operation_key,actor_username,plan,result)
 values(operation,p_plan->>'actor',p_plan,result);
 return result;
end;
$$;
revoke all on function public.apply_admin_market_resolution(jsonb) from public,anon,authenticated;
grant execute on function public.apply_admin_market_resolution(jsonb) to service_role;
notify pgrst,'reload schema';
commit;
