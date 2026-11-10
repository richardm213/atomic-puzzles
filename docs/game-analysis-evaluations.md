# Saved game evaluations

The game worker and backfill use the same AtomicDB principal-variations endpoint as
the analysis board (`line_count=5&ply_count=5`). Prefer the ranked, backed line;
if it ends early, use a longer legal engine PV for that same root move from the
same response. Some positions still have fewer than five legal moves or fewer
than five available plies. Keep the available data rather than invent a line.

Catalog positions include the initial position and every ply of the setups and
replays on the Openings page. The catalog cache has one row per normalized FEN
and a `fetched_at` timestamp. Game workers never submit or fetch these positions.
The hourly opening worker fetches only missing entries or entries older than
seven days. The game analysis API resolves the saved opening references and
restores the exact game FENs, scores, and ply order before returning the review.

## Rollout and backfill

1. Apply `supabase/game_analysis_openings.sql` in Firefox on the current database.
2. Load `.env.local` and run
   `npx --yes tsx scripts/refresh-game-analysis-depths.ts --apply --openings-only`
   to seed the opening cache.
3. Publish the reader and worker before storing opening references in game rows.
   Before that deploy, use `--keep-inline-openings` for a compatible evaluation
   backfill if needed. That mode preserves the old format temporarily.
4. Use `--apply --compact-only` after deploying to remove embedded opening
   evaluations without requesting non-opening positions. Use `--apply` for the
   full evaluation backfill, or `--apply --game=<id>` for one saved game.
   Do not run two backfills at once. Without `--apply`, the script is read-only.
5. To resume an interrupted full backfill, rerun with the same `--checkpoint`
   path (default: `/tmp/atomic-game-analysis-5x5.ndjson`). Use a new checkpoint
   for a fresh full run. Watch for reported short lines, missing upstream data,
   or conflicting writes. A missing upstream result keeps the prior game eval.

Leave existing shared-cache rows alone during the rollout: the old worker can
still use them. The updated worker and backfill use the dedicated cache for
those FENs, regardless of what the legacy shared cache contains.

### Fill unavailable continuations

Apply `supabase/game_analysis_opening_supplement.sql` in Firefox before deploying
the supplement reader. Point `GAME_ANALYSIS_FILL_ENGINE` at the native
Atomic-Stockfish build corresponding to the browser engine, and
`GAME_ANALYSIS_FILL_NETWORK` at its NNUE file. Run the backfill with both
variables set to supplement gaps after the normal AtomicDB lookup. Add
`--fill-existing` to repair the current saved reviews without requesting new
game positions. The engine preserves the known AtomicDB line prefix and
evaluation; it supplies only missing continuations and move slots. The
separate opening supplement never changes the AtomicDB fetch timestamp.
