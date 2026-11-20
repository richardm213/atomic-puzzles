-- Set the creator's ungraded window on new puzzles without changing existing exclusions.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '25s';

create or replace function public.set_creator_puzzle_rating_exclusion()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.author is not distinct from old.author and new.created_at is not distinct from old.created_at then
      return new;
    end if;
  end if;

  if nullif(btrim(new.author),'') is not null then
    insert into public.puzzle_rating_exclusions(username,puzzle_id,category,expires_at,reason)
    values (
      public.canonical_user_username(new.author), new.id::text, 'creator',
      ((new.created_at at time zone 'UTC') + interval '2 months') at time zone 'UTC',
      'Creator cooldown'
    )
    on conflict(username,puzzle_id) do update
      set expires_at=greatest(puzzle_rating_exclusions.expires_at,excluded.expires_at)
      where puzzle_rating_exclusions.category<>'abuse';
  end if;
  return new;
end;
$$;
revoke all on function public.set_creator_puzzle_rating_exclusion() from public,anon,authenticated;

commit;
