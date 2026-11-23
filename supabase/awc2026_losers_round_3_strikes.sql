-- Apply in Firefox on the current database.
begin;

-- Trading uses the same market locks.
select pg_advisory_xact_lock(hashtext('prediction-market:' || id))
from public.prediction_markets
where id in ('awc2026-lb-r3-m1-quasabianth-plus-2', 'awc2026-lb-r3-m2-rabbier-plus-3')
order by id;

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
  if exists (
    select 1 from public.prediction_markets m
    where (m.id, m.outcome_yes_label) in (
      ('awc2026-lb-r3-m1-quasabianth-plus-2', 'quasabianth +2'),
      ('awc2026-lb-r3-m2-rabbier-plus-3', 'rabbier +3')
    ) and (
      m.status <> 'open' or m.exchange_volume_coins <> 0 or m.sportsbook_volume_coins <> 0
      or exists (select 1 from public.prediction_orders o where o.market_id = m.id and o.status in ('open', 'partial'))
      or exists (select 1 from public.prediction_positions p where p.market_id = m.id and p.quantity > 0)
    )
  ) then
    raise exception 'Cannot change a handicap strike with trading activity';
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
     'Will quasabianth cover +1.5 against rechesster?',
     'quasabianth +1.5 vs rechesster -1.5', 'quasabianth +1.5', 'rechesster -1.5',
     'Add 1.5 points to quasabianth''s score. Quasabianth +1.5 wins if quasabianth wins the match or loses by 1 point. Rechesster -1.5 wins if rechesster wins by 2 or more, such as 6–4.', 4),
    ('rabbier-plus-3', 'awc2026-lb-r3-m2',
     'Will rabbier cover +2.5 against sutcunuri?',
     'rabbier +2.5 vs sutcunuri -2.5', 'rabbier +2.5', 'sutcunuri -2.5',
     'Add 2.5 points to rabbier''s score. Rabbier +2.5 wins if rabbier wins the match or loses by 1 or 2 points, such as 6–4. Sutcunuri -2.5 wins if sutcunuri wins by 3 or more, such as 6–3.', 5)
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
on conflict (id) do update set
  question = excluded.question,
  display_name = excluded.display_name,
  resolution_rules = excluded.resolution_rules,
  outcome_yes_label = excluded.outcome_yes_label,
  outcome_no_label = excluded.outcome_no_label
where (prediction_markets.id, prediction_markets.outcome_yes_label) in (
  ('awc2026-lb-r3-m1-quasabianth-plus-2', 'quasabianth +2'),
  ('awc2026-lb-r3-m2-rabbier-plus-3', 'rabbier +3')
);

commit;
