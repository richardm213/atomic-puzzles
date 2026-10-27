-- Prevent AWC entrants from betting that they will not win the tournament.
begin;

create or replace function public.reject_awc_self_not_to_win_bet()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.market_id ~ '^awc[0-9]{4}-winner-no$'
    and lower(btrim(new.username)) = lower(btrim(new.selection)) then
    raise exception 'You cannot bet on yourself not to win AWC';
  end if;

  return new;
end;
$$;

drop trigger if exists reject_awc_self_not_to_win_bet
  on public.tournament_bets;

create trigger reject_awc_self_not_to_win_bet
before insert or update of market_id, username, selection
on public.tournament_bets
for each row
execute function public.reject_awc_self_not_to_win_bet();

commit;
