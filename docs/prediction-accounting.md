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

To prepare a repair, add `--write-sql /tmp/prediction-corrections.sql`. Inspect the report and SQL,
then execute SQL through Firefox against the current database. Apply `supabase/prediction_accounting.sql`
after the existing exchange migrations. Its regression fixtures live in
`supabase/tests/prediction_accounting.sql` and roll back all fixtures. Rehearse corrections with
rollback before committing, then rerun the live audit and verify wallets and notifications.

Repairs append `prediction_reconciliation` transactions, preserve original receipts, check the
expected prior cash, lock wallets, and notify affected traders. Source keys make reruns harmless.
Only the private reconciliation function may create correction debt. Ordinary debits still require
funds; incoming credits repay a negative wallet, and capped puzzle penalties cannot increase debt.
Do not overwrite wallets with ledger sums: historical opening balances can predate ledger entries.
