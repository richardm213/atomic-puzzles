# Puzzle attempt archiving

Archiving moves the selected attempts out of active progress and preserves them in `public.puzzle_attempt_reset_archives`. The Other Attempts tab reads `public.puzzle_progress`. If the user explicitly asks for a snapshot only, leave active progress intact. Preserve coins by default and make any requested coin adjustment a separately scoped ledger operation.

## Identify the attempts

1. Use Firefox for SQL against the current Supabase database. Read `public.puzzle_progress` and `public.puzzle_attempt_reset_archives` before making changes.
2. Resolve approximate usernames against the requested puzzle, dates, or reviewed group. Identify each selected attempt by its canonical `username`, `puzzle_id`, and exact `first_attempt_at`. If the request refers to a previous archive, match those exact archived identities so later attempts on the same puzzles are preserved. If multiple plausible groups remain, ask which group to use.
3. Check whether the selected attempts are already archived and absent from active progress. If so, verify their rating history and report the existing state. A previous snapshot with a matching active record can be reused for the move after verifying its contents.

## Archive and remove

1. Use a transaction. Save the full progress rows in `attempts`, with any matching pre-removal `puzzle_rating_events` row under `archived_rating_event`. Save the original attempt receipts from `public.coin_transactions` in `coin_transactions`, scoped by canonical username and the exact attempt source key (`attempt:<username>:<puzzle_id>`). Use one stable `backup_key` per user and selected group. Record the time bounds, exact counts, `coins_preserved`, `restorable`, and notes describing the operation. A snapshot of still-active attempts should have `restorable = false`.
2. Verify the archived payloads against the selected source rows before deleting. If the key already exists, reuse it only if the relevant payload matches. Delete only the exact archived identities from `public.puzzle_progress` and check the affected count. Roll back on a mismatch. Preserve the original coin ledger entries and balances unless the user explicitly requests an adjustment.
3. If rated attempts were removed, run `public.rebuild_puzzle_ratings_from_history()` once for the batch in the same transaction. This rebuilds ratings from the remaining active attempts. For a standard move, mark the archive `restorable = true` after the removal succeeds and record the outcome in its notes.

## Verify and report

- Read back the committed archive and confirm that its payloads and counts match. Confirm the exact attempts are absent from active progress and that their rating events are absent. Verify original coin receipts are intact and check any explicitly requested ledger adjustments separately.
- Report the users and attempt counts, whether the attempts were removed from active progress, how coins were handled, and which checks ran. Use focused database checks for a data-only change.
