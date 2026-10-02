-- Canonicalize Atomic Puzzles-owned user data across counted Lichess aliases.
-- Generated from the production match archive aliases resource on 2026-10-02.
-- `is_separate` rows are count_games=n (drunk/separate accounts) and intentionally
-- resolve to themselves. Chess.com-only count_games=c aliases are not Lichess logins
-- and are intentionally absent.
--
-- Merge rules:
--   * duplicate puzzle attempts: keep the earliest first_attempt_at row;
--   * duplicate attempt/daily coin awards: keep the earliest transaction;
--   * coin balance: keep the richest linked account's balance (never sum balances);
--   * different-puzzle coin awards: retain every transaction;
--   * derived puzzle ratings/events: rebuild from the canonical attempt ledger.

begin;

create table if not exists public.user_aliases (
  alias text primary key check (alias = lower(btrim(alias)) and length(alias) > 0),
  canonical_username text not null check (
    canonical_username = lower(btrim(canonical_username)) and length(canonical_username) > 0
  ),
  is_separate boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.user_aliases (alias, canonical_username, is_separate)
values
  ('6uyja', 'tla', false),
  ('a-liang', 'catask', false),
  ('a_few_people_know_me', 'tla', false),
  ('adckoe_3apebo', 'wolfram_ep', false),
  ('agent_scully', 'eliothedog', false),
  ('agnrknue636b', 'thuban', false),
  ('albaknightbackup', 'albaknight', false),
  ('aless-hernandez', 'vannto', false),
  ('algaebruh', 'opabinia', false),
  ('algaebruheimo', 'opabinia', false),
  ('alwaysofone', 'prince_of_atomic', false),
  ('an9nymous', 'ihatespammers', false),
  ('angry_cactus', 'chessuxx', false),
  ('anonymonus', 'lejoueuur', false),
  ('anonymous907709', 'tla', false),
  ('anthonypower', 'anthonypowers', false),
  ('anthonypower1', 'anthonypowers', false),
  ('anthonypowerreturns', 'anthonypowers', false),
  ('antonio_77', 'iranto', false),
  ('ants_dont_have_lungs', 'anonymously1234', false),
  ('apu_1', 'anthonypowers', false),
  ('arasov', 'ahyalandunyada', false),
  ('arkamura', 'tla', false),
  ('arshaw', 'opabinia', false),
  ('asdfnamee', 'asdfname', false),
  ('asfault', 'randoomplayer', false),
  ('ashanwonder', 'destiny_of_power', false),
  ('atomic-bum', 'anthonypowers', false),
  ('atomic-rookie', 'prince', false),
  ('atomic-salami', 'junglefreak', false),
  ('atomicchessteacher', 'tla', false),
  ('atomicexpert', 'lishadowapps', false),
  ('atomicmasternewo23', 'newo23', false),
  ('atomicoverseer', 'atomicblunder', false),
  ('atomicprince', 'prince_of_atomic', false),
  ('atomsofcrush', 'tla', false),
  ('attest', 'paeivyt', false),
  ('avanthian_magistrate', 'destiny_of_power', false),
  ('axelgonale', 'axelgale', false),
  ('ayayayash', 'yash', false),
  ('azaharesserranochess', 'kashmor', false),
  ('azrael_666', 'chessuxx', false),
  ('b3forbb2', 'tla', false),
  ('bahq', 'bahaddin_01', false),
  ('bahq01', 'bahaddin_01', false),
  ('ballardheels', 'ballarddevils', false),
  ('ballen', 'chessuxx', false),
  ('beafraidofyourdesire', 'maracker', false),
  ('beerme', 'chronatog', false),
  ('beerparrot', 'chessuxx', false),
  ('beginnagain', 'absolutelytrash', false),
  ('betul_2016', 'murat', false),
  ('bezerker2000', 'knightblade_123', false),
  ('biggest_floppa228', 'new_life14', false),
  ('bishoy125-alt', 'bishoy125', false),
  ('brigt_sun', 'vlad_00', false),
  ('bulletgodhyper2', 'lvn', false),
  ('byebyestephen', 'stephenhello', false),
  ('cady_0', 'watchmedisappear', false),
  ('calmwaters', 'highestcliff', false),
  ('casperyliu', 'xanify', false),
  ('cats_are_very_cute', 'studieb', false),
  ('ceres222', 'orcinus_orca', false),
  ('cerf-gueule', 'chessuxx', false),
  ('check4yourheart', 'tla', false),
  ('checkmatemyheart', 'tla', false),
  ('cheekyloo', 'jmilie', false),
  ('chef_boyardee_style', 'chessuxx', false),
  ('chembaby', 'maracker', false),
  ('chesspawn123', 'arjan_chess2', false),
  ('chezzuxx', 'chessuxx', false),
  ('childoftherain', 'neverofzero', false),
  ('chinmayatomicmaster', 'chinmaytheking', false),
  ('chipola14', 'thuban', false),
  ('chrissical', 'judebaetorrens', false),
  ('chrollolcf', 'chrollo_l', false),
  ('chudoyud0', 'chudoyudo', false),
  ('clllover', 'quasabianth', false),
  ('confusedparrot', 'chessuxx', false),
  ('corinthiano1', 'mako_shop', false),
  ('cowboypowpow', 'chessuxx', false),
  ('cqq', 'xanify', false),
  ('cureforpain', 'shaddock', false),
  ('dancewithmeqt', 'fables', false),
  ('dark-spirit', 'rkrounit', false),
  ('darksolarium', 'olivercoolster', false),
  ('dead63', 'shaddock', false),
  ('declaminius', 'camisapricity', true),
  ('defter_pert', 'chrollo_l', false),
  ('diegovicencio', 'caballofacil', false),
  ('digvijay_sunil2', 'digvijay_sunil', false),
  ('diplodocus_hatchling', 'seaside_tiramisu', false),
  ('domingues_slow_chess', 'chrisrapid', false),
  ('dratomykenstein', 'tla', false),
  ('drpeepee', 'gannet', false),
  ('drsolvenstein', 'tla', false),
  ('drtidkeyash', 'yash', false),
  ('drunkenmaracker', 'maracker', true),
  ('dryash02', 'yash', false),
  ('dryashhh', 'yash', false),
  ('dryashtidke', 'yash', false),
  ('e-x-p', 'tla', false),
  ('eatyourkidney', 'absolutelytrash', false),
  ('eldereliteplayer', 'tla', false),
  ('emin_2016', 'murat', false),
  ('emir_2012', 'murat', false),
  ('enigmatlc', 'jimmeex', false),
  ('f3747980', 'murat', false),
  ('f4_camper', 'benjapinto', false),
  ('f4f5gg', 'maxwellssilvrhammer', true),
  ('fast-tsunami07', 'kashmor', false),
  ('fft2', 'fft1', false),
  ('frac7ured', 'lvn', false),
  ('frenchatomicchampion', 'tla', false),
  ('g-67wp', 'murat', false),
  ('gannetstyle', 'tla', false),
  ('glancelinelearner', 'gannet', false),
  ('godsparticle', 'neverofzero', false),
  ('gorilla2002', 'lvn', false),
  ('green_donkey', 'opabinia', false),
  ('grx_bullet', 'kashmor', false),
  ('guthrikr', 'paeivyt', false),
  ('gybf-vortex', 'seadra', false),
  ('h3lloworld', 'kreedz', false),
  ('haideraliz', 'haideraliq', false),
  ('handywebprojects', 'lishadowapps', false),
  ('happycactushasreturn', 'chessuxx', false),
  ('helloiamfreeelo', 'tla', false),
  ('hobocu6upck', 'hobocub', false),
  ('holylizard', 'ujkamegasus', false),
  ('howlind_g4', 'howlind', true),
  ('humanwaist', 'shaddock', false),
  ('humanwake', 'tla', false),
  ('humanwaste', 'shaddock', false),
  ('hyperion_chess', 'hysterix', false),
  ('hysterixoncrack', 'hysterix', true),
  ('i_want_to_be_ninja', 'henk_dekleerkast', false),
  ('iberserkatomic', 'venusaurbeedrill', false),
  ('idk1365', 'okcool123', false),
  ('ihate2nners', 'tla', false),
  ('insanehasreturned', 'sutcunuri', true),
  ('inthenextmove', 'apostador', false),
  ('iranto-77', 'iranto', false),
  ('irynazarutska', 'tla', false),
  ('jabezh', 'jabezb', false),
  ('jatekos', 'lishadowapps', false),
  ('jaydenden2', 'jaydenden', false),
  ('johnpaulgaultier', 'average200', false),
  ('k1ll-shot', 'vannto', false),
  ('kamikazenight', 'chessuxx', false),
  ('kamikazenights', 'chessuxx', false),
  ('karolinawhite', 'thuban', false),
  ('kingslayerlp', 'lvn', false),
  ('kingsofkings123', 'arjan_chess2', false),
  ('komarinayaplesh', 'kreedz', false),
  ('kratos-atomic', 'prince', false),
  ('kryfyre', 'xanify', false),
  ('laststrider', 'last_strider', false),
  ('lawrenceofmurica', 'arjan_chess2', false),
  ('learningvariants', 'ujkamegasus', false),
  ('leon_de_professional', 'leon_synthesis_32', false),
  ('levheniia', 'levhenia', false),
  ('levhenya', 'levhenia', false),
  ('lievenpowers', 'lvn', false),
  ('lifeofinjustice', 'hopefulromantic', false),
  ('line-tester', 'nevergonnaberserk', false),
  ('line-tester-01', 'nevergonnaberserk', false),
  ('linetester', 'nevergonnaberserk', false),
  ('lizux_chess', 'tla', false),
  ('loss_is_power', 'absolutelytrash', false),
  ('lvntheconqueror', 'lvn', false),
  ('mabrook', 'vannto', false),
  ('magnusautismcarlsen', 'lvn', false),
  ('makefetchhappen', 'chronatog', false),
  ('masterikd', 'venusaurbeedrill', false),
  ('max_00', 'paeivyt', false),
  ('maxwellsgldboyfriend', 'tla', false),
  ('megahilpha', 'opabinia', false),
  ('megarequasa', 'absolutelytrash', false),
  ('megaz1t1k', 'pro8er', true),
  ('melvet2', 'melvet', false),
  ('merryxmaseverybody', 'tla', false),
  ('micuentatmr', 'javika111', false),
  ('mikurochka', 'quasabianth', true),
  ('misatoyanagihara', 'quasabianth', false),
  ('moltenthinker', 'smashtimefools', false),
  ('moltenthonker', 'tla', false),
  ('montagema', 'lamsz', false),
  ('mr_aquariyaz67', 'murat', false),
  ('mr_board_master', 'francothefalcon', false),
  ('mroldtimer', 'tipau', false),
  ('mrtiltman', 'maracker', false),
  ('mss365', 'murat', false),
  ('murat_2015', 'murat', false),
  ('mustacheparrot', 'chessuxx', false),
  ('myiasis', 'gannet', false),
  ('mysticazure', 'i-win-00', false),
  ('naomi9q', 'quasabianth', true),
  ('natsonotso', 'tla', false),
  ('neoarcturus', 'rechesster', false),
  ('nessie022', 'hypercamel', false),
  ('neverbethebullet', 'neverofzero', false),
  ('neverbethenever', 'tla', false),
  ('night_in_heaven', 'arjanzs', false),
  ('nightreaper33', 'onubense', false),
  ('nitrocoloraze', 'lesha2002', false),
  ('nitronexus', 'yash', false),
  ('notch2nl', 'yash', false),
  ('notsonatso', 'maxwellssilvrhammer', false),
  ('nozprime', 'neverofzero', false),
  ('obscurosonido', 'ukimix', false),
  ('octopoosh', 'chessuxx', false),
  ('oh_my_goat_im_so_bat', 'chessuxx', false),
  ('onlyonepluszero', 'tla', false),
  ('onunense', 'opabinia', false),
  ('onuqense', 'crepuscular', false),
  ('oopolob', 'neverofzero', false),
  ('opabinia2401', 'opabinia', false),
  ('opabinia2402', 'opabinia', false),
  ('oxytocinaddict', 'tla', false),
  ('p-01011-010100010001', 'opabinia', false),
  ('p4x', 'mobilephone2', false),
  ('paeivyt2', 'paeivyt', false),
  ('pazdanielfre', 'caballofacil', false),
  ('pearlstairs', 'ujkamegasus', false),
  ('penatua-tryun', 'penatua_balanchine', false),
  ('pepito_el_macho', 'benjapinto', false),
  ('phoenix1476', 'seadra', false),
  ('player_of_atomic', 'prince_of_atomic', false),
  ('pleutreclairee', 'tla', false),
  ('pork-spirit', 'absolutelytrash', false),
  ('prevail-atomic', 'prince_of_atomic', false),
  ('prince-of-atomic', 'prince_of_atomic', false),
  ('prince-reborn', 'prince_of_atomic', false),
  ('prince_of', 'prince_of_atomic', false),
  ('prince_of_atomic22', 'prince_of_atomic', false),
  ('prince_of_atomics', 'prince_of_atomic', false),
  ('professorzeko', 'ujkamegasus', false),
  ('pulsar666', 'chessuxx', false),
  ('pulsar_top', 'chessuxx', false),
  ('pyratech', 'tla', false),
  ('quiet-brilliancy01', 'mraquariyaz67', false),
  ('radioactiveblob', 'opabinia', false),
  ('rainynites', 'lishadowapps', false),
  ('ralionkaalyebenka', 'thuban', false),
  ('rapida-atomic', 'benjapinto', false),
  ('rapida_atomic', 'benjapinto', false),
  ('rechess_fan', 'absolutelytrash', false),
  ('recolte12', 'prince_of_atomic', false),
  ('recolte14', 'prince_of_atomic', false),
  ('redlongstrike', 'blackjack84', false),
  ('rey_de', 'benjapinto', false),
  ('rey_del_spamming', 'benjapinto', false),
  ('reycamaleon', 'caballofacil', false),
  ('roadtosandbagging', 'absolutelytrash', false),
  ('rookgamestrategy', 'opabinia', false),
  ('rookoobay', 'rookoombay', false),
  ('rutokkli', 'lamsz', false),
  ('sabfrompc', 'tla', false),
  ('saigonogenshi', 'tla', false),
  ('sakagamitomoyo', 'quasabianth', true),
  ('salmon_and_coffee', 'tla', false),
  ('sayunablitz', 'tla', false),
  ('scenry1', 'maxwellssilvrhammer', false),
  ('schachjohnny', 'schachemanuel', false),
  ('seasidecliff', 'seaside_tiramisu', false),
  ('sefulesefarka', 'lishadowapps', false),
  ('seth_7777777', 'seth_777', false),
  ('shadowgecko', 'ujkamegasus', false),
  ('shnitez', 'shnitez', true),
  ('shoepond', 'shaddock', false),
  ('sichuan_liangfen', 'seaside_tiramisu', true),
  ('silentbutdeadly44', 'maxwellssilvrhammer', false),
  ('silentsakupen', 'tla', false),
  ('sirkakhetes', 'rkrounit', true),
  ('sleepyalaskan2', 'sleepyalaskan', false),
  ('slow-wave', 'opabinia', false),
  ('sopad', 'jasos12', false),
  ('sophor', 'atcly', false),
  ('sotapanna', 'sotapana_ass', false),
  ('spamis4losers', 'letzplaykrazy', false),
  ('speedyyyyy', 'maxwellssilvrhammer', false),
  ('stephanie_s_symphony', 'semanticshape', false),
  ('strasa', 'lejoueuur', false),
  ('su-ku-na', 'vannto', false),
  ('surlzz', 'arjan_chess2', false),
  ('t-l-a', 'tla', false),
  ('t_l_a', 'tla', false),
  ('taisthuban', 'thuban', false),
  ('taoyo', 'opabinia', false),
  ('tbosson', 'thbosson', true),
  ('teilchen', 'tla', false),
  ('tenkinoko', 'ujkamegasus', false),
  ('the-climb', 'maxwellssilvrhammer', false),
  ('thechallenger', 'tla', false),
  ('thedarksideofatomik', 'tla', false),
  ('thegreencloud', 'arka50', false),
  ('thelastatom', 'tla', false),
  ('therobloxkid', 'ihatespammers', false),
  ('theskybluesun', 'paeivyt', false),
  ('tidke', 'yash', false),
  ('tidkeyash', 'yash', false),
  ('tidkeyash2002', 'yash', false),
  ('timetoplayatomic', 'quasabianth', false),
  ('timofey', 'statham_13', true),
  ('tla_the_teilchen', 'tla', false),
  ('tlateilchen', 'tla', false),
  ('tolyastarina0991', 'tolya_starina0995', false),
  ('toughlucktimeisup', 'opabinia', false),
  ('tovo04', 'thuban', false),
  ('trblietka', 'junglefreak', false),
  ('tribielka', 'watchmedisappear', false),
  ('tricep-definition', 'prince_of_atomic', false),
  ('uapit', 'tipau', false),
  ('unique_openings', 'absolutelytrash', false),
  ('vacuumdecay', 'rabidknight', false),
  ('vamto', 'vannto', false),
  ('vannt-o', 'vannto', false),
  ('vannto-say2', 'vannto', false),
  ('vanntos', 'vannto', false),
  ('vanntu', 'neverofzero', false),
  ('variantbunnyfan', 'fables', false),
  ('vedminstuden', 'kreedz', false),
  ('verdance', 'seadra', false),
  ('village_elder', 'tla', false),
  ('vins_irius', 'tla', false),
  ('vmalinovsky2009', 'the_best_of_best', false),
  ('whatismymainbro', 'whatismynamebro', false),
  ('wherefore', 'stephenhello', false),
  ('whooooami', 'quasabianth', false),
  ('why-so-serious-bruh', 'yash', false),
  ('word_33', 'vannto', false),
  ('xeransis', 'gannet', false),
  ('xing-play', 'vannto', false),
  ('xsstudies', 'gannet', false),
  ('yagmur_2015', 'murat', false),
  ('yashatidke', 'yash', false),
  ('yashtidke2002', 'yash', false),
  ('ylcta', 'atcly', false),
  ('zayashira', 'yash', false),
  ('zerk2n', 'chicken_buttt', false),
  ('zoyamu', 'rechesster', true)
on conflict (alias) do update set
  canonical_username = excluded.canonical_username,
  is_separate = excluded.is_separate,
  updated_at = now();

revoke all on table public.user_aliases from public, anon, authenticated;
grant select, insert, update, delete on table public.user_aliases to service_role;

create or replace function public.canonical_user_username(p_username text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when normalized.username = '' then ''
    when coalesce(link.is_separate, false) then normalized.username
    else coalesce(link.canonical_username, normalized.username)
  end
  from (select lower(btrim(coalesce(p_username, ''))) as username) normalized
  left join public.user_aliases link on link.alias = normalized.username;
$$;

revoke all on function public.canonical_user_username(text) from public, anon, authenticated;
grant execute on function public.canonical_user_username(text) to service_role;

-- Snapshot balances before any ownership rewrite. The target balance is the
-- maximum across the canonical identity, exactly as requested, not a sum.
create temporary table alias_balance_winners on commit drop as
select public.canonical_user_username(account.username) as username,
       max(account.balance)::integer as balance,
       max(account.updated_at) as updated_at
from public.coin_accounts account
group by public.canonical_user_username(account.username);

-- Keep only the earliest attempt for a canonical user/puzzle pair.
with ranked as (
  select progress.ctid,
         row_number() over (
           partition by public.canonical_user_username(progress.username), progress.puzzle_id
           order by progress.first_attempt_at, progress.username, progress.ctid
         ) as row_number
  from public.puzzle_progress progress
)
delete from public.puzzle_progress progress
using ranked
where progress.ctid = ranked.ctid and ranked.row_number > 1;

update public.puzzle_progress progress
set username = public.canonical_user_username(progress.username)
where progress.username is distinct from public.canonical_user_username(progress.username);

-- Coin source keys encode the username for attempt and daily awards. Project
-- those keys first, remove duplicates by earliest timestamp, then rewrite.
with projected as (
  select transaction.ctid,
         case
           when transaction.source_key like 'attempt:%' then
             'attempt:' || public.canonical_user_username(transaction.username) || ':' || split_part(transaction.source_key, ':', 3)
           when transaction.source_key like 'daily:%' then
             'daily:' || public.canonical_user_username(transaction.username) || ':' || split_part(transaction.source_key, ':', 3)
           else transaction.source_key
         end as canonical_source_key,
         transaction.created_at,
         transaction.id
  from public.coin_transactions transaction
), ranked as (
  select projected.*,
         row_number() over (
           partition by projected.canonical_source_key
           order by projected.created_at, projected.id
         ) as row_number
  from projected
)
delete from public.coin_transactions transaction
using ranked
where transaction.ctid = ranked.ctid and ranked.row_number > 1;

update public.coin_transactions transaction
set username = public.canonical_user_username(transaction.username),
    source_key = case
      when transaction.source_key like 'attempt:%' then
        'attempt:' || public.canonical_user_username(transaction.username) || ':' || split_part(transaction.source_key, ':', 3)
      when transaction.source_key like 'daily:%' then
        'daily:' || public.canonical_user_username(transaction.username) || ':' || split_part(transaction.source_key, ':', 3)
      else transaction.source_key
    end,
    metadata = case
      when transaction.metadata ? 'sender' then
        jsonb_set(transaction.metadata, '{sender}', to_jsonb(public.canonical_user_username(transaction.metadata->>'sender')))
      when transaction.metadata ? 'recipient' then
        jsonb_set(transaction.metadata, '{recipient}', to_jsonb(public.canonical_user_username(transaction.metadata->>'recipient')))
      else transaction.metadata
    end
where transaction.username is distinct from public.canonical_user_username(transaction.username)
   or transaction.source_key like 'attempt:%'
   or transaction.source_key like 'daily:%'
   or transaction.metadata ?| array['sender','recipient'];

insert into public.coin_accounts (username, balance, updated_at)
select username, balance, updated_at from alias_balance_winners
on conflict (username) do update set
  balance = excluded.balance,
  updated_at = greatest(public.coin_accounts.updated_at, excluded.updated_at);

delete from public.coin_accounts account
where account.username is distinct from public.canonical_user_username(account.username);

-- Create every canonical parent user before rewriting foreign-keyed child rows.
insert into public.users (username, created_at)
select public.canonical_user_username(account.username), min(account.created_at)
from public.users account
group by public.canonical_user_username(account.username)
on conflict (username) do update set
  created_at = least(public.users.created_at, excluded.created_at);

-- Normalize authored and submitted puzzles.
update public.puzzles puzzle
set author = public.canonical_user_username(puzzle.author)
where nullif(btrim(coalesce(puzzle.author, '')), '') is not null
  and puzzle.author is distinct from public.canonical_user_username(puzzle.author);

update public.puzzles_queue queue
set submitted_by = public.canonical_user_username(queue.submitted_by)
where queue.submitted_by is distinct from public.canonical_user_username(queue.submitted_by);

-- Merge one badge/vote row per canonical key. Badges retain the earliest unlock;
-- mutable votes retain the most recently updated choice.
with ranked as (
  select badge.ctid,
         row_number() over (
           partition by public.canonical_user_username(badge.username), badge.badge_key
           order by badge.earned_at, badge.username, badge.ctid
         ) as row_number
  from public.user_badges badge
)
delete from public.user_badges badge using ranked
where badge.ctid = ranked.ctid and ranked.row_number > 1;
update public.user_badges badge
set username = public.canonical_user_username(badge.username)
where badge.username is distinct from public.canonical_user_username(badge.username);

with ranked as (
  select vote.ctid,
         row_number() over (
           partition by vote.puzzle_id, public.canonical_user_username(vote.username)
           order by vote.updated_at desc, vote.created_at desc, vote.ctid
         ) as row_number
  from public.puzzle_votes vote
)
delete from public.puzzle_votes vote using ranked
where vote.ctid = ranked.ctid and ranked.row_number > 1;
update public.puzzle_votes vote
set username = public.canonical_user_username(vote.username)
where vote.username is distinct from public.canonical_user_username(vote.username);

with ranked as (
  select vote.ctid,
         row_number() over (
           partition by vote.comment_id, public.canonical_user_username(vote.username)
           order by vote.updated_at desc, vote.created_at desc, vote.ctid
         ) as row_number
  from public.community_comment_votes vote
)
delete from public.community_comment_votes vote using ranked
where vote.ctid = ranked.ctid and ranked.row_number > 1;
update public.community_comment_votes vote
set username = public.canonical_user_username(vote.username)
where vote.username is distinct from public.canonical_user_username(vote.username);

update public.community_comments comment
set username = public.canonical_user_username(comment.username)
where comment.username is distinct from public.canonical_user_username(comment.username);

-- Canonicalizing recipients can collapse two account-specific notifications
-- onto the same partial unique index. Keep the earliest notification in each
-- canonical bucket before rewriting the usernames.
with ranked as (
  select notification.ctid,
         row_number() over (
           partition by public.canonical_user_username(notification.recipient_username),
                        notification.notification_type,
                        notification.ranking_period,
                        notification.ranking_mode
           order by notification.created_at, notification.id, notification.ctid
         ) as row_number
  from public.notifications notification
  where notification.notification_type = 'monthly_ranking'
)
delete from public.notifications notification using ranked
where notification.ctid = ranked.ctid and ranked.row_number > 1;

with ranked as (
  select notification.ctid,
         row_number() over (
           partition by public.canonical_user_username(notification.recipient_username),
                        notification.notification_type
           order by notification.created_at, notification.id, notification.ctid
         ) as row_number
  from public.notifications notification
  where notification.notification_type = 'puzzle_rating_added'
)
delete from public.notifications notification using ranked
where notification.ctid = ranked.ctid and ranked.row_number > 1;

update public.notifications notification
set recipient_username = public.canonical_user_username(notification.recipient_username),
    actor_username = case when notification.actor_username is null then null
      else public.canonical_user_username(notification.actor_username) end
where notification.recipient_username is distinct from public.canonical_user_username(notification.recipient_username)
   or notification.actor_username is distinct from public.canonical_user_username(notification.actor_username);

update public.puzzle_issues issue
set reporter_username = public.canonical_user_username(issue.reporter_username),
    resolved_by = case when issue.resolved_by is null then null
      else public.canonical_user_username(issue.resolved_by) end
where issue.reporter_username is distinct from public.canonical_user_username(issue.reporter_username)
   or issue.resolved_by is distinct from public.canonical_user_username(issue.resolved_by);

-- Preserve historical transfers, requests, redemptions, and bans under the main
-- identity. Existing self-transfers can remain as history; the RPC still blocks
-- creation of new self-transfers.
alter table public.coin_transfers drop constraint if exists coin_transfers_check;
update public.coin_transfers transfer
set sender_username = public.canonical_user_username(transfer.sender_username),
    recipient_username = public.canonical_user_username(transfer.recipient_username)
where transfer.sender_username is distinct from public.canonical_user_username(transfer.sender_username)
   or transfer.recipient_username is distinct from public.canonical_user_username(transfer.recipient_username);

alter table public.coin_requests drop constraint if exists coin_requests_check;
update public.coin_requests request
set requester_username = public.canonical_user_username(request.requester_username),
    recipient_username = public.canonical_user_username(request.recipient_username)
where request.requester_username is distinct from public.canonical_user_username(request.requester_username)
   or request.recipient_username is distinct from public.canonical_user_username(request.recipient_username);

update public.shop_redemptions redemption
set username = public.canonical_user_username(redemption.username),
    fulfilled_by = case when redemption.fulfilled_by is null then null
      else public.canonical_user_username(redemption.fulfilled_by) end
where redemption.username is distinct from public.canonical_user_username(redemption.username)
   or redemption.fulfilled_by is distinct from public.canonical_user_username(redemption.fulfilled_by);

update public.coin_economy_bans ban
set username = public.canonical_user_username(ban.username),
    created_by = public.canonical_user_username(ban.created_by),
    revoked_by = case when ban.revoked_by is null then null
      else public.canonical_user_username(ban.revoked_by) end
where ban.username is distinct from public.canonical_user_username(ban.username)
   or ban.created_by is distinct from public.canonical_user_username(ban.created_by)
   or ban.revoked_by is distinct from public.canonical_user_username(ban.revoked_by);

-- Merge same-named custom sets without dropping progress.
create temporary table custom_set_merges on commit drop as
with ranked as (
  select owned_set.id,
         first_value(owned_set.id) over (
           partition by public.canonical_user_username(owned_set.username), lower(btrim(owned_set.name))
           order by owned_set.created_at, owned_set.id
         ) as keep_id,
         row_number() over (
           partition by public.canonical_user_username(owned_set.username), lower(btrim(owned_set.name))
           order by owned_set.created_at, owned_set.id
         ) as row_number
  from public.custom_puzzle_sets owned_set
)
select id as duplicate_id, keep_id from ranked where row_number > 1;

with candidates as (
  select merge.keep_id, item.puzzle_id, item.completed_at, item.last_result,
         item.attempt_count, item.removed_at,
         row_number() over (
           partition by merge.keep_id order by item.position, item.puzzle_id
         ) as position_offset,
         coalesce((select max(existing.position) from public.custom_puzzle_set_items existing
                   where existing.set_id = merge.keep_id), -1) as base_position
  from custom_set_merges merge
  join public.custom_puzzle_set_items item on item.set_id = merge.duplicate_id
  where not exists (
    select 1 from public.custom_puzzle_set_items existing
    where existing.set_id = merge.keep_id and existing.puzzle_id = item.puzzle_id
  )
)
insert into public.custom_puzzle_set_items (
  set_id, puzzle_id, position, completed_at, last_result, attempt_count, removed_at
)
select keep_id, puzzle_id, base_position + position_offset, completed_at, last_result, attempt_count, removed_at
from candidates
on conflict (set_id, puzzle_id) do nothing;

delete from public.custom_puzzle_sets owned_set
using custom_set_merges merge
where owned_set.id = merge.duplicate_id;
update public.custom_puzzle_sets owned_set
set username = public.canonical_user_username(owned_set.username)
where owned_set.username is distinct from public.canonical_user_username(owned_set.username);

-- Keep nickname rows unique after the owner rewrite. If both accounts had a
-- primary nickname, prefer the canonical account's current primary row.
with ranked as (
  select nickname.ctid,
         row_number() over (
           partition by public.canonical_user_username(nickname.username), nickname.nickname
           order by (nickname.username = public.canonical_user_username(nickname.username)) desc,
                    nickname.updated_at desc, nickname.ctid
         ) as row_number
  from public.player_nicknames nickname
)
delete from public.player_nicknames nickname using ranked
where nickname.ctid = ranked.ctid and ranked.row_number > 1;

with ranked as (
  select nickname.ctid,
         row_number() over (
           partition by public.canonical_user_username(nickname.username)
           order by (nickname.username = public.canonical_user_username(nickname.username)) desc,
                    nickname.is_primary desc, nickname.updated_at desc, nickname.ctid
         ) as row_number
  from public.player_nicknames nickname
  where nickname.is_primary
)
update public.player_nicknames nickname
set is_primary = false
from ranked
where nickname.ctid = ranked.ctid and ranked.row_number > 1;
update public.player_nicknames nickname
set username = public.canonical_user_username(nickname.username)
where nickname.username is distinct from public.canonical_user_username(nickname.username);

-- Remove alias parent users only after every foreign-keyed child has moved.
delete from public.users account
where account.username is distinct from public.canonical_user_username(account.username);

-- Derived puzzle ratings must be replayed after the attempt ledger changes.
delete from public.puzzle_user_ratings rating
where rating.username is distinct from public.canonical_user_username(rating.username);
insert into public.puzzle_user_ratings (username)
select distinct progress.username from public.puzzle_progress progress
on conflict (username) do nothing;
select public.rebuild_puzzle_ratings_from_history();

-- Canonicalize all future writes, including direct service-role/RPC writes.
create or replace function public.canonicalize_user_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  column_name text;
  payload jsonb := to_jsonb(new);
  raw_value text;
begin
  foreach column_name in array tg_argv loop
    raw_value := payload ->> column_name;
    if raw_value is not null then
      payload := jsonb_set(
        payload,
        array[column_name],
        to_jsonb(public.canonical_user_username(raw_value))
      );
    end if;
  end loop;
  new := jsonb_populate_record(new, payload);
  return new;
end;
$$;

create or replace function public.canonicalize_coin_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.username := public.canonical_user_username(new.username);
  if new.source_key like 'attempt:%' then
    new.source_key := 'attempt:' || new.username || ':' || split_part(new.source_key, ':', 3);
  elsif new.source_key like 'daily:%' then
    new.source_key := 'daily:' || new.username || ':' || split_part(new.source_key, ':', 3);
  end if;
  return new;
end;
$$;

-- Recreate triggers idempotently.
drop trigger if exists canonicalize_users_identity on public.users;
create trigger canonicalize_users_identity before insert or update of username on public.users
for each row execute function public.canonicalize_user_columns('username');
drop trigger if exists canonicalize_puzzle_progress_identity on public.puzzle_progress;
create trigger canonicalize_puzzle_progress_identity before insert or update of username on public.puzzle_progress
for each row execute function public.canonicalize_user_columns('username');
drop trigger if exists canonicalize_puzzles_identity on public.puzzles;
create trigger canonicalize_puzzles_identity before insert or update of author on public.puzzles
for each row execute function public.canonicalize_user_columns('author');
drop trigger if exists canonicalize_puzzles_queue_identity on public.puzzles_queue;
create trigger canonicalize_puzzles_queue_identity before insert or update of submitted_by on public.puzzles_queue
for each row execute function public.canonicalize_user_columns('submitted_by');
drop trigger if exists canonicalize_coin_accounts_identity on public.coin_accounts;
create trigger canonicalize_coin_accounts_identity before insert or update of username on public.coin_accounts
for each row execute function public.canonicalize_user_columns('username');
drop trigger if exists canonicalize_coin_transactions_identity on public.coin_transactions;
create trigger canonicalize_coin_transactions_identity before insert or update of username, source_key on public.coin_transactions
for each row execute function public.canonicalize_coin_transaction();
drop trigger if exists canonicalize_shop_redemptions_identity on public.shop_redemptions;
create trigger canonicalize_shop_redemptions_identity before insert or update of username, fulfilled_by on public.shop_redemptions
for each row execute function public.canonicalize_user_columns('username','fulfilled_by');
drop trigger if exists canonicalize_coin_transfers_identity on public.coin_transfers;
create trigger canonicalize_coin_transfers_identity before insert or update of sender_username, recipient_username on public.coin_transfers
for each row execute function public.canonicalize_user_columns('sender_username','recipient_username');
drop trigger if exists canonicalize_coin_requests_identity on public.coin_requests;
create trigger canonicalize_coin_requests_identity before insert or update of requester_username, recipient_username on public.coin_requests
for each row execute function public.canonicalize_user_columns('requester_username','recipient_username');
drop trigger if exists canonicalize_coin_bans_identity on public.coin_economy_bans;
create trigger canonicalize_coin_bans_identity before insert or update of username, created_by, revoked_by on public.coin_economy_bans
for each row execute function public.canonicalize_user_columns('username','created_by','revoked_by');
drop trigger if exists canonicalize_user_badges_identity on public.user_badges;
create trigger canonicalize_user_badges_identity before insert or update of username on public.user_badges
for each row execute function public.canonicalize_user_columns('username');
drop trigger if exists canonicalize_puzzle_votes_identity on public.puzzle_votes;
create trigger canonicalize_puzzle_votes_identity before insert or update of username on public.puzzle_votes
for each row execute function public.canonicalize_user_columns('username');
drop trigger if exists canonicalize_comments_identity on public.community_comments;
create trigger canonicalize_comments_identity before insert or update of username on public.community_comments
for each row execute function public.canonicalize_user_columns('username');
drop trigger if exists canonicalize_comment_votes_identity on public.community_comment_votes;
create trigger canonicalize_comment_votes_identity before insert or update of username on public.community_comment_votes
for each row execute function public.canonicalize_user_columns('username');
drop trigger if exists canonicalize_notifications_identity on public.notifications;
create trigger canonicalize_notifications_identity before insert or update of recipient_username, actor_username on public.notifications
for each row execute function public.canonicalize_user_columns('recipient_username','actor_username');
drop trigger if exists canonicalize_puzzle_issues_identity on public.puzzle_issues;
create trigger canonicalize_puzzle_issues_identity before insert or update of reporter_username, resolved_by on public.puzzle_issues
for each row execute function public.canonicalize_user_columns('reporter_username','resolved_by');
drop trigger if exists canonicalize_custom_sets_identity on public.custom_puzzle_sets;
create trigger canonicalize_custom_sets_identity before insert or update of username on public.custom_puzzle_sets
for each row execute function public.canonicalize_user_columns('username');
drop trigger if exists canonicalize_player_nicknames_identity on public.player_nicknames;
create trigger canonicalize_player_nicknames_identity before insert or update of username on public.player_nicknames
for each row execute function public.canonicalize_user_columns('username');

notify pgrst, 'reload schema';
commit;

select jsonb_build_object(
  'canonical_aliases', (select count(*) from public.user_aliases where not is_separate),
  'separate_accounts', (select count(*) from public.user_aliases where is_separate),
  'remaining_noncanonical_attempts', (
    select count(*) from public.puzzle_progress
    where username is distinct from public.canonical_user_username(username)
  ),
  'remaining_noncanonical_coin_accounts', (
    select count(*) from public.coin_accounts
    where username is distinct from public.canonical_user_username(username)
  ),
  'duplicate_canonical_attempts', (
    select count(*) from (
      select username, puzzle_id from public.puzzle_progress
      group by username, puzzle_id having count(*) > 1
    ) duplicates
  )
) as normalization_result;
