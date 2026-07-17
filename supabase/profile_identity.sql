-- Resolve a profile alias and return the canonical player's complete identity in one request.

create index if not exists aliases2_alias_lower_idx
  on public.aliases2 ((lower(alias)));

create index if not exists aliases2_username_lower_idx
  on public.aliases2 ((lower(username)));

create or replace function public.get_profile_identity(p_username text)
returns table (
  alias text,
  username text,
  banned boolean,
  count_games text,
  openings text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with profile_input as (
    select lower(trim(coalesce(p_username, ''))) as requested_username
  ),
  resolved_profile as (
    select coalesce(
      (
        select identity.username
        from public.aliases2 as identity
        cross join profile_input
        where lower(identity.alias) = profile_input.requested_username
        order by lower(identity.alias), lower(identity.username)
        limit 1
      ),
      (select requested_username from profile_input)
    ) as canonical_username
  )
  select
    identity.alias,
    identity.username,
    identity.banned,
    identity.count_games,
    identity.openings
  from public.aliases2 as identity
  cross join resolved_profile
  where lower(identity.username) = lower(resolved_profile.canonical_username)
  order by lower(identity.alias);
$$;

grant execute on function public.get_profile_identity(text) to anon, authenticated;
