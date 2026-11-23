-- Apply in Firefox on the current database.
begin;

do $$
begin
  if (
    select count(*)
    from public.prediction_markets
    where group_id = 'awc-2026-losers-round-3' and status = 'open' and closes_at > now()
      and (id, outcome_yes_label, outcome_no_label) in (
        ('awc2026-lb-r3-m1', 'rechesster', 'quasabianth'),
        ('awc2026-lb-r3-m2', 'rabbier', 'sutcunuri')
      )
  ) <> 2 then
    raise exception 'Expected both open AWC 2026 Losers Round 3 match markets';
  end if;
end;
$$;

with strikes (id_suffix, match_id, question, display_name, yes_label, no_label, settlement, display_order) as (
  values
    ('rechesster-6-0', 'awc2026-lb-r3-m1',
     'Will rechesster clinch the match against quasabianth 6–0?',
     'rechesster 6-0 vs quasabianth', 'rechesster 6-0', 'Any other score',
     'Yes wins only if rechesster clinches exactly 6–0. Any other clinching score resolves No.', 3),
    ('quasabianth-plus-2', 'awc2026-lb-r3-m1',
     'Will quasabianth cover +2 against rechesster?',
     'quasabianth +2 vs rechesster -2', 'quasabianth +2', 'rechesster -2',
     'Quasabianth +2 wins if quasabianth wins or loses by at most 2 game points, including a 6–4 loss. Rechesster -2 wins if rechesster wins by more than 2.', 4),
    ('rabbier-plus-3', 'awc2026-lb-r3-m2',
     'Will rabbier cover +3 against sutcunuri?',
     'rabbier +3 vs sutcunuri -3', 'rabbier +3', 'sutcunuri -3',
     'Rabbier +3 wins if rabbier wins or loses by at most 3 game points, including a 6–3 loss. Sutcunuri -3 wins if sutcunuri wins by more than 3.', 5)
)
insert into public.prediction_markets (
  id, question, resolution_rules, resolution_source_url, closes_at, status,
  group_id, group_path, group_title, group_description, group_order,
  display_name, country_code, display_order,
  outcome_yes_label, outcome_no_label, outcome_yes_country_code, outcome_no_country_code
)
select
  s.match_id || '-' || s.id_suffix, s.question,
  'Use the score immediately after the game that clinches the match under the AWC rules. '
    || 'Games played after the clinch do not count. '
    || s.settlement
    || ' If the match is cancelled or decided by withdrawal, forfeit, or disqualification before a clinch in played games, '
    || 'settle at the last fair traded price before confirmation, excluding manipulative trades. If no fair trade exists, refund bets. '
    || 'Use the official AWC rules and linked match games to determine the clinching score.',
  m.resolution_source_url, m.closes_at, 'open',
  m.group_id, m.group_path, m.group_title, m.group_description, m.group_order,
  s.display_name,
  case when s.id_suffix = 'quasabianth-plus-2' then m.outcome_no_country_code else m.outcome_yes_country_code end,
  s.display_order, s.yes_label, s.no_label,
  case when s.id_suffix = 'quasabianth-plus-2' then m.outcome_no_country_code else m.outcome_yes_country_code end,
  case when s.id_suffix = 'quasabianth-plus-2' then m.outcome_yes_country_code else m.outcome_no_country_code end
from strikes s
join public.prediction_markets m on m.id = s.match_id
on conflict (id) do nothing;

commit;
