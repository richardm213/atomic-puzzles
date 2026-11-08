# AWC 2026 result checklist

Use this checklist whenever the user reports an AWC 2026 result.

1. **Record the result**
   - Update the exact `awc2026` row in the current Supabase database.
   - Store the exact score, match date, and outcome type.
   - Confirm the winner advances to `winner_to` and the loser appears at `loser_to` when applicable.

2. **Link the archived match**
   - Search the current Turso archive for the complete match between the two players in the relevant
     date range and mode.
   - Store the archive match ID, not an individual game ID.
   - Never invent a link. If ingestion has not happened yet, leave it unlinked, report that clearly,
     and link it when the archive row becomes available.

3. **Update Atomic Tour points**
   - Run the event-scoped `awc2026` ranking updater after the bracket result is published.
   - Verify the winner and loser received the correct stage awards and dates.

4. **Resolve every applicable market**
   - Settle the legacy fixed-price match market and the prediction order-book market, if both exist.
   - Resolve to the correct player/outcome and cancel remaining open orders safely.
   - Pay every winning bettor across both systems. Preserve original/legacy bets and order-book
     positions as separate legitimate bets, while combining them when presenting the bettor's total
     payout or profit for the resolved matchup.

5. **Send resolution notifications**
   - Notify every bettor, including losers.
   - Use the exact score with an en dash, for example `Jakestatefarm won 5.5–0.5.`
   - Winners receive the total amount added across all applicable betting systems, rounded to the
     nearest hundredth of a coin. Losers receive `No payout`.
   - Verify the notification count, recipients, wording, links, and payout amounts after settlement.

6. **Verify production**
   - Read back the bracket row, downstream advancement, market status/outcome, payout transactions,
     notifications, and Atomic Tour awards.
   - Report the result, advancement, points, payout/notification completion, and whether the archived
     match was linked.
