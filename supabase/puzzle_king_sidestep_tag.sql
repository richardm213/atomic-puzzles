-- Apply in Firefox on the current database. Preserve the existing allowed tags.
begin;
insert into public.puzzle_tag_hierarchy (tag, parent_tag)
values ('king_sidestep', 'king_walk')
on conflict (tag) do update set parent_tag = excluded.parent_tag;

do $$
declare
  current_definition text;
  updated_definition text;
begin
  select pg_get_constraintdef(oid) into strict current_definition
  from pg_constraint
  where conrelid = 'public.puzzles'::regclass and conname = 'puzzles_tags_valid';
  if position('king_sidestep' in current_definition) = 0 then
    updated_definition := replace(current_definition, 'tags <@ ''{', 'tags <@ ''{king_sidestep,');
    if updated_definition = current_definition then
      raise exception 'Unexpected puzzle tag constraint; no changes applied';
    end if;
    alter table public.puzzles drop constraint puzzles_tags_valid;
    execute 'alter table public.puzzles add constraint puzzles_tags_valid ' || updated_definition;
  end if;
end;
$$;
commit;

select tag, parent_tag, public.puzzle_tag_ancestors(tag) ancestors
from public.puzzle_tag_hierarchy where tag = 'king_sidestep';
