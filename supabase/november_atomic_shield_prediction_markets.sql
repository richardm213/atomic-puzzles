-- Binary order-book strikes for the November 2026 Lichess Atomic Shield winner.
begin;

insert into public.prediction_markets (
  id,
  question,
  resolution_rules,
  resolution_source_url,
  closes_at
) values
  (
    'november-atomic-shield-2026-rechesster',
    'Will rechesster win the November Atomic Shield?',
    'Resolves Yes if rechesster finishes first in the official Lichess Atomic Shield Arena scheduled for 2026-11-20. Otherwise resolves No. The official Lichess tournament result is the sole resolution source.',
    'https://lichess.org/tournament/calendar',
    '2026-11-20T16:00:00Z'
  ),
  (
    'november-atomic-shield-2026-vannto',
    'Will vannto win the November Atomic Shield?',
    'Resolves Yes if vannto finishes first in the official Lichess Atomic Shield Arena scheduled for 2026-11-20. Otherwise resolves No. The official Lichess tournament result is the sole resolution source.',
    'https://lichess.org/tournament/calendar',
    '2026-11-20T16:00:00Z'
  ),
  (
    'november-atomic-shield-2026-wolfram-ep',
    'Will wolfram_ep win the November Atomic Shield?',
    'Resolves Yes if wolfram_ep finishes first in the official Lichess Atomic Shield Arena scheduled for 2026-11-20. Otherwise resolves No. The official Lichess tournament result is the sole resolution source.',
    'https://lichess.org/tournament/calendar',
    '2026-11-20T16:00:00Z'
  ),
  (
    'november-atomic-shield-2026-opabinia',
    'Will opabinia win the November Atomic Shield?',
    'Resolves Yes if opabinia finishes first in the official Lichess Atomic Shield Arena scheduled for 2026-11-20. Otherwise resolves No. The official Lichess tournament result is the sole resolution source.',
    'https://lichess.org/tournament/calendar',
    '2026-11-20T16:00:00Z'
  ),
  (
    'november-atomic-shield-2026-maxwellssilvrhammer',
    'Will maxwellssilvrhammer win the November Atomic Shield?',
    'Resolves Yes if maxwellssilvrhammer finishes first in the official Lichess Atomic Shield Arena scheduled for 2026-11-20. Otherwise resolves No. The official Lichess tournament result is the sole resolution source.',
    'https://lichess.org/tournament/calendar',
    '2026-11-20T16:00:00Z'
  ),
  (
    'november-atomic-shield-2026-new-life14',
    'Will new_life14 win the November Atomic Shield?',
    'Resolves Yes if new_life14 finishes first in the official Lichess Atomic Shield Arena scheduled for 2026-11-20. Otherwise resolves No. The official Lichess tournament result is the sole resolution source.',
    'https://lichess.org/tournament/calendar',
    '2026-11-20T16:00:00Z'
  ),
  (
    'november-atomic-shield-2026-chrisrapid',
    'Will chrisrapid win the November Atomic Shield?',
    'Resolves Yes if chrisrapid finishes first in the official Lichess Atomic Shield Arena scheduled for 2026-11-20. Otherwise resolves No. The official Lichess tournament result is the sole resolution source.',
    'https://lichess.org/tournament/calendar',
    '2026-11-20T16:00:00Z'
  ),
  (
    'november-atomic-shield-2026-randoomplayer',
    'Will randoomplayer win the November Atomic Shield?',
    'Resolves Yes if randoomplayer finishes first in the official Lichess Atomic Shield Arena scheduled for 2026-11-20. Otherwise resolves No. The official Lichess tournament result is the sole resolution source.',
    'https://lichess.org/tournament/calendar',
    '2026-11-20T16:00:00Z'
  ),
  (
    'november-atomic-shield-2026-natso',
    'Will natso win the November Atomic Shield?',
    'Resolves Yes if natso finishes first in the official Lichess Atomic Shield Arena scheduled for 2026-11-20. Otherwise resolves No. The official Lichess tournament result is the sole resolution source.',
    'https://lichess.org/tournament/calendar',
    '2026-11-20T16:00:00Z'
  ),
  (
    'november-atomic-shield-2026-ihatespammers',
    'Will ihatespammers win the November Atomic Shield?',
    'Resolves Yes if ihatespammers finishes first in the official Lichess Atomic Shield Arena scheduled for 2026-11-20. Otherwise resolves No. The official Lichess tournament result is the sole resolution source.',
    'https://lichess.org/tournament/calendar',
    '2026-11-20T16:00:00Z'
  ),
  (
    'november-atomic-shield-2026-quasabianth',
    'Will quasabianth win the November Atomic Shield?',
    'Resolves Yes if quasabianth finishes first in the official Lichess Atomic Shield Arena scheduled for 2026-11-20. Otherwise resolves No. The official Lichess tournament result is the sole resolution source.',
    'https://lichess.org/tournament/calendar',
    '2026-11-20T16:00:00Z'
  ),
  (
    'november-atomic-shield-2026-maracker',
    'Will maracker win the November Atomic Shield?',
    'Resolves Yes if maracker finishes first in the official Lichess Atomic Shield Arena scheduled for 2026-11-20. Otherwise resolves No. The official Lichess tournament result is the sole resolution source.',
    'https://lichess.org/tournament/calendar',
    '2026-11-20T16:00:00Z'
  ),
  (
    'november-atomic-shield-2026-rabbier',
    'Will rabbier win the November Atomic Shield?',
    'Resolves Yes if rabbier finishes first in the official Lichess Atomic Shield Arena scheduled for 2026-11-20. Otherwise resolves No. The official Lichess tournament result is the sole resolution source.',
    'https://lichess.org/tournament/calendar',
    '2026-11-20T16:00:00Z'
  ),
  (
    'november-atomic-shield-2026-others',
    'Will someone else win the November Atomic Shield?',
    'Resolves Yes if the official winner of the Lichess Atomic Shield Arena scheduled for 2026-11-20 is not rechesster, vannto, wolfram_ep, opabinia, maxwellssilvrhammer, new_life14, chrisrapid, randoomplayer, natso, ihatespammers, quasabianth, maracker, or rabbier. Otherwise resolves No. The official Lichess tournament result is the sole resolution source.',
    'https://lichess.org/tournament/calendar',
    '2026-11-20T16:00:00Z'
  )
on conflict (id) do update set
  question = excluded.question,
  resolution_rules = excluded.resolution_rules,
  resolution_source_url = excluded.resolution_source_url,
  closes_at = excluded.closes_at,
  updated_at = now();

commit;
