#!/usr/bin/env python3
"""Read-only audit of every prediction settlement. Export guarded correction SQL for Firefox."""
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
VERSION = 'prediction-accounting-v1'
TABLES = ('prediction_markets', 'prediction_fills', 'prediction_positions',
          'prediction_position_nettings', 'prediction_legacy_position_credits',
          'tournament_bets', 'tournament_betting_markets')

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
            credit = credits.get(row['source_key'].removeprefix('tournament-bet-payout:'))
            if credit:
                settlement_cash[credit['market_id'], row['username']] += amount
        if row['reason'] in ('prediction_order_reserve', 'prediction_order_refund', 'prediction_trade_credit'):
            trade_cash[key] += amount
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
            legacy_paid[row['source_key'].split(':')[-1]] += number(row['amount'])
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
            'legacyErrors': legacy_errors, 'settlements': checked}

def quote(value):
    return "'" + str(value).replace("'", "''") + "'"

def correction_sql(report):
    if report['positionErrors'] or report['openRedemptionErrors'] or report['legacyErrors']:
        raise ValueError('Resolve quantity or legacy audit errors before posting corrections')
    rows = []
    for item in report['corrections']:
        rows.append('(' + ','.join(quote(item[key]) for key in ('marketId', 'username', 'kind', 'expectedCash', 'previousCash', 'delta')) + ')')
    if not rows:
        return "select 'No prediction accounting corrections required' as result;\n"
    return '''begin;
select pg_advisory_xact_lock(hashtext('prediction-accounting-audit-v1'));
create temp table accounting_corrections(market_id text,username text,kind text,expected numeric,previous numeric,delta numeric) on commit drop;
insert into accounting_corrections values\n''' + ',\n'.join(rows) + ''';
select pg_advisory_xact_lock(hashtext('prediction-market:'||market_id)) from (select distinct market_id from accounting_corrections) m order by market_id;
select a.username from public.coin_accounts a where username in (select username from accounting_corrections) order by username for update;
create temp table accounting_posted(username text,delta numeric) on commit drop;
create temp table accounting_wallets_before on commit drop as select username,balance from public.coin_accounts where username in (select username from accounting_corrections);
do $$
declare r record; actual numeric; source text; total numeric; msg text;
begin
 for r in select * from accounting_corrections order by username,market_id loop
  source:='prediction-history-reconcile:v1:'||r.kind||':'||r.market_id||':'||r.username;
  if exists(select 1 from public.coin_transactions where source_key=source) then continue; end if;
  if r.kind='duplicate-legacy-payout' then
   select coalesce(sum(t.amount),0) into actual from public.coin_transactions t where t.username=r.username and (
    (t.metadata->>'marketId'=r.market_id and (t.reason='prediction_market_payout' or t.source_key like 'prediction-position-net:%'))
    or (t.reason='tournament_bet_payout' and t.source_key in (select 'tournament-bet-payout:'||source_bet_id from public.prediction_legacy_position_credits where market_id=r.market_id and username=r.username))
    or (t.reason='prediction_reconciliation' and t.metadata->>'marketId'=r.market_id and t.metadata->>'kind'=r.kind));
  else
   if exists(select 1 from public.prediction_fills where market_id=r.market_id)
    or exists(select 1 from public.prediction_positions where market_id=r.market_id and username=r.username and quantity>0) then raise exception 'Reset market has new trades'; end if;
   select coalesce(sum(t.amount),0) into actual from public.coin_transactions t where t.username=r.username and t.metadata->>'marketId'=r.market_id and (
    t.reason in ('prediction_order_reserve','prediction_order_refund','prediction_trade_credit')
    or (t.reason='prediction_reconciliation' and t.metadata->>'kind'=r.kind));
  end if;
  if actual<>r.previous then raise exception 'Accounting receipts changed for %, %',r.market_id,r.username; end if;
  perform public.post_prediction_reconciliation(r.username,r.delta,source,jsonb_build_object(
   'auditVersion','prediction-accounting-v1','kind',r.kind,'marketId',r.market_id,
   'expectedCash',r.expected,'previousCash',r.previous,'delta',r.delta));
  insert into accounting_posted values(r.username,r.delta);
 end loop;
 for r in select username,sum(delta) as delta from accounting_posted where username<>'prediction_admin' group by username loop
  source:='prediction-accounting-audit-v1:'||r.username;
  msg:='Betting history corrected: '||case when r.delta>=0 then '+' else '−' end||to_char(abs(r.delta),'FM999,999,990.00')||' coins. See your coin history.';
  insert into public.notifications(recipient_username,notification_type,feature_key,feature_message,feature_path)
   select r.username,'feature',source,msg,'/betting' where not exists(select 1 from public.notifications where recipient_username=r.username and notification_type='feature' and feature_key=source);
 end loop;
 for r in select b.username,b.balance,sum(c.delta) delta from accounting_wallets_before b join accounting_posted c on c.username=b.username group by b.username,b.balance loop
  if (select balance from public.coin_accounts where username=r.username)<>r.balance+r.delta then raise exception 'Wallet correction mismatch for %',r.username; end if;
 end loop;
end;
$$;
commit;
select jsonb_build_object('corrections',(select count(*) from public.coin_transactions where reason='prediction_reconciliation' and metadata->>'auditVersion'='prediction-accounting-v1'),'netChange',(select sum(amount) from public.coin_transactions where reason='prediction_reconciliation' and metadata->>'auditVersion'='prediction-accounting-v1')) as result;
'''

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--snapshot', type=Path)
    parser.add_argument('--report', type=Path, required=True)
    parser.add_argument('--write-sql', type=Path)
    args = parser.parse_args()
    data = json.loads(args.snapshot.read_text()) if args.snapshot else load_live()
    report = audit(data)
    args.report.write_text(json.dumps(report, default=str, indent=2))
    if args.write_sql:
        args.write_sql.write_text(correction_sql(report))
    print(json.dumps({key: value for key, value in report.items() if key != 'settlements'}, default=str))

if __name__ == '__main__':
    main()
