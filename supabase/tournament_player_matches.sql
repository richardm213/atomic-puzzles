begin;

create index if not exists tournament_matches_player_one_key_idx
  on public.tournament_matches (lower(btrim(p1)));
create index if not exists tournament_matches_player_two_key_idx
  on public.tournament_matches (lower(btrim(p2)));

-- Return a player's historical bracket rows without downloading every tournament.
create or replace function public.get_tournament_player_matches(p_players text[])
returns setof public.tournament_matches
language sql stable set search_path = '' as $$
  select m.*
  from public.tournament_matches m
  where cardinality(p_players) between 1 and 32
    and (lower(btrim(m.p1)) = any(p_players) or lower(btrim(m.p2)) = any(p_players))
  order by m.tournament, m.id;
$$;

revoke all on function public.get_tournament_player_matches(text[]) from public, anon, authenticated;
grant execute on function public.get_tournament_player_matches(text[]) to service_role;
notify pgrst, 'reload schema';

commit;
