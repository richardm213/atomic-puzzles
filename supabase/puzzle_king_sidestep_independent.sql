-- Apply in Firefox on the current database. Preserve unrelated tags, votes, and coin receipts.
begin;
set local lock_timeout='5s';
update public.puzzle_tag_hierarchy set parent_tag='defensive'where tag='king_sidestep';
do $$
declare puzzle record; expected text[];
begin
 if not exists(select 1 from public.puzzle_tag_hierarchy where tag='king_sidestep'and parent_tag='defensive')then
  raise exception 'King sidestep hierarchy is missing';
 end if;
 for puzzle in select id,tags from public.puzzles where deleted_at is null and 'king_sidestep'=any(tags)order by id for update loop
  expected:=array_remove(puzzle.tags,'king_walk');
  -- A moderation vote keeps existing user votes intact while removing the visible tag.
  perform public.cast_puzzle_tag_vote(puzzle.id,'admin','king_walk',-1);
  if not exists(select 1 from public.puzzles p where p.id=puzzle.id and expected<@p.tags and not('king_walk'=any(p.tags)))then
   raise exception 'King walk removal failed or removed another tag on puzzle %',puzzle.id;
  end if;
 end loop;
end $$;
commit;
select jsonb_build_object('committed',true,'sidestep_puzzles',count(*),
'walk_overlap',count(*)filter(where 'king_walk'=any(tags)),
'ancestors',public.puzzle_tag_ancestors('king_sidestep'))as verification
from public.puzzles where deleted_at is null and 'king_sidestep'=any(tags);
