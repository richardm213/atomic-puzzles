do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'puzzle_progress'
      and policyname = 'Allow puzzle leaderboard reads'
  ) then
    create policy "Allow puzzle leaderboard reads"
    on public.puzzle_progress
    for select
    to anon, authenticated
    using (true);
  end if;
end
$$;
