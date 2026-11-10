-- Expand-only migration. The text IDs, primary-set compatibility field,
-- rating projections, public API shapes, and historical records stay intact.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- Stored generated columns avoid updating existing attempt rows (and thus
-- firing attempt/reward triggers). Text remains the write/API key for now.
-- NO ACTION intentionally does not cascade into solve or training history.
do $$
declare
  relation regclass;
begin
  foreach relation in array array[
    'public.custom_puzzle_set_items'::regclass,
    'public.puzzle_rating_exclusions'::regclass,
    'public.puzzle_progress'::regclass
  ] loop
    execute format(
      'alter table %s add column puzzle_catalog_id bigint generated always as (puzzle_id::bigint) stored not null,
       add constraint puzzle_catalog_id_canonical check (puzzle_id = puzzle_catalog_id::text),
       add constraint puzzle_catalog_id_fkey foreign key (puzzle_catalog_id) references public.puzzles(id)',
      relation
    );
    execute format('create index on %s (puzzle_catalog_id)', relation);
  end loop;
end
$$;

alter table public.puzzle_set_memberships
  add column is_primary boolean not null default false;

-- Existing importers still write puzzles.puzzle_set_id. Translate those writes
-- without discarding secondary memberships or the old public relationship.
create or replace function public.add_legacy_puzzle_set_membership()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.puzzle_set_memberships
  set is_primary = false
  where puzzle_id = new.id and is_primary
    and puzzle_set_id is distinct from new.puzzle_set_id;

  if new.puzzle_set_id is not null then
    insert into public.puzzle_set_memberships (puzzle_id, puzzle_set_id, is_primary)
    values (new.id, new.puzzle_set_id, true)
    on conflict (puzzle_id, puzzle_set_id) do update
      set is_primary = true
      where not puzzle_set_memberships.is_primary;
  end if;
  return new;
end;
$$;

insert into public.puzzle_set_memberships (puzzle_id, puzzle_set_id, is_primary)
select id, puzzle_set_id, true
from public.puzzles
where puzzle_set_id is not null
on conflict (puzzle_id, puzzle_set_id) do update set is_primary = true;

create unique index puzzle_set_memberships_one_primary
  on public.puzzle_set_memberships (puzzle_id) where is_primary;

comment on column public.puzzle_set_memberships.is_primary is
  'Primary catalog membership. Until legacy imports are cut over, change it through puzzles.puzzle_set_id.';
comment on column public.puzzles.puzzle_set_id is
  'Compatibility write interface for primary membership. Catalog reads prefer puzzle_set_memberships.is_primary.';

-- The catalog and play endpoints already read the authoritative rating row.
-- Keep all compatibility projections: puzzles without rating rows can carry
-- a different legacy seed and the API deliberately uses its own fallback.
comment on table public.puzzle_ratings is
  'Authoritative current rating state. Puzzle row projections are retained for legacy clients and seeds.';

notify pgrst, 'reload schema';
commit;
