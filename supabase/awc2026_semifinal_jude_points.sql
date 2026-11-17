-- AWC 2026 semifinal side bet. Apply in Firefox on the current database.
begin;

do $$
begin
  if not exists (
    select 1 from public.prediction_markets
    where id = 'awc2026-wb-r3-m2' and group_id = 'awc-2026-semifinals' and status = 'open'
  ) then
    raise exception 'Expected open Jude vs Maxwell semifinal market';
  end if;
end;
$$;

insert into public.prediction_markets (
  id, question, resolution_rules, resolution_source_url, closes_at, status,
  group_id, group_path, group_title, group_description, group_order,
  display_name, country_code, starting_chance, display_order
)
select
  'awc-2026-semifinal-jude-3-plus-points',
  'Will jude score 3+ points in his AWC 2026 semifinal?',
  'Resolves Yes if judebaetorrens scores at least 3.0 game points against maxwellssilvrhammer in their AWC 2026 winners'' semifinal, counting each win as 1 point and each draw as 0.5 points. Otherwise resolves No when the match ends. Use the official score from games actually played; an advancement or forfeit alone does not award points for this strike. If the match starts but ends early through withdrawal or disqualification, count only the points from games actually played. If the match is cancelled or either player withdraws or is banned before play begins, settle at the last fair traded price before confirmation, excluding manipulative trades; if there is no fair trade, refund bets. The official AWC 2026 bracket and linked match games are the resolution sources.',
  resolution_source_url, closes_at, 'open',
  group_id, group_path, group_title, group_description, group_order,
  'jude 3+ pts vs max', 'US', null, 3
from public.prediction_markets
where id = 'awc2026-wb-r3-m2'
on conflict (id) do nothing;

-- Null custom outcome labels use the shared Yes / No defaults.
commit;

select id, question, status, group_id, display_name, display_order,
  outcome_yes_label, outcome_no_label, closes_at, resolution_rules
from public.prediction_markets
where id = 'awc-2026-semifinal-jude-3-plus-points';
