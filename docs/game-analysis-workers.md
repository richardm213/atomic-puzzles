# GitHub game-analysis workers

`.github/workflows/game-analysis.yml` runs the existing Supabase/AtomicDB queue processors on
GitHub Actions. Netlify still serves `/api/game-analysis`, authenticates requests, and creates
charged jobs; it no longer processes analyses in background or scheduled functions.

The queue has independent submission and result-polling jobs, each with its own concurrency
group. A job checks for work, monitors an active queue for up to twenty minutes, and stops when
it empties. Passes run about once per minute while active, subject to processing time. Existing
Supabase per-game leases, position budgets, AtomicDB rate limits, retries, refunds, and result
notifications remain in the shared processing service.

Scheduled recovery starts every five minutes, offset from the top of the hour. GitHub can delay
scheduled runs. New requests wake the workflow immediately when Netlify has
`GAME_ANALYSIS_GITHUB_TOKEN`: a fine-grained token restricted to this repository with Actions
write permission. The dispatcher coalesces bursts within a running function instance. A failed
wake-up leaves the purchased job queued for scheduled recovery. Without this optional token,
new work waits for a scheduled run or an already-running worker.

Opening-cache refresh runs hourly and retains the existing seven-day per-position TTL.

## Configuration and cutover

GitHub Actions repository secrets:

- `SUPABASE_SERVICE_ROLE_KEY`
- `ATOMICDB_USERNAME` and `ATOMICDB_PASSWORD` (preserve the existing anonymous configuration if empty)
- `TURSO_MATCHES_DATABASE_URL` and `TURSO_MATCHES_AUTH_TOKEN`

The workflow and CLI pin the current Supabase project. Do not use credentials for the legacy project.

1. Install the current worker credentials in repository secrets.
2. Publish the workflow and manually run it with `task=workers` and `once=true`.
3. Verify both jobs succeed before enabling `GAME_ANALYSIS_WORKERS_ENABLED=true` as a repository
   variable and removing the Netlify workers. Existing leases protect in-flight jobs during cutover.
4. Optionally configure `GAME_ANALYSIS_GITHUB_TOKEN` in Netlify's production Functions scope and
   redeploy the API to enable immediate wake-ups.

To stop scheduled processing, set the repository variable to `false` or disable the workflow.
Manual dispatch remains available to repository maintainers.

## Local verification

Load the worker environment without printing its values, then run:

```sh
npx --yes tsx scripts/run-game-analysis-worker.ts poll --once
npx --yes tsx scripts/run-game-analysis-worker.ts submit --once
npx --yes tsx scripts/run-game-analysis-worker.ts openings
```

These commands process real jobs. Automated worker tests mock the queue and upstream services.
