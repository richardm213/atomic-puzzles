"""Regression for legacy payouts already reversed before a later accounting audit."""
import runpy
import unittest
from decimal import Decimal
from pathlib import Path

AUDIT = runpy.run_path(str(Path(__file__).with_name('audit-prediction-accounting.py')))['audit']

class PredictionAccountingTest(unittest.TestCase):
    def test_reversed_legacy_payout_is_not_reclaimed_again(self):
        for previous_correction in (False, True):
            with self.subTest(previous_correction=previous_correction):
                ledger = [
                    {'reason': 'tournament_bet_payout', 'source_key': 'tournament-bet-payout:7', 'amount': 10, 'metadata': {'betId': 7}},
                    {'reason': 'tournament_bet_payout', 'source_key': 'tournament-bet-payout-reversal:7', 'amount': -10, 'metadata': {'betId': 7, 'reverses': 'tournament-bet-payout:7'}},
                    {'reason': 'prediction_market_payout', 'source_key': 'prediction-market-payout:market:trader', 'amount': 10, 'metadata': {'marketId': 'market'}},
                ]
                if previous_correction:
                    ledger.append({'reason': 'prediction_reconciliation', 'source_key': 'prediction-history-reconcile:v1:duplicate-legacy-payout:market:trader', 'amount': -10,
                                   'metadata': {'marketId': 'market', 'kind': 'duplicate-legacy-payout'}})
                for row in ledger:
                    row['username'] = 'trader'
                result = AUDIT({
                    'prediction_markets': [{'id': 'market', 'status': 'resolved', 'outcome': 'yes'}],
                    'prediction_fills': [], 'prediction_positions': [{'market_id': 'market', 'username': 'trader', 'outcome': 'yes', 'quantity': 10}],
                    'prediction_legacy_position_credits': [{'source_bet_id': 7, 'market_id': 'market', 'username': 'trader', 'outcome': 'yes', 'quantity': 10}],
                    'tournament_bets': [], 'coin_transactions': ledger,
                })
                self.assertEqual(result['positionErrors'], [])
                if previous_correction:
                    self.assertEqual([row['delta'] for row in result['corrections']], [Decimal('10')])
                else:
                    self.assertEqual(result['corrections'], [])

    def test_raw_and_bundled_fees_must_match_the_executed_trade(self):
        fee_audit = runpy.run_path(str(Path(__file__).with_name('audit-prediction-accounting.py')))['audit_trade_fees']
        fill = {'id': 1, 'market_id': 'market', 'quantity': 10, 'price_cents': 50, 'buyer_username': 'trader',
                'seller_username': None, 'pair_key': 'pair', 'taker_order_id': 7}
        for bundled in (False, True):
            with self.subTest(bundled=bundled):
                receipt = {'username': 'trader', 'reason': 'prediction_order_reserve' if bundled else 'prediction_trade_fee',
                           'amount': -5.2 if bundled else -0.2, 'metadata': {'marketId': 'market', 'orderId': 7}}
                if bundled:
                    receipt['metadata']['fee'] = 0.2
                result = fee_audit({'prediction_fills': [fill], 'coin_transactions': [receipt]})
                self.assertEqual(len(result), 1)
                self.assertEqual(result[0]['expected'], Decimal('0.1'))
                if bundled:
                    receipt['metadata']['fee'] = 0.1
                else:
                    receipt['amount'] = -0.1
                self.assertEqual(fee_audit({'prediction_fills': [fill], 'coin_transactions': [receipt]}), [])

    def test_missing_taker_fee_and_reset_duplicate_fees_are_detected(self):
        fee_audit = runpy.run_path(str(Path(__file__).with_name('audit-prediction-accounting.py')))['audit_trade_fees']
        result = fee_audit({
            'prediction_orders': [{'id': 7, 'market_id': 'market', 'username': 'trader'}],
            'prediction_fills': [{'taker_order_id': 7, 'market_id': 'market', 'quantity': 10,
                                 'price_cents': 50, 'buyer_username': 'trader',
                                 'seller_username': None, 'pair_key': 'pair'}],
            'coin_transactions': [],
        })
        self.assertEqual([(r['expected'], r['actual']) for r in result], [(Decimal('0.1'), Decimal('0'))])
        # A partial prepaid order executed 10 at 50c; the rest was unreserved.
        # Its later market-reset refund returned principal, while fees remained.
        receipts = [
            {'username': 'trader', 'amount': -10.2, 'reason': 'prediction_order_reserve',
             'metadata': {'marketId': 'market', 'orderId': 7, 'fee': 0.2}},
            {'username': 'trader', 'amount': 5, 'reason': 'prediction_order_refund',
             'metadata': {'marketId': 'market', 'orderId': 7}},
            {'username': 'trader', 'amount': 5, 'reason': 'prediction_order_refund',
             'metadata': {'marketId': 'market', 'kind': 'filled-bets-reset'}},
        ]
        data = {'prediction_fills': [], 'coin_transactions': receipts}
        self.assertEqual(fee_audit(data)[0]['expected'], Decimal('0.1'))
        receipts[0]['amount'] = -10.1
        receipts[0]['metadata']['fee'] = 0.1
        self.assertEqual(fee_audit(data), [])

if __name__ == '__main__':
    unittest.main()
