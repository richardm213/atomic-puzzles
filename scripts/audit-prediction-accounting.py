#!/usr/bin/env python3
"""Read-only audit of every prediction settlement, including signed legacy payout reversals."""
from __future__ import annotations
import argparse
import json
import os
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

ZERO = Decimal(0)
SCALE = Decimal('0.000001')
VERSION = 'prediction-accounting-v2'
TABLES = ('prediction_markets', 'prediction_fills', 'prediction_positions',
          'prediction_position_nettings', 'prediction_legacy_position_credits',
          'tournament_bets', 'tournament_betting_markets', 'prediction_orders')

def number(value):
    return Decimal(str(value))

def money(value):
    return value.quantize(SCALE, rounding=ROUND_HALF_UP)

def load_live():
    root = Path(__file__).resolve().parents[1]
    for line in (root / '.env.local').read_text().splitlines():
        if '=' in line and not line.startswith('#'):
            key, value = line.split('=', 1)
            os.environ.setdefault(key, value.strip().strip('"\''))
    base = os.environ.get('VITE_SUPABASE_URL') or os.environ.get('SUPABASE_URL')
    if base != 'https://arkicplonaruvmhhvwxd.supabase.co':
        raise ValueError('Use the current Supabase database')
    key = os.environ['SUPABASE_SERVICE_ROLE_KEY']
    def read(table, params=None):
        rows = []
        for offset in range(0, 1000000, 1000):
            query = {'select': '*', 'limit': 1000, 'offset': offset, **(params or {})}
            request = urllib.request.Request(base + '/rest/v1/' + table + '?' + urllib.parse.urlencode(query),
                                            headers={'apikey': key, 'Authorization': 'Bearer ' + key})
            with urllib.request.urlopen(request, timeout=30) as response:
                page = json.load(response)
            rows.extend(page)
            if len(page) < 1000:
                return rows
        raise ValueError('Audit pagination limit exceeded')
    data = {table: read(table) for table in TABLES}
    data['coin_transactions'] = read('coin_transactions', {'order': 'id', 'or':
        '(reason.like.prediction_*,reason.like.tournament_bet*)'})
    return data

def legacy_bet_id(row):
    metadata = row.get('metadata') or {}
    if metadata.get('betId') is not None:
        return str(metadata['betId'])
    source = metadata.get('reverses') or row['source_key']
    for prefix in ('tournament-bet-payout:', 'tournament-bet-payout-reversal:', 'tournament-bet-refund:'):
        if source.startswith(prefix):
            return source.removeprefix(prefix)
    return None

def audit_trade_fees(data):
    paid = defaultdict(lambda: ZERO)
    for row in data['coin_transactions']:
        metadata = row.get('metadata') or {}
        if row['reason'] == 'prediction_trade_fee':
            fee = -number(row['amount'])
        elif row['reason'] in ('prediction_order_reserve', 'prediction_trade_credit'):
            fee = number(metadata.get('fee', 0))
        else:
            continue
        if fee and metadata.get('orderId') is not None:
            paid[metadata.get('marketId'), row['username'], metadata['orderId']] += fee
    by_order = defaultdict(list)
    for fill in data['prediction_fills']:
        if fill.get('taker_order_id') is not None:
            by_order[fill['taker_order_id']].append(fill)
    # Enumerate executed taker orders too: iterating paid fees alone misses a fee
    # that was never charged. Historical fixtures can supply only their receipts.
    keys = set(paid)
    for order in data.get('prediction_orders', []):
        if order['id'] in by_order:
            keys.add((order['market_id'], order['username'], order['id']))
    errors = []
    for market, username, order in sorted(keys):
        actual = paid[market, username, order]
        fills = [fill for fill in by_order[order] if fill['seller_username'] == username or (
            fill['buyer_username'] == username and not (fill['pair_key'] and fill['seller_username']))]
        if fills:
            expected = sum((money(number(fill['quantity']) * number(fill['price_cents']) / 100 * Decimal('0.02')) for fill in fills), ZERO)
        else:
            # Resets deleted some old fills/orders but retained their cash receipts.
            # Principal after price-improvement/unfilled-order refunds still proves
            # the executed value. Reset refunds omit orderId and do not erase fees.
            receipts = [row for row in data['coin_transactions']
                        if row['username'] == username and
                        (row.get('metadata') or {}).get('marketId') == market and
                        (row.get('metadata') or {}).get('orderId') == order and
                        row['reason'] in ('prediction_order_reserve', 'prediction_trade_credit', 'prediction_order_refund')]
            if not receipts:
                continue
            principal = sum((number(row['amount']) + number((row.get('metadata') or {}).get('fee', 0)) for row in receipts), ZERO)
            expected = money(abs(principal) * Decimal('0.02'))
        if abs(expected - actual) > SCALE:
            errors.append({'marketId': market, 'username': username, 'orderId': order,
                           'expected': expected, 'actual': actual})
    return errors

def audit(data):
    markets = {row['id']: row for row in data['prediction_markets']}
    quantities = defaultdict(lambda: {'yes': ZERO, 'no': ZERO})
    fill_counts = Counter()
    for row in data['prediction_legacy_position_credits']:
        quantities[row['market_id'], row['username']][row['outcome']] += number(row['quantity'])
    for row in data['prediction_fills']:
        market, outcome, qty = row['market_id'], row['outcome'], number(row['quantity'])
        fill_counts[market] += 1
        if not (row['pair_key'] is not None and row['seller_username'] is not None):
            quantities[market, row['buyer_username']][outcome] += qty
        if row['seller_username']:
            quantities[market, row['seller_username']][outcome] -= qty
    credits = {str(row['source_bet_id']): row for row in data['prediction_legacy_position_credits']}
    settlement_cash = defaultdict(lambda: ZERO)
    net_cash = defaultdict(lambda: ZERO)
    trade_cash = defaultdict(lambda: ZERO)
    reset_markets = set()
    correction_cash = defaultdict(lambda: ZERO)
    ledger = data['coin_transactions']
    for row in ledger:
        metadata = row['metadata'] or {}
        key = metadata.get('marketId'), row['username']
        amount = number(row['amount'])
        if row['reason'] == 'prediction_market_payout':
            settlement_cash[key] += amount
        if row['source_key'].startswith('prediction-position-net:'):
            net_cash[key] += amount
        if row['reason'] == 'tournament_bet_payout':
            credit = credits.get(legacy_bet_id(row))
            if credit:
                settlement_cash[credit['market_id'], row['username']] += amount
        if row['reason'] in ('prediction_order_reserve', 'prediction_order_refund', 'prediction_trade_credit'):
            trade_cash[key] += amount + number(metadata.get('fee', 0))
        if metadata.get('kind') == 'filled-bets-reset':
            reset_markets.add(key[0])
        if row['reason'] == 'prediction_reconciliation':
            correction_cash[key, metadata.get('kind')] += amount
    corrections, checked, position_errors, open_redemption_errors = [], [], [], []
    live = defaultdict(lambda: {'yes': ZERO, 'no': ZERO})
    for row in data['prediction_positions']:
        live[row['market_id'], row['username']][row['outcome']] = number(row['quantity'])
    for key in sorted(set(quantities) | set(settlement_cash) | {key for key in live if key[1] != "prediction_admin"}):
        market_id, username = key
        market = markets[market_id]
        gross = quantities[key]
        paired = min(gross.values()) if username != 'prediction_admin' else ZERO
        desired = {side: gross[side] - paired for side in ('yes', 'no')}
        if desired != live[key]:
            position_errors.append({'marketId': market_id, 'username': username,
                                    'expected': desired, 'actual': live[key]})
        if market['status'] == 'resolved':
            price = Decimal(1) if market['outcome'] == 'yes' else ZERO if market['outcome'] == 'no' else number(market['settlement_price_cents']) / 100
            expected = money(gross['yes'] * price + gross['no'] * (1 - price))
            actual = settlement_cash[key] + net_cash[key] + correction_cash[key, 'duplicate-legacy-payout']
            item = {'marketId': market_id, 'username': username, 'kind': 'duplicate-legacy-payout',
                    'expectedCash': expected, 'previousCash': actual, 'delta': money(expected - actual)}
            checked.append(item)
            if item['delta']:
                corrections.append(item)
        elif paired != net_cash[key] and market_id not in reset_markets:
            open_redemption_errors.append({'marketId': market_id, 'username': username,
                                          'expected': paired, 'actual': net_cash[key]})
    # Old "filled-bets-reset" operations deleted the fills. Reconcile their cash receipts,
    # including complete-set redemptions, rather than inventing the missing trades.
    # Keep the original fee policy: these resets returned trading principal, not fees.
    for key, cash in sorted(trade_cash.items()):
        market_id, username = key
        if market_id not in reset_markets or fill_counts[market_id] or any(live[key].values()):
            continue
        actual = cash + correction_cash[key, 'cancelled-market-reset']
        if actual:
            corrections.append({'marketId': market_id, 'username': username,
                                'kind': 'cancelled-market-reset', 'expectedCash': ZERO,
                                'previousCash': actual, 'delta': money(-actual)})
    # Every unconverted legacy bet remains its own entitlement. Converted ones were
    # included above; counting their old receipts twice is the original production bug.
    legacy_paid = defaultdict(lambda: ZERO)
    for row in ledger:
        if row['reason'] in ('tournament_bet_payout', 'tournament_bet_refund'):
            legacy_paid[legacy_bet_id(row)] += number(row['amount'])
    legacy_errors = []
    for bet in data['tournament_bets']:
        if str(bet['id']) in credits:
            continue
        expected = number(bet['potential_payout']) if bet['status'] == 'won' else number(bet['total_cost']) if bet['status'] == 'refunded' else ZERO
        if expected != legacy_paid[str(bet['id'])]:
            legacy_errors.append({'betId': bet['id'], 'expected': expected, 'actual': legacy_paid[str(bet['id'])]})
    return {'version': VERSION, 'counts': {key: len(value) for key, value in data.items()},
            'settledMarketUsersChecked': len(checked), 'corrections': corrections,
            'positionErrors': position_errors, 'openRedemptionErrors': open_redemption_errors,
            'legacyErrors': legacy_errors, 'feeErrors': audit_trade_fees(data), 'settlements': checked}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--snapshot', type=Path)
    parser.add_argument('--report', type=Path, required=True)
    args = parser.parse_args()
    data = json.loads(args.snapshot.read_text()) if args.snapshot else load_live()
    report = audit(data)
    args.report.write_text(json.dumps(report, default=str, indent=2))
    print(json.dumps({key: value for key, value in report.items() if key != 'settlements'}, default=str))

if __name__ == '__main__':
    main()
