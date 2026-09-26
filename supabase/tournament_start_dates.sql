-- Add the published start date for every tournament currently in the archive.
-- Dates are stored as calendar dates because tournament announcements use UTC dates,
-- not a single start timestamp shared by every participant.

begin;

alter table public.tournament_catalog
  add column if not exists start_date date;

update public.tournament_catalog as tournament
set start_date = dates.start_date
from (
  values
    ('wr-arena2026', date '2026-07-12'),
    ('awc2026', date '2026-09-07'),
    ('aoc2026', date '2026-07-02'),
    ('ahc2026', date '2026-07-10'),
    ('ccac2026', date '2026-03-04'),
    ('awc2025', date '2025-09-03'),
    ('awc2024', date '2024-09-11'),
    ('awc2023', date '2023-09-11'),
    ('awc2022', date '2022-09-12'),
    ('awc2021', date '2021-09-13'),
    ('awc2020', date '2020-09-07'),
    ('awc2019', date '2019-09-09'),
    ('awc2018', date '2018-09-24'),
    ('awc2017', date '2017-10-30'),
    ('awc2016', date '2016-09-12')
) as dates(id, start_date)
where tournament.id = dates.id;

commit;

notify pgrst, 'reload schema';
