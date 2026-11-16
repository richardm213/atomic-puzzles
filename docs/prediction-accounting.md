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
Bet history and wallet summaries share this calculation. History emits one row per trader/strike,
including realized gain, rather than treating old settlement snapshots as current holdings.

Cost is the weighted cost basis of the remaining shares, including their purchase fees. Selling
removes the corresponding average cost; buying the opposite side redeems the matching shares
and realizes that part of the gain or loss. Sale fees reduce sale proceeds. Average price is the
remaining all-in cost divided by remaining quantity. The UI consumes that one server summary;
it does not net holdings a second time or reconstruct P&L from lifetime spending.

Historical fees are embedded in their original purchase or sale receipts under `metadata.fee`.
Original fee rows and trade receipts are retained in the private fee-history archive. Consolidating
these rows preserves every wallet and ledger total; fee metadata prevents double counting.


Converted legacy bets and exchange contracts represent one entitlement. The legacy resolver skips
converted bets, and the exchange resolver deducts any legacy payout made before conversion.
Repeated settlement calls use the same receipt keys and cannot pay again.

## Audit and correction

Run the read-only audit against the current project:

```sh
python3 scripts/audit-prediction-accounting.py --report /tmp/prediction-audit.json
```

It independently reconciles contract quantities and payouts across all settled strikes, open pair
redemptions, and unconverted legacy bets. For old resets that deleted fills, use immutable cash
receipts to restore principal while preserving the reset's original fee policy. Do not invent
trades or refund liquidity inventory that still exists.

The audit includes positive legacy payouts and their signed reversals, linked by bet ID or the
original receipt key. A reversed legacy payout must not be reclaimed again.

When a historical payout needs repair, prepare a guarded transaction in Firefox against the
current database. Archive the complete original receipts, affected wallets, and any removed
notifications in a private audit table before modifying the active history. Consolidate duplicate
settlements into one correct original payout and incorporate refund fixes into their original
refund. Reconcile each wallet by the exact difference between the old and rewritten receipts;
do not add correction transactions. Check full receipt snapshots before writing and make the
archive key idempotent. Re-audit payouts, wallet deltas, and notifications after committing.
Do not overwrite wallets with ledger sums: historical opening balances can predate ledger entries.

Apply `supabase/prediction_accounting.sql` after the existing exchange migrations. Its regression
fixtures live in `supabase/tests/prediction_accounting.sql` and roll back all fixtures. Apply
`supabase/notification_paths.sql` for internal notification links with query parameters.
