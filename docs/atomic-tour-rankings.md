# Atomic Chess Tour Rankings

The Atomic Tour is a rolling points ranking backed by Supabase.

## Event tiers

| Series                        | Champion base points |
| ----------------------------- | -------------------: |
| Atomic World Championship     |                2,000 |
| Chess.com Atomic Championship |                2,000 |
| Atomic Hyper Championship     |                1,000 |
| Atomic Openings Championship  |                1,000 |
| Atomic 960 Elimination        |                1,000 |
| Wolfarena                     |                1,000 |

Atomic Chess League board wins award 100 points in Elite and 50 in Challenger. Draws award half.

Wolfarena points are based on each player’s final standing. The 1,000-point bracket-equivalent
tiers are used: 1st earns 1,000, 2nd earns 600, 3rd–4th earn 360, 5th–8th earn 180, 9th–16th
earn 90, 17th–32nd earn 50, and lower placements earn 20.

Knockout placement percentages are 100% for the champion, 60% for the finalist, 36% for a
semifinalist, 18% for a quarterfinalist, 9% for the round of 16, 5% for the round of 32, and 2%
for the round of 64. In double-elimination events, reaching the winners-bracket final is a separate
48% tier: winning it qualifies a player for the 60% finalist tier but does not make them champion.
The deciding grand-final set, including a reset when played, determines the champion and runner-up.

Losers-bracket wins add bonuses that rise from 2% in the earliest Round-of-64-fed bracket to 16% in
the final losers-bracket round. The scale is anchored to the main-draw round that first feeds the
losers bracket: a bracket starting with Round-of-32 losers begins at 4%, one starting with
Round-of-16 losers begins at 6%, and one starting with quarterfinal losers begins at 10%. A
later-round win is therefore worth more even when a player entered the bracket late. Played wins,
wins by disqualification, and wins by withdrawal all count; only byes are excluded. Grand Finals
and Grand Final resets do not earn a bonus. For
non-champions, the bonus is capped ten points below the next winners-bracket tier and at 20% of
the event maximum overall. A champion who returned through the losers bracket keeps a smaller bonus
capped at 10% of the event maximum, so a 2,000-point champion can finish with up to 2,200 and a
1,000-point champion with up to 1,100.

Byes do not earn points. Following the ATP rule, a player who advances by bye and then loses their
first played match receives only the event's first-round loser points. A played win advances the
player to the next guaranteed point tier.

Qualifier wins are scored by distance from the main draw rather than by the displayed round name.
The final AWC qualifying round awards 2% of the event maximum, the preceding round 1.5%, and an
earlier third round 1%. A one-round AWC qualifying draw therefore awards 2%, while a three-round
draw awards 1%, 1.5%, and 2% in sequence. Atomic 960 group-stage wins are a fixed 20 points each.
Played wins and wins by disqualification count. Qualifier walkovers do not, except for an AWC Q2
walkover after a played Q1 win. Byes and unplayed pairings do not earn points.

## Ranking behavior

- Rankings use standard competition ranking (`1, 2, 2, 4`).
- A live snapshot and historical monthly snapshots are stored in
  `atomic_tour_ranking_snapshots`. Historical months are included only when an award was earned or
  expired, so inactive months do not clutter the date picker.
- Each award expires at the end of the month 25 months after its match month. For example, a match
  played in September 2024 expires on October 31, 2026, while matches played later in the same
  tournament expire in later months.
- Players in `atomic_tour_excluded_players` do not appear in rankings or receive point credit.

## Publishing data

1. Apply `supabase/atomic_tour_rankings.sql` to the current Supabase database.
2. Load the production environment without printing credentials.
3. Bundle and run `scripts/rebuild-atomic-tour-rankings.ts`:

```sh
set -a; source .env.local; set +a
./node_modules/.bin/esbuild scripts/rebuild-atomic-tour-rankings.ts \
  --bundle --packages=external --platform=node --format=esm \
  --outfile=scripts/.rebuild-atomic-tour-rankings.mjs
node scripts/.rebuild-atomic-tour-rankings.mjs
```

The rebuild is idempotent: it replaces the derived point ledger, refreshes every monthly snapshot,
publishes the live snapshot, and rebuilds tournament-entry rank context. Run it after a tour match
is published and when an event end date is finalized.

For a routine new result in an event already in progress, update only that event and the live
ranking. This preserves every historical snapshot instead of rebuilding the Tour from the start:

```sh
set -a; source .env.local; set +a
npx --yes tsx scripts/rebuild-atomic-tour-rankings.ts --event=awc2026
```

Use the full rebuild only for scoring-rule changes, backfilled historical data, or finalized event
metadata.
