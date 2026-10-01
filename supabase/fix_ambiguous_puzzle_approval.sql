-- Production hotfix for PGRST203 when approving a queued puzzle.
-- The active function uses (p_queue_id bigint, p_reviewer text, p_puzzle_id bigint).
-- This removes only the stale overload with p_puzzle_id and p_reviewer reversed.

drop function if exists public.approve_queued_puzzle(bigint, bigint, text);

notify pgrst, 'reload schema';
