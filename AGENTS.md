# Repository Instructions

## Tournament bracket result updates

Follow this playbook whenever a user asks to copy tournament results from a forum or announcement into a bracket and link the matches.

### Source of truth

- Production brackets read from the Supabase `tournament_matches` table.
- Development brackets read from `data/tournaments/tournament_matches.csv`.
- The tournament catalog and bracket-generation rules live in `src/lib/matches/tournaments.ts`.
- Match pages read archived matches from `blitz_matches`, `bullet_matches`, `hyper_matches`, or `wolfrandom_matches`, depending on the tournament's `matchMode`.
- Tournament CSV files are intentionally gitignored. Update them for local parity, but do not mistake a clean `git status` for a failed edit.

### Fast workflow

1. **Identify the tournament and mode**
   - Read its entry in `src/lib/matches/tournaments.ts`.
   - Read the tournament's existing rows from the local CSV and Supabase before changing anything.

2. **Fetch the complete result thread**
   - Download every pagination page, not only page 1.
   - Extract each post's author, timestamp, post ID, and `.forum-post__message-source` text.
   - Treat explicit result posts as authoritative. Ignore scheduling-only posts.

3. **Resolve each result to the archived match**
   - A forum's “last game” URL is usually a game ID, not the bracket's `match_id`.
   - Query the correct match table by both players and the relevant date range.
   - Select the archive row whose `games` array contains the forum game ID.
   - Store that row's `match_id` in `tournament_matches.match_id`; this makes the bracket card open the complete match.
   - Account for canonical aliases already used by the site. Prefer the names in tournament seeds, existing bracket rows, and archived match rows over display-name variations in forum posts.
   - If the forum gives an incomplete score such as `16-smth`, calculate the precise score from the matched archive row's `games` array and confirm it agrees with the reported winner.
   - Never invent a link. Withdrawals, forfeits, and unarchived matches should have a null/blank `match_id`.

4. **Place the result in the bracket**
   - Use the established round names and IDs, for example `Quarterfinals`, `Semifinals`, and `Finals`.
   - Use the pairing tree to determine `order`; do not rely on a forum label such as “Semifinal 1” if it conflicts with feeder order.
   - Keep player order consistent with the bracket feeders. Scores may be reordered from the archived match row when necessary.
   - Encode a withdrawal as `1–0` or `0–1` with no `match_id`; the UI renders this as an advancement/withdrawal instead of a played score.
   - Let `addEmptyMainBracketRounds` infer downstream players and `winner_to` when the current tournament is configured to do so. Do not add speculative future matches.

5. **Update both stores with the smallest safe write**
   - Add or update the local CSV row.
   - For Supabase, first query the exact bracket row ID.
   - If absent, `POST` only the new row.
   - If present, `PATCH` only that row with `?id=eq.<row-id>`.
   - Do not replace or delete the whole `tournament_matches` table for a routine result update.
   - Do not use `on_conflict=id` unless the database has first been confirmed to have a matching unique constraint.

6. **Verify before finishing**
   - Read the published rows back through the anon key.
   - Confirm every non-empty `match_id` exists in the expected archived match table and has the correct players.
   - Run the focused tournament tests, TypeScript typecheck, and production build.
   - Render the tournament route locally and verify:
     - score and winner,
     - correct advancement path,
     - archived matches have `.isClickable`, `role="link"`, and `tabindex="0"`,
     - withdrawals are not clickable,
     - no duplicate bracket row IDs.

### Useful commands and safety

- Load credentials with `set -a; source .env.local; set +a` inside the command that needs them. Never print keys.
- Prefer narrow Supabase REST queries with explicit `select` columns and exact filters.
- Use the service-role key only for the minimal write; use the anon key for discovery and read-back verification.
- Preserve the forum URL and relevant post IDs in working notes so a result can be audited later.

### Completion report

Keep the user-facing response short. State which results were added, which matches were linked, whether any result was a withdrawal/unlinked, and which verification checks passed.
