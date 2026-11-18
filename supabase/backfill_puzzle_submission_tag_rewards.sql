-- Run in Firefox on the current database after puzzle_submission_tag_rewards.sql.
-- Defaults to today in Los Angeles. Optional transaction-local settings:
-- app.submission_tag_credit_date: YYYY-MM-DD
-- app.submission_tag_recovery: optional exact published-puzzle recovery records.
-- app.submission_tag_queue_snapshots: saved pre-review rows (queue_id,fen,solution,author,tags).
-- Original tags come from votes inserted in the creation receipt's transaction,
-- never from tags other users happened to add later. Repeated runs pay nothing twice.
begin;

create temporary table submission_tag_recovery on commit drop as
select * from jsonb_to_recordset(coalesce(
  nullif(current_setting('app.submission_tag_recovery',true),''),'[]')::jsonb)
as recovered(id bigint,fen text,solution text,author text,tags text[],queue_id bigint);

create temporary table original_queued_tag_snapshots on commit drop as
select * from jsonb_to_recordset(coalesce(
  nullif(current_setting('app.submission_tag_queue_snapshots',true),''),'[]')::jsonb)
as original(queue_id bigint,fen text,solution text,author text,tags text[]);

-- Preserve known original input for pending rows without trusting the current
-- reviewer-edited tag list. New submissions already capture this at insertion.
update public.puzzles_queue q set submitted_tags=original.tags
from original_queued_tag_snapshots original
where q.id=original.queue_id and q.fen=original.fen and q.solution=original.solution
  and q.author=original.author and q.submitted_tags is null;

-- Also find rows approved since the preview was prepared. Require a unique
-- original tag list for the same creator, position and solution.
with matched as (
  select p.id,p.fen,p.solution,p.author,original.tags,original.queue_id
  from public.puzzles p join original_queued_tag_snapshots original
    on p.author=original.author
    and (string_to_array(btrim(p.fen),' '))[1:4]
      =(string_to_array(btrim(original.fen),' '))[1:4]
    and rtrim(regexp_replace(p.solution,'[[:space:]]','','g'),'*')
      =rtrim(regexp_replace(original.solution,'[[:space:]]','','g'),'*')
  where p.deleted_at is null
    and (p.created_at at time zone 'America/Los_Angeles')::date=coalesce(
      nullif(current_setting('app.submission_tag_credit_date',true),'')::date,
      (current_timestamp at time zone 'America/Los_Angeles')::date)
), certain as (
  select id from matched group by id having count(distinct tags)=1
)
insert into submission_tag_recovery
select distinct on (m.id) m.id,m.fen,m.solution,m.author,m.tags,m.queue_id
from matched m join certain using(id)
where not exists(select 1 from submission_tag_recovery r where r.id=m.id)
order by m.id,m.queue_id;

do $$
begin
  if exists (
    select 1 from submission_tag_recovery r
    left join public.puzzles p on p.id=r.id and p.fen=r.fen and p.solution=r.solution
      and p.author=r.author and p.deleted_at is null
    where p.id is null or r.tags is null or exists (
      select 1 from unnest(r.tags) supplied(tag)
      where not exists (select 1 from public.puzzle_tag_hierarchy h where h.tag=supplied.tag))
  ) then raise exception 'Recovered submission does not match the current puzzle'; end if;
end;
$$;

-- Older approval code dropped queued tags. Restore only an exact saved submission
-- whose published tags are still empty, and only inside the selected day.
-- Normalize legacy NULL tags first: the existing tag-sync trigger compares
-- against OLD.tags and cannot add votes through SQL's NULL array comparisons.
update public.puzzles p set tags='{}'::text[]
from submission_tag_recovery r
where p.id=r.id and p.fen=r.fen and p.solution=r.solution and p.author=r.author
  and p.deleted_at is null and p.tags is null
  and (p.created_at at time zone 'America/Los_Angeles')::date=coalesce(
    nullif(current_setting('app.submission_tag_credit_date',true),'')::date,
    (current_timestamp at time zone 'America/Los_Angeles')::date);

update public.puzzles p set tags=r.tags
from submission_tag_recovery r
where p.id=r.id and p.fen=r.fen and p.solution=r.solution and p.author=r.author
  and p.deleted_at is null and coalesce(cardinality(p.tags),0)=0
  and (p.created_at at time zone 'America/Los_Angeles')::date=coalesce(
    nullif(current_setting('app.submission_tag_credit_date',true),'')::date,
    (current_timestamp at time zone 'America/Los_Angeles')::date);

create temporary table submission_tag_credit_results on commit drop as
select p.id,p.author,
  public.credit_puzzle_submission_tags(p.id,coalesce(recovered.tags,
    (select array_agg(seed.tag order by seed.first_seen,seed.tag) from (
      select e.tag,min(e.occurred_at) first_seen
      from public.puzzle_tag_vote_events e
      where e.puzzle_id=p.id and e.voter='seaside_tiramisu' and e.direction=1
        and e.xmin::text=creation.xmin::text
      group by e.tag
    )seed),'{}'::text[])) as credited
from public.puzzles p join public.coin_transactions creation
  on creation.source_key='puzzle:'||p.id and creation.reason='puzzle_created'
  and creation.username=lower(btrim(p.author))
left join submission_tag_recovery recovered on recovered.id=p.id
where p.deleted_at is null
  and (p.created_at at time zone 'America/Los_Angeles')::date=coalesce(
    nullif(current_setting('app.submission_tag_credit_date',true),'')::date,
    (current_timestamp at time zone 'America/Los_Angeles')::date)
order by p.id;

select jsonb_build_object(
  'date',coalesce(nullif(current_setting('app.submission_tag_credit_date',true),''),
    ((current_timestamp at time zone 'America/Los_Angeles')::date)::text),
  'puzzles_processed',count(*),'puzzles_credited',count(*)filter(where credited>0),
  'coins_credited',coalesce(sum(credited),0),
  'credits',coalesce(jsonb_agg(jsonb_build_object('puzzle_id',id,'author',author,
    'coins',credited))filter(where credited>0),'[]'::jsonb)
) as submission_tag_credit_summary
from submission_tag_credit_results;

commit;
