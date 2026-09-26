-- Add the published start and completion dates for every tournament currently in the archive.
-- Dates are stored as calendar dates because tournament announcements use UTC dates,
-- not a single start timestamp shared by every participant.

begin;

alter table public.tournament_catalog
  add column if not exists start_date date;

alter table public.tournament_catalog
  add column if not exists end_date date;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.tournament_catalog'::regclass
      and conname = 'tournament_catalog_date_range_check'
  ) then
    alter table public.tournament_catalog
      add constraint tournament_catalog_date_range_check
      check (end_date is null or start_date is null or end_date >= start_date);
  end if;
end;
$$;

update public.tournament_catalog as tournament
set start_date = dates.start_date,
    end_date = dates.end_date
from (
  values
    ('acl-s2', date '2026-02-01', date '2026-03-29'),
    ('acl-s1', date '2025-07-01', date '2025-08-30'),
    ('wr-arena2026', date '2026-07-12', date '2026-09-15'),
    ('awc2026', date '2026-09-07', null),
    ('aoc2026', date '2026-07-02', date '2026-07-31'),
    ('ahc2026', date '2026-07-10', date '2026-08-19'),
    ('ccac2026', date '2026-03-04', date '2026-03-06'),
    ('awc2025', date '2025-09-03', date '2025-12-20'),
    ('awc2024', date '2024-09-11', date '2024-12-21'),
    ('awc2023', date '2023-09-11', date '2023-12-10'),
    ('awc2022', date '2022-09-12', date '2023-03-22'),
    ('awc2021', date '2021-09-13', date '2021-12-05'),
    ('awc2020', date '2020-09-07', date '2020-11-15'),
    ('awc2019', date '2019-09-09', date '2019-11-24'),
    ('awc2018', date '2018-09-24', date '2018-12-22'),
    ('awc2017', date '2017-10-30', date '2017-12-14'),
    ('awc2016', date '2016-09-12', date '2016-12-04')
) as dates(id, start_date, end_date)
where tournament.id = dates.id;

commit;

notify pgrst, 'reload schema';
