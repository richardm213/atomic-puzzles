# AWC 2026 scheduling worker

The **AWC 2026 schedule sync** GitHub workflow checks the official
[rounds-and-results thread](https://lichess.org/forum/team-atomic-wc/2026-awc-rounds-and-results)
from page 18 through its current last page. It runs at **00:17, 04:17, 08:17,
12:17, 16:17, and 20:17 UTC**, through **December 8, 2026 UTC**. Its next scheduled
run disables the workflow. The script and database credential independently reject
publishing after the cutoff. GitHub can delay scheduled runs.

This worker only changes `tournament_matches.scheduled_at` for a uniquely matched,
unplayed `awc2026` fixture. The deployed bracket and linked countdown page already
read that field. It cannot publish scores, advancement, archived match IDs, tour
points, market resolutions, payouts, or bettor notifications. Existing kickoff
triggers can still shorten admin quote expirations, as designed.

The older **AWC 2026 forum sync** workflow remains disabled. Do not enable it as
part of operating this scheduling worker.

## Announcement handling

- Accept announcements from HowlinD, AtomicWorldChamp, or either participant.
- Read original post text; quoted text may identify the pairing/date for an explicit
  new reschedule, but a quote or a spectator reply cannot schedule a match by itself.
- Handle UTC/GMT clocks, AM/PM, `1500 UTC`, month/day dates, weekdays,
  today/tomorrow, explicit UTC offsets, and precise "starting in N minutes" posts.
- Use the existing TolyaStarina0991 → tolya_starina0995 alias.
- Leave approximate times, conflicting dates, unsupported time zones, ambiguous
  pairings, and unspecified reschedules in the GitHub run summary for review.
- Do not replace an existing different kickoff without an explicit reschedule.
- Preserve bracket player order, reject completed matches, verify read-back, and
  record source post ID/time/URL in `awc_2026_schedule_receipts`. Replayed older
  announcements cannot overwrite a newer receipt. Concurrent kickoff edits fail
  instead of overwriting someone else's change.

No AI service or Supabase service-role key is used by GitHub. The sync job has
read-only repository permissions. A separate expiry job has Actions write access
solely to disable this workflow at the end of its one-month window.

## Credentials and installation

Apply `supabase/awc_2026_schedule_worker.sql` in **Firefox**, using the current
Supabase project. Generate a fresh 32-byte hexadecimal token; save it as GitHub
secret `AWC_SCHEDULE_TOKEN`. Store the lowercase SHA-256 hash of the token's text
(no newline) in Vault as `awc_2026_schedule_worker_sha256`. Do not reuse the older
bracket/result token.

The workflow reuses the public repository variables `AWC_SUPABASE_URL` and
`AWC_SUPABASE_ANON_KEY`. Manual runs default to dry run; set `dry_run=false`
explicitly to publish. Scheduled runs publish within the time window.

To stop immediately, disable `awc-2026-schedules.yml` in GitHub Actions. To revoke
its database write access, remove its Vault hash.

## Historical verification

The November 8 audit downloaded all **170 posts across pages 1–17** and checked
every original post against an independently reviewed expectation manifest. It
recognized **41 precise scheduling announcements**, including the four explicit
reschedules on those pages, and replayed their kickoff publication plans against
isolated in-memory fixtures. Historical schedules are never written to production.
The six posts requiring review were:

| Post                                                                                              | Reason                                                                 |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [MtBBIm4T](https://lichess.org/forum/team-atomic-wc/2026-awc-rounds-and-results?page=1#MtBBIm4T)  | Approximate "around ten minutes"                                       |
| [VodLfzcU](https://lichess.org/forum/team-atomic-wc/2026-awc-rounds-and-results?page=4#VodLfzcU)  | Conflicting relative and absolute time; stated clock precedes the post |
| [CzNcdAdM](https://lichess.org/forum/team-atomic-wc/2026-awc-rounds-and-results?page=6#CzNcdAdM)  | 15–30 minute delay without a unique pairing or precise kickoff         |
| [5gU9rvW0](https://lichess.org/forum/team-atomic-wc/2026-awc-rounds-and-results?page=9#5gU9rvW0)  | Approximate "around 20:10" reschedule                                  |
| [gXcqOQEA](https://lichess.org/forum/team-atomic-wc/2026-awc-rounds-and-results?page=12#gXcqOQEA) | Announcement from neither an organizer nor a participant               |
| [t48Y6m6e](https://lichess.org/forum/team-atomic-wc/2026-awc-rounds-and-results?page=16#t48Y6m6e) | Rescheduling announced without a replacement time                      |

Re-run the complete live-source audit with:

```sh
node scripts/sync-awc-2026-schedules.mjs --audit-history
node --test scripts/sync-awc-2026-schedules.test.mjs
```

The committed fixture records the 47 scheduling-related source posts and their
expected disposition; every other historical post must produce no schedule or
review. New or edited historical content causes an audit mismatch rather than
silently changing the expectation.

Database tests in `supabase/tests/awc_2026_schedule_worker.sql` verify initial
publishing, replay, explicit rescheduling, stale announcements, concurrent edits,
completed-match protection, wrong players, and credential separation. Execute them
in Firefox with the worker token supplied locally as `awc.test_worker_token`;
the transaction rolls back its test fixture and receipt.
