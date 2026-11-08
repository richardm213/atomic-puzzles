# AWC 2026 GitHub forum worker

GitHub Actions checks the AWC results thread from page 18 through the last page
at 12:07 a.m., 4:07 a.m., 8:07 a.m., 12:07 p.m., 4:07 p.m., and 8:07 p.m. Pacific.
From November 8 through November 9, 2026 (UTC), it checks at seven minutes past
every hour instead. Starting November 10 at 00:00 UTC, it automatically returns to
the four-hour Pacific schedule. Manual runs remain available. The temporary cron
is date-guarded so it cannot reactivate next November.

The script uses no AI or Codex. GitHub may delay scheduled runs; a late announcement
can still miss the next run before kickoff.

The worker reads each original forum post, excluding quoted text. It accepts scores
and kickoff times only from HowlinD, AtomicWorldChamp, or a player in that matchup.
It writes clear knockout results to Supabase, advances both players where applicable,
and links the complete archived match. If the game
is public but its match is not yet archived, the worker can record the score and
pick up the archive link in a later run. It publishes future kickoffs from explicit
UTC/GMT announcements and writes the same `scheduled_at` field read by the bracket's
linked countdown page. Deploy the existing scheduled-match UI before enabling writes.

Ambiguous slots, conflicting scores, changed kickoffs, withdrawals, and other
nonstandard posts are left for review in the run summary. Nothing in this workflow
writes to betting markets, orders, payouts, notifications, or Atomic Tour rankings.
The production bracket is the source of truth. GitHub does not have access to the
gitignored development CSV; refresh it separately if local parity is needed.

## Enable publishing

1. In the **current** Supabase project, use the SQL editor in **Firefox** to apply
   `supabase/awc_2026_forum_worker.sql`. This assumes the bracket's `scheduled_at`
   column already exists; it does not run any betting or kickoff migrations.
2. Generate a new random 64-character lowercase hexadecimal token (32 random bytes).
   Store it as the GitHub Actions repository secret `AWC_BRACKET_TOKEN`. Never use
   a Supabase service-role key for this. Store only the lowercase hex SHA-256 digest
   of the token's **text**, without a trailing newline, in Supabase Vault as
   `awc_2026_forum_worker_sha256` (unique name). For example, generate a token locally
   with `openssl rand -hex 32`; hash its text with `printf '%s' "$token" | openssl dgst -sha256`.
3. Add the repository variables `AWC_SUPABASE_URL` and `AWC_SUPABASE_ANON_KEY`
   from the current project's public client settings. Leave `AWC_PUBLISH` unset.
4. Merge the workflow to the default branch and run **AWC 2026 forum sync** manually
   from GitHub Actions. Check the read-only summary and confirm the countdown page
   is deployed. Set the repository variable `AWC_PUBLISH` to `true` and run once
   more to verify the bracket-only credential and read-back. No Codex schedule should
   be active.

To stop publishing, unset `AWC_PUBLISH`. To stop checking entirely, disable the
workflow in GitHub Actions. Revoke the Vault hash to remove all worker write access.
