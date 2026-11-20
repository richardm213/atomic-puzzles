begin;

create table if not exists public.player_profile_reactions (
  profile_username text not null check (profile_username = lower(btrim(profile_username)) and char_length(profile_username) between 1 and 100),
  reactor_username text not null check (reactor_username = lower(btrim(reactor_username)) and char_length(reactor_username) between 1 and 100),
  reaction text not null check (char_length(reaction) between 1 and 80),
  primary key (profile_username, reaction, reactor_username)
);

alter table public.player_profile_reactions enable row level security;
revoke all on public.player_profile_reactions from public, anon, authenticated;
grant select, insert, delete on public.player_profile_reactions to service_role;

create or replace function public.get_player_profile_reactions(p_profile text, p_viewer text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(reactions) order by count desc, reaction), '[]'::jsonb)
  from (
    select reaction, count(*) as count, coalesce(bool_or(reactor_username = p_viewer), false) as reacted
    from public.player_profile_reactions
    where profile_username = p_profile
    group by reaction
  ) reactions;
$$;

create or replace function public.set_player_profile_reaction(
  p_profile text, p_viewer text, p_reaction text, p_reacted boolean
)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  if p_reacted then
    insert into public.player_profile_reactions (profile_username, reactor_username, reaction)
    values (p_profile, p_viewer, p_reaction)
    on conflict do nothing;
  else
    delete from public.player_profile_reactions
    where profile_username = p_profile and reactor_username = p_viewer and reaction = p_reaction;
  end if;

  return public.get_player_profile_reactions(p_profile, p_viewer);
end;
$$;

revoke all on function public.get_player_profile_reactions(text, text),
  public.set_player_profile_reaction(text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.get_player_profile_reactions(text, text),
  public.set_player_profile_reaction(text, text, text, boolean) to service_role;

notify pgrst, 'reload schema';

commit;
