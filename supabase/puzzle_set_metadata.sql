-- Structured metadata for event-based puzzle sets and source-game player colors.
-- event remains as a legacy display label while clients migrate to these fields.
-- Run this migration before puzzle_sets.sql and the latest puzzles_queue.sql.

alter table public.puzzles
  add column if not exists event_name text not null default '',
  add column if not exists event_date text not null default '',
  add column if not exists players text[] not null default '{}'::text[],
  add column if not exists white_player text not null default '',
  add column if not exists black_player text not null default '';

alter table public.puzzles_queue
  add column if not exists event_name text not null default '',
  add column if not exists event_date text not null default '',
  add column if not exists players text[] not null default '{}'::text[],
  add column if not exists white_player text not null default '',
  add column if not exists black_player text not null default '';

alter table public.puzzles
  drop constraint if exists puzzles_event_date_format_check;
alter table public.puzzles
  add constraint puzzles_event_date_format_check check (
    event_date = '' or event_date ~ '^\d{4}(-\d{2}(-\d{2})?)?$'
  );

alter table public.puzzles_queue
  drop constraint if exists puzzles_queue_event_date_format_check;
alter table public.puzzles_queue
  add constraint puzzles_queue_event_date_format_check check (
    event_date = '' or event_date ~ '^\d{4}(-\d{2}(-\d{2})?)?$'
  );

-- The mapping intentionally uses only date precision present in the old label.
-- White/black cannot be inferred safely from a match-level name, so legacy rows
-- remain blank until their source games are identified. New PGN imports capture
-- White and Black directly.
with metadata(legacy_event, event_name, event_date, players) as (
  values
    ('ACL S2: Lesha vs Maracker', 'ACL S2', '', array['Lesha','Maracker']),
    ('ACL S2: RabbieR vs Quasabianth', 'ACL S2', '', array['RabbieR','Quasabianth']),
    ('ACL S2: Studieb vs Quasabianth', 'ACL S2', '', array['Studieb','Quasabianth']),
    ('Atomic960: Wolfram vs Lesha', 'Atomic960', '', array['Wolfram','Lesha']),
    ('Atomic960: Francothefalcon vs Marcothetiger', 'Atomic960', '', array['Francothefalcon','Marcothetiger']),
    ('Atomic960: Opabinia vs Quasabianth', 'Atomic960', '', array['Opabinia','Quasabianth']),
    ('Atomic960 Swiss ''26: Jsf vs Lesha', 'Atomic960 Swiss', '2026', array['Jsf','Lesha']),
    ('Atomic960 Swiss ''26: Lesha vs Rechesster', 'Atomic960 Swiss', '2026', array['Lesha','Rechesster']),
    ('Atomic960 Swiss ''26: Qed vs Rkr', 'Atomic960 Swiss', '2026', array['queeneatingdragon','rkrounit']),
    ('Blitz Practice Apr ''26: Rechesster vs Opabinia', '3+2 Practice', '2026-04', array['Rechesster','Opabinia']),
    ('Blitz Practice Apr ''26: Rechesster vs Paper-skies', '3+2 Practice', '2026-04', array['Rechesster','Paper-skies']),
    ('Blitz Practice Sep ''26: Wolfram vs Max', '3+2 Practice', '2026-09', array['Wolfram','Max']),
    ('Blitz Practice Sep ''26: Wolfram vs Rechesster', '3+2 Practice', '2026-09', array['Wolfram','Rechesster']),
    ('AWC 2018: Tipau vs Onubense', 'AWC', '2018', array['Tipau','Onubense']),
    ('AWC 2021: Wolfram vs Astavakra', 'AWC', '2021', array['Wolfram','Astavakra']),
    ('AWC 2023: Jsf vs Lesha', 'AWC', '2023', array['Jsf','Lesha']),
    ('AWC 2025: Max vs Sircachetes', 'AWC', '2025', array['Max','Sircachetes']),
    ('AWC 2025: Sircachetes vs Blackjack', 'AWC', '2025', array['Sircachetes','Blackjack']),
    ('AWC 2025: Wolfram vs Randoom', 'AWC', '2025', array['Wolfram','Randoom']),
    ('Wolfrandom 1st Time: Wolfram vs Rkr', 'Wolfrandom 1st Time', '', array['Wolfram','Rkr']),
    ('Wolfrandom Jul ''26: Unique_Openings vs Rechesster', 'Wolfrandom', '2026-07', array['Unique_Openings','Rechesster']),
    ('Wolfrandom Jul ’26: Unique_Openings vs Rechesster', 'Wolfrandom', '2026-07', array['Unique_Openings','Rechesster']),
    ('Unique_Openings vs Quasabianth Wolfrandom Match', 'Wolfrandom', '', array['Unique_Openings','Quasabianth']),
    ('unique_openings vs rechesster Wolfrandom Match', 'Wolfrandom', '', array['unique_openings','rechesster']),
    ('Wolfrandom Sep ''26: Rabbie vs Quasa', 'Wolfrandom', '2026-09', array['Rabbie','Quasa']),
    ('Wolfarena 2026: ReChesster vs Wolfram_EP', 'Wolfarena', '2026', array['ReChesster','Wolfram_EP']),
    ('Wolfarena 2026: Wolfram - Quasabianth', 'Wolfarena', '2026', array['Wolfram','Quasabianth']),
    ('Wolfarena 2026: BeAfraidOfYourDesire - RabbieR', 'Wolfarena', '2026', array['BeAfraidOfYourDesire','RabbieR']),
    ('Tipau Endgames', 'Tipau Endgames', '', array[]::text[]),
    ('trk-ReChesster endgame', 'ihatespammers-ReChesster endgame', '', array['ihatespammers','rechesster']),
    ('OTB hand-and-brain in Moscow (Lesha & Quasabianth - Wolfram & Maracker)', 'OTB hand-and-brain in Moscow', '', array['Lesha','Quasabianth','Wolfram','Maracker']),
    ('OTB hand-and-brain in Moscow (Maracker & Quasabianth - Wolfram & lesha)', 'OTB hand-and-brain in Moscow', '', array['Maracker','Quasabianth','Wolfram','lesha']),
    ('OTB hand-and-brain in Moscow (Maracker & Quasabianth - Wolfram & Lesha)', 'OTB hand-and-brain in Moscow', '', array['Maracker','Quasabianth','Wolfram','Lesha']),
    ('NeverOFzero''s Puzzles 1/9: Chapter 22', 'NeverOFzero''s Puzzles', '', array[]::text[]),
    ('NeverOFzero''s Puzzles 1/9: Chapter 29', 'NeverOFzero''s Puzzles', '', array[]::text[]),
    ('NeverOFzero''s Puzzles 1/9: Chapter 37', 'NeverOFzero''s Puzzles', '', array[]::text[]),
    ('NeverOFzero''s Puzzles 1/9: Chapter 44', 'NeverOFzero''s Puzzles', '', array[]::text[]),
    ('NeverOFzero''s Puzzles 5/9: Chapter 15', 'NeverOFzero''s Puzzles', '', array[]::text[]),
    ('NeverOFzero''s Puzzles 5/9: Chapter 44', 'NeverOFzero''s Puzzles', '', array[]::text[]),
    ('NeverOfzero''s Puzzles 8/9: meh wtv', 'NeverOFzero''s Puzzles', '', array[]::text[])
)
update public.puzzles p
set event_name = metadata.event_name,
    event_date = metadata.event_date,
    players = metadata.players
from metadata
where p.event = metadata.legacy_event;

-- Preserve any future or overlooked legacy set as a structured event instead of
-- dropping it from the set library.
update public.puzzles
set event_name = btrim(event)
where event_name = '' and btrim(coalesce(event, '')) <> '';

update public.puzzles_queue
set event_name = btrim(event)
where event_name = '' and btrim(coalesce(event, '')) <> '';

create index if not exists puzzles_event_metadata_idx
  on public.puzzles (lower(event_name), event_date);

notify pgrst, 'reload schema';
