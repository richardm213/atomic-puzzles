-- Apply after the Markdown comment renderer is deployed. If the author edited
-- the original comment in the meantime, leave their new version untouched.
update public.community_comments
set body = replace(
  body,
  'this table : https://docs.google.com/spreadsheets/d/1auPnYyezLRsevEh04vfhDe3AwfeklQcjF-Waadlouaw/edit?gid=1190806205#gid=1190806205',
  '[this table](https://docs.google.com/spreadsheets/d/1auPnYyezLRsevEh04vfhDe3AwfeklQcjF-Waadlouaw/edit?gid=1190806205#gid=1190806205)'
)
where id = 422
  and username = 'balintakiraly'
  and target_type = 'tournament'
  and target_id = 'awc2026'
  and target_context = ''
  and body = $comment$I see that top 16 players' seeds are also shown, u can expand this to all players from this table : https://docs.google.com/spreadsheets/d/1auPnYyezLRsevEh04vfhDe3AwfeklQcjF-Waadlouaw/edit?gid=1190806205#gid=1190806205

Also shoutout to @theatomicstorm for advancing into the top 16 despite that originally he was seed #38$comment$;
