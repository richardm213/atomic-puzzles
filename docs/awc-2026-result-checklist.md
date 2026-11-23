# AWC 2026 result checklist

Use this checklist whenever the user reports an AWC 2026 result.

The admin **Markets** page (`/admin/markets`) handles these steps together. Select the match
strike, enter the score, date and result type, review the automatic archive match and settlement
preview, then click **Resolve and publish**. The guarded database transaction updates both bracket
paths, event awards/rankings/entries, applicable match and championship markets, payouts and
notifications. It saves a receipt and rolls everything back if verification fails. Retrying a
completed request returns the receipt without paying again. Withdrawals use a fair trade price,
or refund original holdings if there were no trades. Only explicitly allow an unlinked match
when the archive is genuinely unavailable; link it after ingestion.

The steps below also cover manual result updates. Do not rerun the points updater or send
additional notifications after a successful admin-page settlement.

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
   - Resolve the prediction match strike and applicable championship strikes, cancelling remaining
     open orders safely. Sportsbook view trades these same prediction contracts.
   - Resolve Losers Round 3 score and spread strikes from the score at the clinch. If Rechesster
     clinches by exactly two points, both sides of the Rechesster −2 / Quasabianth +2 strike pay
     50¢ per contract. Verify the clinch in the archived game sequence, install
     `supabase/awc2026_rechesster_spread_push.sql` if needed, and call
     `resolve_awc2026_rechesster_spread_push` with the archive match ID and the two clinching scores
     in Rechesster–Quasabianth order. Verify the ledger and settlement notifications.
   - Imported positions in `prediction_position_credits` already represent the former fixed-price
     bets. They settle once through the prediction resolver; never pay the read-only archives.

5. **Send resolution notifications**
   - Notify every bettor, including losers.
   - Use the exact score with an en dash, for example `Jakestatefarm won 5.5–0.5.`
   - Winners receive the total non-duplicate amount added at settlement, rounded to the
     nearest hundredth of a coin. Losers receive `No payout`.
   - Verify the notification count, recipients, wording, links, and payout amounts after settlement.

6. **Verify production**
   - Read back the bracket row, downstream advancement, market status/outcome, payout transactions,
     notifications, and Atomic Tour awards.
   - Report the result, advancement, points, payout/notification completion, and whether the archived
     match was linked.
