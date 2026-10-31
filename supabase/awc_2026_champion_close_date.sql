-- Keep 2026 AWC champion trading open through December 10, 2026 (UTC).
update public.prediction_markets
set closes_at = '2026-12-11T00:00:00Z',
    updated_at = now()
where group_id = 'awc-2026-champion';
