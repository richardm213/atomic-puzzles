-- Allow the existing community discussion system to store tournament comments.
-- Run this in the Supabase SQL Editor before deploying the corresponding app changes.

begin;

do $$
declare
  constraint_record record;
begin
  -- Remove the existing target-type enum check even if Supabase/Postgres generated
  -- a different constraint name. Leave unrelated checks untouched.
  for constraint_record in
    select conname
    from pg_constraint
    where conrelid = 'public.community_comments'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%target_type%'
      and pg_get_constraintdef(oid) ilike '%puzzle%'
      and pg_get_constraintdef(oid) ilike '%profile%'
      and pg_get_constraintdef(oid) ilike '%match%'
      and pg_get_constraintdef(oid) not ilike '%tournament%'
  loop
    execute format(
      'alter table public.community_comments drop constraint %I',
      constraint_record.conname
    );
  end loop;
end
$$;

alter table public.community_comments
  drop constraint if exists community_comments_target_type_check;

alter table public.community_comments
  add constraint community_comments_target_type_check
  check (target_type in ('puzzle', 'profile', 'match', 'tournament'));

commit;

-- Optional verification:
-- select conname, pg_get_constraintdef(oid)
-- from pg_constraint
-- where conrelid = 'public.community_comments'::regclass
--   and contype = 'c';
