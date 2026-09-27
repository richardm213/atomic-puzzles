-- Ensure vote totals use the querying role's permissions and RLS policies.

alter view if exists public.puzzle_vote_counts
  set (security_invoker = true);

notify pgrst, 'reload schema';
