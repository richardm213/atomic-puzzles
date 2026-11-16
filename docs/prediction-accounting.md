# Prediction accounting

A trader has one net position per strike. Buying the opposite outcome redeems matched Yes/No
contracts for one coin per pair immediately. Buying 2,000 No while holding 1,000 Yes leaves
1,000 No; selling those 1,000 Yes first and then buying 2,000 No leaves 2,000 No. Netting cancels
resting sells on the old exposure and releases their reservations in the same transaction.
The internal liquidity account is excluded from this trader rule.

`shared/domain/predictionAccounting.ts` replays actual legacy credits, fills and recorded pair
redemptions. Replay the recorded events rather than assuming old opposing purchases were netted:
netting was introduced after some positions had already been sold. Same-transaction redemptions
must follow the fills that funded them so remaining contracts retain their proper cost.
Bet history and wallet summaries share this calculation through
`netlify/lib/predictionPositions.ts`, which also owns the paginated credit, trade and netting reads. History emits one row per trader/strike,
including realized gain, rather than treating old settlement snapshots as current holdings.

Cost is the weighted cost basis of the remaining shares, including their purchase fees. Selling
removes the corresponding average cost; buying the opposite side redeems the matching shares
and realizes that part of the gain or loss. Sale fees reduce sale proceeds. Average price is the
remaining all-in cost divided by remaining quantity. The UI consumes that one server summary;
it does not net holdings a second time or reconstruct P&L from lifetime spending.

Historical fees are embedded in their original purchase or sale receipts under `metadata.fee`.
Original fee rows and trade receipts are retained in the private fee-history archive. Consolidating
these rows preserves every wallet and ledger total; fee metadata prevents double counting.

Sportsbook view and order-book view place the same prediction orders. There is no second bet,
price, position or payout system. Imported purchases live in `prediction_position_credits`, with
an exact all-in cost, fee, original purchase date, outcome and source key. History and coin
rankings read these records directly; they never join the old sportsbook tables. The original
purchase receipts retain their amounts, IDs and dates and link to the credit with
`metadata.positionCreditId`, so replay counts each fee once.

The former fixed-price tables are read-only private archives, retained for audit and safe
rollout to earlier deployments. Their purchase/refund/settlement RPCs and bracket settlement
trigger are retired. Neither archived statuses nor archived payout fields affect active bets.
All 87 historical bets were imported, including 14 still-open bets belonging to eight users.
Each original selection, quantity and price was checked against its prediction strike. The
migration changes no wallet balance, live holding, open order or past payout.

Apply `supabase/prediction_canonical_history.sql` and the current `supabase/market_admin.sql`
together in one Firefox SQL transaction after the earlier exchange migrations. The migration
archives the original records, rejects unmapped or inconsistent bets, and is safe to repeat.

## Safe order retries and terminal results

User orders go through `place_prediction_order_once`, with a request UUID scoped to the authenticated
username and bound to the exact order parameters. The receipt commits with the order. Retries return
the original order and the current wallet balance. The client keeps uncertain requests across page
reloads and errors, and coalesces simultaneous submissions. Only confirmed success or a database-confirmed rejection clears the request;
a later identical purchase gets a new UUID. Sportsbook retries retain the original execution quote
for the same budget. The error action retries the original order even if available holdings change.

The low-level payout functions accept only open/closed markets or an exact repeat of the same
completed settlement. A refunded market cannot be settled again, and a fair-price result cannot be
silently treated as a binary result. Apply `supabase/prediction_request_safety.sql` after the canonical
history migration; its rollback regression is `supabase/tests/prediction_request_safety.sql`.

Market refunds appear in trader history even for imported holdings. Returned principal offsets the
remaining cost once, preserving realized trading P&L. The audit independently checks refunded costs,
including fees and nettings, plus paired liquidity collateral; it flags missing and excessive refunds.

## Audit and correction

Run the read-only audit against the current project:

```sh
python3 scripts/audit-prediction-accounting.py --report /tmp/prediction-audit.json
```

It independently reconciles contract quantities and payouts across all settled strikes, open pair
redemptions, and imported positions. For old resets that deleted fills, use immutable cash
receipts to restore principal while preserving the reset's original fee policy. Do not invent
trades or refund liquidity inventory that still exists.

When a historical payout needs repair, prepare a guarded transaction in Firefox against the
current database. Archive the complete original receipts, affected wallets, and any removed
notifications in a private audit table before modifying the active history. Consolidate duplicate
settlements into one correct original payout and incorporate refund fixes into their original
refund. Reconcile each wallet by the exact difference between the old and rewritten receipts;
do not add correction transactions. Check full receipt snapshots before writing and make the
archive key idempotent. Re-audit payouts, wallet deltas, and notifications after committing.
Do not overwrite wallets with ledger sums: historical opening balances can predate ledger entries.

The current regression fixtures in `supabase/tests/prediction_accounting.sql` and
`supabase/tests/market_admin.sql` roll back all fixtures. Apply
`supabase/notification_paths.sql` for internal notification links with query parameters.
