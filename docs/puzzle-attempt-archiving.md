# Puzzle attempt archiving

Archiving moves the selected attempts out of active progress and preserves them in `public.puzzle_attempt_reset_archives`. The Other Attempts tab reads `public.puzzle_progress`. If the user explicitly asks for a snapshot only, leave active progress intact. Preserve coins by default and make any requested coin adjustment a separately scoped ledger operation.

## Fast attempt and coin corrections

Routine corrections should follow this short path. Add investigation only when a specific fact is missing or a guard fails.

1. **Read the relevant records together.** Use Firefox and the current Supabase database. Fetch the exact player's puzzle progress, move logs, runs, solver state, rating event, related coin receipts, wallet, and matching archive in one scoped query. Return one combined result: the SQL runner may return only the last result set. Resolve approximate usernames here; do not investigate unrelated players or puzzles.
2. **Calculate the correction once.** Use the applicable run stakes, recorded duration, and reward rules. Subtract the existing net coin amount from the intended net amount. Reuse known project functions and table contracts; inspect definitions only to resolve an actual uncertainty. Do not replay schema migrations for a data fix.
3. **Apply one guarded, idempotent transaction.** Lock the player and relevant rows, verify exact attempt IDs/moves/timestamps, and archive the original records and receipts as described below. For a coin-only fix, leave attempts and ratings alone. Post nonzero coin adjustments through `public.post_coin_transaction`, with supported reasons, unique correction source keys, and explanatory metadata. Preserve the original ledger entries.
4. **When promoting a correct retry, preserve that real solve.** Remove the archived incorrect log and replace the immutable first-result row with the retained correct solve's actual timestamp, duration, and move. Update its run's miss count, first-solve color/streak, `solved_move`, and the retained log's rated flag and `progress_result` receipt. Preserve later valid practice cooldown resets. Rebuild ratings **once**, in the same transaction, if rated history changed. Mark mixed snapshots that retain active attempts as requiring manual restoration.
5. **Verify and finish.** Assert affected row counts, the corrected first result and grading summary, removal of the incorrect log, archive contents, unchanged original receipts, and the exact wallet delta. Return a compact committed readback. Do not run frontend tests, builds, browser UI checks, or broad historical audits for a data-only correction. Report the corrected attempt and net coin adjustment, then stop.

## Identify the attempts

1. Use Firefox for SQL against the current Supabase database. Read `public.puzzle_progress` and `public.puzzle_attempt_reset_archives` before making changes.
2. Resolve approximate usernames against the requested puzzle, dates, or reviewed group. Identify each selected attempt by its canonical `username`, `puzzle_id`, and exact `first_attempt_at`. If the request refers to a previous archive, match those exact archived identities so later attempts on the same puzzles are preserved. If multiple plausible groups remain, ask which group to use.
3. Check whether the selected attempts are already archived and absent from active progress. If so, verify their rating history and report the existing state. A previous snapshot with a matching active record can be reused for the move after verifying its contents.

## Archive and remove

1. Use a transaction. Save the full progress rows in `attempts`, with any matching pre-removal `puzzle_rating_events` row under `archived_rating_event`. Include associated `puzzle_solver_states`, `puzzle_runs`, and `puzzle_attempt_move_logs` records in the archived payload so grading history can be restored. Save the original attempt receipts from `public.coin_transactions` in `coin_transactions`, scoped by canonical username and exact source keys. Historical receipts use `attempt:<username>:<puzzle_id>`; graded submissions use `puzzle-run-attempt:<attempt-uuid>`. Use one stable `backup_key` per user and selected group. Record the time bounds, exact counts, `coins_preserved`, `restorable`, and notes describing the operation. A snapshot of still-active attempts should have `restorable = false`.
2. Verify the archived payloads against the selected source rows before deleting. If the key already exists, reuse it only if the relevant payload matches. When resetting the first-result record, remove its archived move logs, runs, and solver state in foreign-key order, then delete the exact archived identity from `public.puzzle_progress` and check the affected counts. If retaining other runs, rebuild the grading summary from retained history. Roll back on a mismatch. Preserve the original coin ledger entries and balances unless the user explicitly requests an adjustment.
3. If rated attempts were removed, run `public.rebuild_puzzle_ratings_from_history()` once for the batch in the same transaction. This rebuilds ratings from the remaining active attempts. For a standard move, mark the archive `restorable = true` after the removal succeeds and record the outcome in its notes.

## Verify and report

- Read back the committed archive and confirm that its payloads and counts match. Confirm the exact attempts are absent from active progress and that their rating events are absent. Verify original coin receipts are intact and check any explicitly requested ledger adjustments separately.
- Report the users and attempt counts, whether the attempts were removed from active progress, how coins were handled, and which checks ran. Use focused database checks for a data-only change.
